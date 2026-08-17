create table public.order_refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  shopify_refund_id bigint not null,
  amount numeric(14,2) not null default 0 check (amount >= 0),
  shopify_created_at timestamptz,
  created_at timestamptz not null default now(),
  unique (order_id, shopify_refund_id)
);

create index order_refunds_order_id_idx on public.order_refunds (order_id);
alter table public.order_refunds enable row level security;
create policy order_refunds_select_accessible on public.order_refunds for select to authenticated
using (exists (
  select 1 from public.orders
  where orders.id = order_refunds.order_id
    and (select private.has_store_access(orders.store_id))
));
revoke all on public.order_refunds from anon, authenticated;
grant select on public.order_refunds to authenticated;
grant all on public.order_refunds to service_role;
