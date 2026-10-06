-- ============================================================================
-- DepositLock — 0001 schema
--
-- Every table exists, every table has RLS enabled, the seed produced the story
-- the rest of the suite asserts against, and the CHECK constraints that stand
-- in for PG enums are live.
--
-- Constraint assertions run as the migration role (`postgres`): constraints
-- are not role-dependent, and the guards deliberately allow an absent identity
-- so migrations and seed data behave identically in every environment.
-- ============================================================================

begin;

set local search_path = "$user", public, extensions;

create extension if not exists pgtap with schema extensions;

select plan(30);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'properties', 'properties table exists');
select has_table('public', 'tenancies', 'tenancies table exists');
select has_table('public', 'tenancy_participants', 'tenancy_participants table exists');
select has_table('public', 'deductions', 'deductions table exists');
select has_table('public', 'evidence', 'evidence table exists');
select has_table('public', 'disputes', 'disputes table exists');
select has_table('public', 'settlements', 'settlements table exists');
select has_table('public', 'activity_events', 'activity_events table exists');
select has_table('public', 'notifications', 'notifications table exists');

select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'RLS enabled on profiles');
select ok((select relrowsecurity from pg_class where oid = 'public.properties'::regclass), 'RLS enabled on properties');
select ok((select relrowsecurity from pg_class where oid = 'public.tenancies'::regclass), 'RLS enabled on tenancies');
select ok((select relrowsecurity from pg_class where oid = 'public.tenancy_participants'::regclass), 'RLS enabled on tenancy_participants');
select ok((select relrowsecurity from pg_class where oid = 'public.deductions'::regclass), 'RLS enabled on deductions');
select ok((select relrowsecurity from pg_class where oid = 'public.evidence'::regclass), 'RLS enabled on evidence');
select ok((select relrowsecurity from pg_class where oid = 'public.disputes'::regclass), 'RLS enabled on disputes');
select ok((select relrowsecurity from pg_class where oid = 'public.settlements'::regclass), 'RLS enabled on settlements');
select ok((select relrowsecurity from pg_class where oid = 'public.activity_events'::regclass), 'RLS enabled on activity_events');
select ok((select relrowsecurity from pg_class where oid = 'public.notifications'::regclass), 'RLS enabled on notifications');

select has_view('public', 'v_shared_profiles', 'shared profile projection exists');

-- Seed shape -----------------------------------------------------------------

select is(
  (select count(*)::text from public.profiles),
  '4',
  'seed creates four profiles'
);
select is(
  (select count(*)::text from public.tenancies),
  '2',
  'seed creates two tenancies'
);
select is(
  (select count(*)::text from public.tenancy_participants),
  '4',
  'the participant graph mirrors the tenancy contracts'
);
select is(
  (select count(*)::text from public.evidence),
  '3',
  'seed captures three move-in evidence rows'
);
select is(
  (select count(*)::text from public.activity_events),
  '7',
  'seed records seven timeline events'
);
select is(
  (select count(*)::text from public.notifications),
  '3',
  'seed records three notifications'
);

-- Constraints ----------------------------------------------------------------

select throws_ok(
  $sql$insert into public.tenancies
       (property_id, landlord_profile_id, tenant_profile_id, start_date,
        monthly_rent_amount, deposit_amount, status)
       values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
               '11111111-1111-4111-8111-111111111111',
               '22222222-2222-4222-8222-222222222222',
               date '2026-12-01', 1000, 900, 'bogus') returning id$sql$,
  '23514',
  null,
  'an unknown tenancy status is rejected by the CHECK constraint'
);

select throws_ok(
  $sql$insert into public.tenancies
       (property_id, landlord_profile_id, tenant_profile_id, start_date,
        monthly_rent_amount, deposit_amount, status)
       values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
               '11111111-1111-4111-8111-111111111111',
               '11111111-1111-4111-8111-111111111111',
               date '2026-12-01', 1000, 900, 'draft') returning id$sql$,
  '23514',
  null,
  'a tenancy cannot name the same profile as both parties'
);

select throws_ok(
  $sql$insert into public.settlements
       (tenancy_id, original_deposit_amount, tenant_amount, landlord_amount,
        settlement_type)
       values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc',
               1800, 900, 800, 'partial_deduction') returning id$sql$,
  '23514',
  null,
  'a settlement split must add back up to the original deposit'
);

select * from finish();

rollback;
