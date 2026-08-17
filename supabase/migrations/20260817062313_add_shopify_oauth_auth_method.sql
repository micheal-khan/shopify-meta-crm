alter table private.shopify_connections
  drop constraint if exists shopify_connections_auth_method_check;

alter table private.shopify_connections
  add constraint shopify_connections_auth_method_check
  check (auth_method in ('legacy_access_token', 'client_credentials', 'authorization_code'));

comment on column private.shopify_connections.auth_method is
  'Shopify access-token acquisition method: legacy static token, client credentials, or authorization code.';
