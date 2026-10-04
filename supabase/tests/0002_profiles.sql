-- ============================================================================
-- DepositLock — 0002 profile access
--
-- Identity is simulated the way PostgREST does it: `request.jwt.claims` carries
-- the profile id as `sub`, and the session role is `authenticated` — a role that
-- owns nothing and therefore cannot bypass RLS. Nothing here is granted extra
-- rights to make the test pass.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

-- Runs `p_sql` as the given profile. The statement must return exactly one
-- value; a row filtered away by RLS comes back as NULL.
create or replace function pg_temp.acting(p_profile uuid, p_sql text)
returns text
language plpgsql
as $$
declare
  v_value text;
begin
  v_value := null;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_profile, 'role', 'authenticated')::text,
    true
  );
  perform set_config('request.jwt.claim.sub', p_profile::text, true);
  set local role authenticated;
  execute p_sql into v_value;
  reset role;
  return v_value;
exception when others then
  reset role;
  raise;
end;
$$;

-- Runs `p_sql` as a signed-out visitor.
create or replace function pg_temp.anon(p_sql text)
returns text
language plpgsql
as $$
declare
  v_value text;
begin
  v_value := null;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role authenticated;
  execute p_sql into v_value;
  reset role;
  return v_value;
exception when others then
  reset role;
  raise;
end;
$$;

-- Visibility -----------------------------------------------------------------

select is(
  pg_temp.acting('11111111-1111-4111-8111-111111111111', $sql$select count(*)::text from public.profiles$sql$),
  '1',
  'a profile sees only its own row on profiles'
);

select is(
  pg_temp.acting('44444444-4444-4444-8444-444444444444', $sql$select count(*)::text from public.profiles$sql$),
  '1',
  'a profile with no tenancy still sees its own row'
);

select is(
  pg_temp.anon($sql$select count(*)::text from public.profiles$sql$),
  '0',
  'a signed-out visitor sees no profiles at all'
);

-- Updates --------------------------------------------------------------------

select is(
  pg_temp.acting('11111111-1111-4111-8111-111111111111', $sql$update public.profiles set full_name = 'Sarah B.' where id = '22222222-2222-4222-8222-222222222222'::uuid returning id::text$sql$),
  null,
  'a profile cannot edit someone else''s row'
);

select is(
  pg_temp.acting('11111111-1111-4111-8111-111111111111', $sql$update public.profiles set full_name = 'Sarah Byrne' where id = '11111111-1111-4111-8111-111111111111'::uuid returning id::text$sql$),
  '11111111-1111-4111-8111-111111111111',
  'a profile can edit its own row'
);

-- Email stays private --------------------------------------------------------

select is(
  pg_temp.acting('11111111-1111-4111-8111-111111111111', $sql$select email::text from public.profiles where id = '22222222-2222-4222-8222-222222222222'::uuid$sql$),
  null,
  'another profile''s email is not readable from the profiles table'
);

select is(
  pg_temp.acting('11111111-1111-4111-8111-111111111111', $sql$select count(*)::text from public.v_shared_profiles$sql$),
  '3',
  'the shared projection exposes self plus both co-participants'
);

select is(
  pg_temp.acting('44444444-4444-4444-8444-444444444444', $sql$select count(*)::text from public.v_shared_profiles$sql$),
  '1',
  'a profile with no tenancy only ever sees itself in the projection'
);

select is(
  (select count(*)::text
     from information_schema.columns
    where table_name = 'v_shared_profiles'
      and column_name = 'email'),
  '0',
  'the shared projection has no email column to leak through'
);

-- Writes ---------------------------------------------------------------------

select throws_ok(
  $sql$select pg_temp.acting('44444444-4444-4444-8444-444444444444', $q$insert into public.profiles (id, full_name, email, wallet_address) values ('55555555-5555-4555-8555-555555555555', 'Test Person', 'test.person@example.ie', 'DEVWALLET-00000000000000000000TEST00001') returning id::text$q$)$sql$,
  '42501',
  null,
  'a profile cannot insert a row for someone else'
);

select * from finish();

rollback;
