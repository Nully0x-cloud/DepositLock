-- ============================================================================
-- DepositLock — 0003 tenancy access
--
-- Reads are participant-only, contract fields freeze once the tenancy leaves
-- `draft`/`awaiting_tenant`, and the participant graph is written by trigger
-- rather than by hand.
-- ============================================================================

begin;

set local search_path = "$user", public, extensions;

create extension if not exists pgtap with schema extensions;

select plan(15);

-- Runs `p_sql` as the given profile. Used for statements whose `RETURNING`
-- clause would otherwise be filtered: a freshly inserted tenancy is only
-- visible to its participants once the `tenancy_participants` rows exist, and
-- PostgreSQL applies SELECT policies to `RETURNING` rows.
create or replace function pg_temp.act(p_profile uuid, p_sql text)
returns text
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_profile, 'role', 'authenticated')::text,
    true
  );
  perform set_config('request.jwt.claim.sub', p_profile::text, true);
  set local role authenticated;
  execute p_sql;
  reset role;
  return 'done';
exception when others then
  reset role;
  raise;
end;
$$;

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

-- Reads ----------------------------------------------------------------------

select is(
  pg_temp.acting('11111111-1111-4111-8111-111111111111', $sql$select count(*)::text from public.tenancies$sql$),
  '2',
  'a landlord and tenant sees both of its tenancies'
);

select is(
  pg_temp.acting('44444444-4444-4444-8444-444444444444', $sql$select count(*)::text from public.tenancies$sql$),
  '0',
  'a profile with no tenancy sees no tenancies'
);

select is(
  pg_temp.acting('33333333-3333-4333-8333-333333333333', $sql$select count(*)::text from public.tenancies$sql$),
  '1',
  'the tenant of the second tenancy sees exactly one tenancy'
);

select is(
  pg_temp.acting('11111111-1111-4111-8111-111111111111', $sql$select count(*)::text from public.properties$sql$),
  '2',
  'related properties are readable through either tenancy'
);

select is(
  pg_temp.acting('44444444-4444-4444-8444-444444444444', $sql$select count(*)::text from public.properties$sql$),
  '0',
  'unrelated properties stay invisible'
);

-- Updates --------------------------------------------------------------------

select is(
  pg_temp.acting('44444444-4444-4444-8444-444444444444', $sql$update public.tenancies set status = 'cancelled' where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid returning id::text$sql$),
  null,
  'a non-participant cannot touch a tenancy'
);

select throws_ok(
  $sql$update public.tenancies set deposit_amount = 1000
       where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid
       returning id$sql$,
  '23514',
  null,
  'contract fields are frozen once the tenancy is protected'
);

select throws_ok(
  $sql$select pg_temp.acting('11111111-1111-4111-8111-111111111111', $q$update public.tenancies set status = 'draft' where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid returning id::text$q$)$sql$,
  '42501',
  null,
  'participants cannot write tenancy lifecycle states directly'
);

-- Inserts --------------------------------------------------------------------

select throws_ok(
  $sql$select pg_temp.acting('11111111-1111-4111-8111-111111111111', $q$insert into public.tenancies (property_id, landlord_profile_id, tenant_profile_id, start_date, monthly_rent_amount, deposit_amount, status) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', date '2027-01-01', 1000, 900, 'draft') returning id::text$q$)$sql$,
  '42501',
  null,
  'you may only create a tenancy in which you are the landlord'
);

-- Participant graph ----------------------------------------------------------

select is(
  pg_temp.acting('11111111-1111-4111-8111-111111111111', $sql$select count(*)::text from public.tenancy_participants$sql$),
  '4',
  'participants of both of its tenancies are visible'
);

select is(
  pg_temp.acting('44444444-4444-4444-8444-444444444444', $sql$select count(*)::text from public.tenancy_participants$sql$),
  '0',
  'an outsider sees no participant rows'
);

select is(
  pg_temp.acting('44444444-4444-4444-8444-444444444444', $sql$delete from public.tenancies where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid returning id::text$sql$),
  null,
  'an outsider cannot delete a tenancy'
);

-- Constraints and guards -----------------------------------------------------

select throws_ok(
  $sql$insert into public.tenancies
       (property_id, landlord_profile_id, tenant_profile_id, start_date,
        end_date, monthly_rent_amount, deposit_amount, status)
       values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
               '11111111-1111-4111-8111-111111111111',
               '33333333-3333-4333-8333-333333333333',
               date '2027-06-01', date '2027-01-01', 1000, 900, 'draft')
       returning id$sql$,
  '23514',
  null,
  'a tenancy cannot end before it starts'
);

select throws_ok(
  $sql$insert into public.tenancy_participants
       (tenancy_id, profile_id, role, status)
       values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc',
               '44444444-4444-4444-8444-444444444444',
               'tenant', 'accepted') returning id$sql$,
  '23514',
  null,
  'the participant graph rejects anyone outside the contract'
);

select is(
  pg_temp.act('11111111-1111-4111-8111-111111111111', $sql$insert into public.tenancies (property_id, landlord_profile_id, tenant_profile_id, start_date, monthly_rent_amount, deposit_amount, status) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333', date '2027-01-01', 1000, 900, 'draft')$sql$),
  'done',
  'a landlord can create a tenancy in the draft state'
);

select * from finish();

rollback;
