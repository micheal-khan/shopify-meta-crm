grant usage on schema private to service_role;
grant select, insert, update, delete on all tables in schema private to service_role;
grant usage, select on all sequences in schema private to service_role;

alter default privileges in schema private
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema private
  grant usage, select on sequences to service_role;

alter role authenticator set pgrst.db_schemas = 'public, private';
notify pgrst, 'reload config';
