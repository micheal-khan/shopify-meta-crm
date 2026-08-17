alter table private.shopify_connections
  add column client_id text,
  add column encrypted_client_secret text,
  add column token_expires_at timestamptz,
  add column token_refreshed_at timestamptz,
  add column auth_method text not null default 'legacy_access_token'
    check (auth_method in ('legacy_access_token', 'client_credentials'));

update private.shopify_connections
set encrypted_client_secret = webhook_secret_ciphertext
where encrypted_client_secret is null;

comment on column private.shopify_connections.client_id is 'Shopify Dev Dashboard app Client ID.';
comment on column private.shopify_connections.encrypted_client_secret is 'AES-GCM encrypted Shopify Dev Dashboard app Client Secret.';
comment on column private.shopify_connections.encrypted_access_token is 'Cached Admin API token. Client-credentials tokens expire after 24 hours and are renewed server-side.';
comment on column private.shopify_connections.token_expires_at is 'Expiry returned by Shopify client credentials grant.';
