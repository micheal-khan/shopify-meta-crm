create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.app_role as enum ('admin', 'operator', 'viewer');
create type public.connection_status as enum ('pending', 'connected', 'error', 'disabled');
create type public.order_status as enum ('open', 'fulfilled', 'cancelled', 'refunded', 'partially_refunded');
create type public.meta_event_status as enum ('queued', 'processing', 'sent', 'failed', 'suppressed');
create type public.notification_level as enum ('info', 'warning', 'error', 'success');
create type public.webhook_status as enum ('received', 'processing', 'processed', 'failed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role public.app_role not null default 'viewer',
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  shop_domain text not null unique check (shop_domain ~ '^[a-z0-9][a-z0-9-]*\.myshopify\.com$'),
  currency char(3) not null default 'INR',
  timezone text not null default 'Asia/Kolkata',
  status public.connection_status not null default 'pending',
  historical_sync_days smallint not null default 30 check (historical_sync_days between 1 and 365),
  send_new_orders_to_meta boolean not null default false,
  last_shopify_sync_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.store_members (
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (store_id, user_id)
);

create table private.shopify_connections (
  store_id uuid primary key references public.stores(id) on delete cascade,
  encrypted_access_token text not null,
  webhook_secret_ciphertext text not null,
  scopes text[] not null default '{}',
  shopify_api_version text not null,
  installed_at timestamptz not null default now(),
  rotated_at timestamptz
);

create table private.meta_connections (
  store_id uuid primary key references public.stores(id) on delete cascade,
  dataset_id text not null,
  encrypted_access_token text not null,
  graph_api_version text not null,
  test_event_code text,
  production_send_enabled boolean not null default false,
  connected_at timestamptz not null default now(),
  rotated_at timestamptz
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  shopify_order_id bigint not null,
  shopify_order_number text not null,
  status public.order_status not null default 'open',
  financial_status text,
  fulfillment_status text,
  source_name text,
  currency char(3) not null,
  subtotal numeric(14,2) not null default 0,
  discount_total numeric(14,2) not null default 0,
  shipping_total numeric(14,2) not null default 0,
  tax_total numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  refunded_total numeric(14,2) not null default 0,
  item_count integer not null default 0 check (item_count >= 0),
  is_cod boolean not null default false,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  landing_site text,
  referring_site text,
  shopify_created_at timestamptz not null,
  cancelled_at timestamptz,
  closed_at timestamptz,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, shopify_order_id)
);

create table private.order_details (
  order_id uuid primary key references public.orders(id) on delete cascade,
  customer_shopify_id bigint,
  email text,
  phone text,
  customer_first_name text,
  customer_last_name text,
  billing_address jsonb,
  shipping_address jsonb,
  client_ip inet,
  user_agent text,
  fbp text,
  fbc text,
  shopify_payload jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  shopify_line_item_id bigint not null,
  product_id bigint,
  variant_id bigint,
  title text not null,
  variant_title text,
  sku text,
  quantity integer not null check (quantity > 0),
  unit_price numeric(14,2) not null default 0,
  total_discount numeric(14,2) not null default 0,
  unique (order_id, shopify_line_item_id)
);

create table public.meta_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  event_name text not null default 'Purchase',
  event_id text not null,
  status public.meta_event_status not null default 'queued',
  attempt_count smallint not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  sent_at timestamptz,
  response_code integer,
  response_message text,
  meta_trace_id text,
  is_test boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, event_id)
);

create table private.meta_event_payloads (
  event_id uuid primary key references public.meta_events(id) on delete cascade,
  payload jsonb not null,
  payload_sha256 text not null,
  created_at timestamptz not null default now()
);

create table public.shopify_webhooks (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  shopify_webhook_id text not null,
  topic text not null,
  status public.webhook_status not null default 'received',
  payload_sha256 text not null,
  attempt_count smallint not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  processed_at timestamptz,
  error_message text,
  received_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, shopify_webhook_id)
);

create table private.shopify_webhook_payloads (
  webhook_id uuid primary key references public.shopify_webhooks(id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table public.sync_checkpoints (
  store_id uuid not null references public.stores(id) on delete cascade,
  resource text not null,
  cursor text,
  synced_through timestamptz,
  last_successful_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  primary key (store_id, resource)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  store_id uuid references public.stores(id) on delete cascade,
  level public.notification_level not null default 'info',
  title text not null,
  message text not null,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  store_id uuid references public.stores(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index profiles_invited_by_idx on public.profiles (invited_by);
create index stores_created_by_idx on public.stores (created_by);
create index store_members_user_id_idx on public.store_members (user_id);
create index orders_store_created_idx on public.orders (store_id, shopify_created_at desc);
create index orders_store_status_created_idx on public.orders (store_id, status, shopify_created_at desc);
create index orders_utm_campaign_idx on public.orders (store_id, utm_campaign, shopify_created_at desc) where utm_campaign is not null;
create index order_items_order_id_idx on public.order_items (order_id);
create index meta_events_order_id_idx on public.meta_events (order_id);
create index meta_events_ready_idx on public.meta_events (next_attempt_at, created_at) where status in ('queued', 'failed');
create index meta_events_store_status_idx on public.meta_events (store_id, status, created_at desc);
create index shopify_webhooks_ready_idx on public.shopify_webhooks (next_attempt_at, received_at) where status in ('received', 'failed');
create index shopify_webhooks_store_status_idx on public.shopify_webhooks (store_id, status, received_at desc);
create index notifications_user_unread_idx on public.notifications (user_id, created_at desc) where read_at is null;
create index notifications_store_id_idx on public.notifications (store_id);
create index audit_logs_actor_id_idx on public.audit_logs (actor_id);
create index audit_logs_store_created_idx on public.audit_logs (store_id, created_at desc);

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

create or replace function private.has_store_access(requested_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.is_admin()) or exists (
    select 1 from public.store_members
    where store_id = requested_store_id and user_id = (select auth.uid())
  );
$$;

revoke execute on function private.is_admin() from public, anon;
revoke execute on function private.has_store_access(uuid) from public, anon;
grant usage on schema private to authenticated, service_role;
grant execute on function private.is_admin() to authenticated, service_role;
grant execute on function private.has_store_access(uuid) to authenticated, service_role;

alter table public.profiles enable row level security;
alter table public.stores enable row level security;
alter table public.store_members enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.meta_events enable row level security;
alter table public.shopify_webhooks enable row level security;
alter table public.sync_checkpoints enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_select_self_or_admin on public.profiles for select to authenticated
using (id = (select auth.uid()) or (select private.is_admin()));
create policy stores_select_accessible on public.stores for select to authenticated
using ((select private.has_store_access(id)));
create policy store_members_select_accessible on public.store_members for select to authenticated
using (user_id = (select auth.uid()) or (select private.is_admin()));
create policy orders_select_accessible on public.orders for select to authenticated
using ((select private.has_store_access(store_id)));
create policy order_items_select_accessible on public.order_items for select to authenticated
using (exists (
  select 1 from public.orders
  where orders.id = order_items.order_id
    and (select private.has_store_access(orders.store_id))
));
create policy meta_events_select_accessible on public.meta_events for select to authenticated
using ((select private.has_store_access(store_id)));
create policy shopify_webhooks_select_accessible on public.shopify_webhooks for select to authenticated
using ((select private.has_store_access(store_id)));
create policy sync_checkpoints_select_accessible on public.sync_checkpoints for select to authenticated
using ((select private.has_store_access(store_id)));
create policy notifications_select_own on public.notifications for select to authenticated
using (user_id = (select auth.uid()));
create policy notifications_update_own on public.notifications for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
create policy audit_logs_select_admin on public.audit_logs for select to authenticated
using ((select private.is_admin()));

revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to authenticated, service_role;
grant select on public.profiles, public.stores, public.store_members, public.orders,
  public.order_items, public.meta_events, public.shopify_webhooks, public.sync_checkpoints,
  public.notifications, public.audit_logs to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all tables in schema private to service_role;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema private revoke all on tables from public, anon, authenticated;

comment on table private.order_details is 'PII and raw Shopify payloads; server-side access only.';
comment on table private.meta_event_payloads is 'Hashed Meta event payloads; server-side access only.';
comment on table private.shopify_webhook_payloads is 'Raw Shopify webhook payloads, which can contain PII; server-side access only.';
comment on column public.stores.send_new_orders_to_meta is 'Fail-closed. Enable only after Test Events and deduplication validation.';
comment on column private.meta_connections.production_send_enabled is 'Second server-side safety gate for live Meta CAPI delivery.';
