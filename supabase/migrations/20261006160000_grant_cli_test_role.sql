-- The Supabase CLI runs remote pgTAP suites as the scoped login role
-- "cli_login_postgres" (created server-side by POST /v1/projects/{ref}/cli/login-role).
-- That role is created without USAGE on schema extensions, which makes every
-- test file fail on "function plan(integer) does not exist" because pgTAP
-- lives in the extensions schema. Grant the minimum privilege required to
-- look up pgTAP functions; skipped automatically on databases (e.g. local
-- dev) where the CLI role does not exist.
do $$
begin
  if to_regrole('cli_login_postgres') is not null then
    execute 'grant usage on schema extensions to cli_login_postgres';
  else
    raise notice 'cli_login_postgres not present; skipping grant';
  end if;
end
$$;
