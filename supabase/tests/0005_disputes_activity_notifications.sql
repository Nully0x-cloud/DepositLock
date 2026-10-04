-- ============================================================================
-- DepositLock — 0005 disputes, activity timeline, notifications
--
-- Disputes only ever come from a challenged deduction, the timeline is
-- append-only, and notifications are a per-profile inbox with no client-side
-- insert path.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

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

-- Fixtures: one deduction the tenant has already challenged, one still open.

insert into public.deductions
  (id, tenancy_id, proposed_by_profile_id, amount, reason_category,
   description, status, responded_at)
values
  ('d0000001-0000-4000-8000-000000000001',
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
   '22222222-2222-4222-8222-222222222222',
   300.00, 'damage', 'Scuffed kitchen cabinet door', 'proposed', null),
  ('d0000003-0000-4000-8000-000000000001',
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
   '22222222-2222-4222-8222-222222222222',
   300.00, 'damage', 'Damaged wardrobe door', 'challenged', now());

-- Disputes -------------------------------------------------------------------

select is(
  pg_temp.acting('11111111-1111-4111-8111-111111111111', $sql$select count(*)::text from public.disputes$sql$),
  '0',
  'the tenancy starts with no dispute'
);

select ok(
  pg_temp.acting('11111111-1111-4111-8111-111111111111', $sql$insert into public.disputes (tenancy_id, deduction_id, opened_by_profile_id, reason) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'd0000003-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'The wardrobe was already damaged at move-in') returning id::text$sql$) is not null,
  'the tenant can open a dispute against a challenged deduction'
);

select throws_ok(
  $sql$select pg_temp.acting('22222222-2222-4222-8222-222222222222', $q$insert into public.disputes (tenancy_id, deduction_id, opened_by_profile_id, reason) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'd0000003-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'Second dispute on the same deduction') returning id::text$q$)$sql$,
  '23505',
  null,
  'only one active dispute may exist per deduction'
);

select throws_ok(
  $sql$select pg_temp.acting('11111111-1111-4111-8111-111111111111', $q$insert into public.disputes (tenancy_id, deduction_id, opened_by_profile_id, reason) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'd0000001-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Dispute against an unchallenged deduction') returning id::text$q$)$sql$,
  '23514',
  null,
  'a dispute can only open against a challenged deduction'
);

select throws_ok(
  $sql$select pg_temp.acting('44444444-4444-4444-8444-444444444444', $q$insert into public.disputes (tenancy_id, deduction_id, opened_by_profile_id, reason) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'd0000003-0000-4000-8000-000000000001', '44444444-4444-4444-8444-444444444444', 'An outsider disputes someone else''s deduction') returning id::text$q$)$sql$,
  '23503',
  null,
  'an outsider cannot even resolve a deduction to dispute'
);

select is(
  pg_temp.acting('44444444-4444-4444-8444-444444444444', $sql$select count(*)::text from public.disputes$sql$),
  '0',
  'an outsider sees no disputes'
);

-- Activity timeline ----------------------------------------------------------

select ok(
  pg_temp.acting('11111111-1111-4111-8111-111111111111', $sql$insert into public.activity_events (tenancy_id, actor_profile_id, event_type, title, description) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '11111111-1111-4111-8111-111111111111', 'evidence_added', 'Move-out evidence added', 'Photographs of the kitchen and hallway') returning id::text$sql$) is not null,
  'a participant can append to its own timeline'
);

select throws_ok(
  $sql$select pg_temp.acting('44444444-4444-4444-8444-444444444444', $q$insert into public.activity_events (tenancy_id, actor_profile_id, event_type, title) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '44444444-4444-4444-8444-444444444444', 'evidence_added', 'Outsider timeline entry') returning id::text$q$)$sql$,
  '42501',
  null,
  'an outsider cannot append to someone else''s timeline'
);

select throws_ok(
  $sql$select pg_temp.acting('11111111-1111-4111-8111-111111111111', $q$insert into public.activity_events (tenancy_id, actor_profile_id, event_type, title) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '22222222-2222-4222-8222-222222222222', 'tenant_accepted', 'Impersonated event') returning id::text$q$)$sql$,
  '42501',
  null,
  'an event can only be attributed to the acting profile'
);

select throws_ok(
  $sql$select pg_temp.acting('11111111-1111-4111-8111-111111111111', $q$update public.activity_events set title = 'Edited' where id = 'e0000001-0000-4000-8000-000000000001'::uuid returning id::text$q$)$sql$,
  '42501',
  null,
  'the timeline is append-only for clients'
);

-- Notifications --------------------------------------------------------------

select is(
  pg_temp.acting('11111111-1111-4111-8111-111111111111', $sql$select count(*)::text from public.notifications$sql$),
  '1',
  'a profile only sees its own notifications'
);

select is(
  pg_temp.acting('44444444-4444-4444-8444-444444444444', $sql$select count(*)::text from public.notifications$sql$),
  '0',
  'a profile with no notifications sees an empty inbox'
);

select is(
  pg_temp.acting('11111111-1111-4111-8111-111111111111', $sql$update public.notifications set read_at = now() where id = '90000001-0000-4000-8000-000000000001'::uuid returning id::text$sql$),
  '90000001-0000-4000-8000-000000000001',
  'a profile can mark its own notification as read'
);

select throws_ok(
  $sql$select pg_temp.acting('44444444-4444-4444-8444-444444444444', $q$insert into public.notifications (profile_id, tenancy_id, type, title, body) values ('44444444-4444-4444-8444-444444444444', null, 'system', 'Self-authored notification', null) returning id::text$q$)$sql$,
  '42501',
  null,
  'clients cannot write notifications themselves'
);

select is(
  pg_temp.acting('11111111-1111-4111-8111-111111111111', $sql$update public.notifications set read_at = now() where id = '90000001-0000-4000-8000-000000000002'::uuid returning id::text$sql$),
  null,
  'a profile cannot mark someone else''s notification as read'
);

select * from finish();

rollback;
