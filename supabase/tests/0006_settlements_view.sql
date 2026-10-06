-- ============================================================================
-- DepositLock — 0006 settlements and the shared profile projection
--
-- Settlements are read-only from the client: RLS exposes them to participants
-- and the privileges revoke every write, because those rows are produced by
-- the service layer / on-chain reconciliation in a later phase.
-- ============================================================================

begin;

set local search_path = "$user", public, extensions;

create extension if not exists pgtap with schema extensions;

select plan(11);

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

-- Fixture: the protected Camden Street tenancy has settled 1,500 back to the
-- tenant and 300 to the landlord — a split that adds up to the 1,800 deposit.

insert into public.settlements
  (id, tenancy_id, original_deposit_amount, tenant_amount, landlord_amount,
   settlement_type, tenant_approved, landlord_approved, settled_at)
values
  ('50000001-0000-4000-8000-000000000001',
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
   1800, 1500, 300, 'partial_deduction', true, true, now());

-- Read access ----------------------------------------------------------------

select is(
  pg_temp.acting('11111111-1111-4111-8111-111111111111', $sql$select count(*)::text from public.settlements$sql$),
  '1',
  'a participant can read the settlement of its own tenancy'
);

select is(
  pg_temp.acting('44444444-4444-4444-8444-444444444444', $sql$select count(*)::text from public.settlements$sql$),
  '0',
  'an outsider cannot read a settlement'
);

-- No client writes -----------------------------------------------------------

select throws_ok(
  $sql$select pg_temp.acting('11111111-1111-4111-8111-111111111111', $q$insert into public.settlements (tenancy_id, original_deposit_amount, tenant_amount, landlord_amount, settlement_type) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 1800, 1800, 0, 'full_return') returning id::text$q$)$sql$,
  '42501',
  null,
  'a client cannot create a settlement'
);

select throws_ok(
  $sql$select pg_temp.acting('11111111-1111-4111-8111-111111111111', $q$update public.settlements set tenant_amount = 1800, landlord_amount = 0 where id = '50000001-0000-4000-8000-000000000001'::uuid returning id::text$q$)$sql$,
  '42501',
  null,
  'a client cannot rewrite a settlement'
);

select throws_ok(
  $sql$select pg_temp.acting('11111111-1111-4111-8111-111111111111', $q$delete from public.settlements where id = '50000001-0000-4000-8000-000000000001'::uuid returning id::text$q$)$sql$,
  '42501',
  null,
  'a client cannot delete a settlement'
);

-- Invariants (migration role: constraints are role-independent) --------------

select throws_ok(
  $sql$insert into public.settlements
       (tenancy_id, original_deposit_amount, tenant_amount, landlord_amount,
        settlement_type)
       values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd',
               1200, 700, 400, 'partial_deduction') returning id$sql$,
  '23514',
  null,
  'a split that does not add up to the deposit is rejected'
);

select throws_ok(
  $sql$insert into public.settlements
       (tenancy_id, original_deposit_amount, tenant_amount, landlord_amount,
        settlement_type)
       values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc',
               1000, 1000, 0, 'full_return') returning id$sql$,
  '23514',
  null,
  'the original deposit must match the tenancy deposit'
);

select throws_ok(
  $sql$update public.settlements
       set tenant_amount = 1700, landlord_amount = 100
       where id = '50000001-0000-4000-8000-000000000001'::uuid
       returning id$sql$,
  '23514',
  null,
  'a settled settlement is immutable'
);

-- Shared profile projection --------------------------------------------------

select is(
  pg_temp.acting('11111111-1111-4111-8111-111111111111', $sql$select count(*)::text from public.v_shared_profiles where full_name = 'Michael O''Connor'$sql$),
  '1',
  'a co-participant is visible by name through the projection'
);

select is(
  pg_temp.acting('11111111-1111-4111-8111-111111111111', $sql$select count(*)::text from public.v_shared_profiles where id = '44444444-4444-4444-8444-444444444444'::uuid$sql$),
  '0',
  'a profile that shares no tenancy is not projected'
);

select is(
  pg_temp.anon($sql$select count(*)::text from public.v_shared_profiles$sql$),
  '0',
  'a signed-out visitor sees no one through the projection'
);

select * from finish();

rollback;
