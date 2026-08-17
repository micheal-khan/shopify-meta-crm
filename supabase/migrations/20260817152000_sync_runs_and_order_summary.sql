create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  resource text not null default 'orders',
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  total_items integer,
  processed_items integer not null default 0 check (processed_items >= 0),
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sync_runs_store_created_idx on public.sync_runs (store_id, created_at desc);
create unique index sync_runs_one_active_idx on public.sync_runs (store_id, resource)
where status in ('queued', 'running');

alter table public.sync_runs enable row level security;

create policy sync_runs_select_accessible on public.sync_runs for select to authenticated
using ((select private.has_store_access(store_id)));

revoke all on public.sync_runs from anon, authenticated;
grant select on public.sync_runs to authenticated;
grant all on public.sync_runs to service_role;

create or replace function public.order_summary_for_stores(
  requested_store_ids uuid[],
  since_at timestamptz
)
returns table (
  order_count bigint,
  gross numeric,
  refunded numeric,
  cancelled numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    count(*)::bigint,
    coalesce(sum(orders.total), 0),
    coalesce(sum(orders.refunded_total), 0),
    coalesce(sum(orders.total) filter (where orders.status = 'cancelled'), 0)
  from public.orders
  where orders.store_id = any(requested_store_ids)
    and orders.shopify_created_at >= since_at;
$$;

revoke all on function public.order_summary_for_stores(uuid[], timestamptz) from public, anon, authenticated;
grant execute on function public.order_summary_for_stores(uuid[], timestamptz) to service_role;
