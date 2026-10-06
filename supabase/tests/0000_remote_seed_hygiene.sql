-- Remote data hygiene: scripts/verify-siws.mjs signs in with a fixed dev
-- wallet and creates a throwaway profile row ("SIWS Check", deterministic
-- auth uid 64523bde-dc8a-46a2-85fa-576367bc8817) that has no DELETE policy.
-- That row must not break the seed-shape assertions in 0001_schema.sql, so
-- this file sorts first and removes it before the suite runs. Unlike the
-- other test files it COMMITS its delete (and rolls nothing back). Locally
-- the row never exists, so the delete is a no-op.
begin;
set local search_path = "$user", public, extensions;
delete from public.profiles where id = '64523bde-dc8a-46a2-85fa-576367bc8817';
select plan(1);
select ok(true, 'siws probe profile removed before seed-shape assertions');
select * from finish();
commit;
