-- ============================================================================
-- DepositLock — 0004 evidence and deductions
--
-- Two layers guard the money path:
--   * RLS decides who may read/write at all (participant vs landlord);
--   * `guard_deduction` / `guard_evidence_uploader` decide what a write may
--     contain — proposer identity, deposit ceiling, who responds and when.
--
-- Every assertion below runs as a simulated signed-in profile; the fixtures in
-- the middle are written once as the migration role.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

-- Runs `p_sql` as the given profile. The statement must return exactly one
-- value; a row filtered away by RLS comes back as NULL, and any exception the
-- guards raise is re-raised for pgTAP to classify.
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

-- Fixtures: one proposed deduction on Camden Street, one on Stoneybatter, and
-- one already challenged — the state a dispute can be opened against.

insert into public.deductions
  (id, tenancy_id, proposed_by_profile_id, amount, reason_category,
   description, status, responded_at)
values
  ('d0000001-0000-4000-8000-000000000001',
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
   '22222222-2222-4222-8222-222222222222',
   300.00, 'damage', 'Scuffed kitchen cabinet door', 'proposed', null),
  ('d0000002-0000-4000-8000-000000000001',
   'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
   '11111111-1111-4111-8111-111111111111',
   500.00, 'cleaning', 'Deep clean after move-out', 'proposed', null),
  ('d0000003-0000-4000-8000-000000000001',
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
   '22222222-2222-4222-8222-222222222222',
   300.00, 'damage', 'Damaged wardrobe door', 'challenged', now());

-- Evidence -------------------------------------------------------------------

select is(
  pg_temp.acting('11111111-1111-4111-8111-111111111111', $sql$select count(*)::text from public.evidence$sql$),
  '3',
  'the tenant sees the move-in evidence for its own tenancy'
);

select is(
  pg_temp.acting('44444444-4444-4444-8444-444444444444', $sql$select count(*)::text from public.evidence$sql$),
  '0',
  'an outsider sees no evidence'
);

select ok(
  pg_temp.acting('11111111-1111-4111-8111-111111111111', $sql$insert into public.evidence (tenancy_id, uploaded_by_profile_id, evidence_context, category, file_url, caption) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '11111111-1111-4111-8111-111111111111', 'move_out', 'kitchen', '/evidence/move-out-kitchen.jpg', 'Kitchen at move-out') returning id::text$sql$) is not null,
  'a participant can attach evidence to its own tenancy'
);

select throws_ok(
  $sql$select pg_temp.acting('44444444-4444-4444-8444-444444444444', $q$insert into public.evidence (tenancy_id, uploaded_by_profile_id, evidence_context, category, file_url, caption) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '44444444-4444-4444-8444-444444444444', 'move_out', 'kitchen', '/evidence/x.jpg', 'Not mine') returning id::text$q$)$sql$,
  '23514',
  null,
  'a non-participant cannot attach evidence to a tenancy'
);

select throws_ok(
  $sql$select pg_temp.acting('11111111-1111-4111-8111-111111111111', $q$insert into public.evidence (tenancy_id, uploaded_by_profile_id, evidence_context, category, file_url, caption) values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '33333333-3333-4333-8333-333333333333', 'move_out', 'kitchen', '/evidence/x.jpg', 'Not by me') returning id::text$q$)$sql$,
  '23514',
  null,
  'evidence can only be uploaded by the acting profile'
);

select throws_ok(
  $sql$select pg_temp.acting('11111111-1111-4111-8111-111111111111', $q$insert into public.evidence (tenancy_id, uploaded_by_profile_id, evidence_context, category, caption) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '11111111-1111-4111-8111-111111111111', 'deduction', 'kitchen', 'No deduction linked') returning id::text$q$)$sql$,
  '23514',
  null,
  'deduction evidence must reference a deduction'
);

select throws_ok(
  $sql$select pg_temp.acting('11111111-1111-4111-8111-111111111111', $q$insert into public.evidence (tenancy_id, uploaded_by_profile_id, evidence_context, deduction_id, category, caption) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '11111111-1111-4111-8111-111111111111', 'deduction', 'd0000002-0000-4000-8000-000000000001', 'kitchen', 'Linked to the other tenancy') returning id::text$q$)$sql$,
  '23503',
  null,
  'the composite foreign key keeps deduction evidence on the same tenancy'
);

-- Deductions -----------------------------------------------------------------

select ok(
  pg_temp.acting('22222222-2222-4222-8222-222222222222', $sql$insert into public.deductions (tenancy_id, proposed_by_profile_id, amount, reason_category, description) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '22222222-2222-4222-8222-222222222222', 250, 'cleaning', 'Professional clean required') returning id::text$sql$) is not null,
  'the landlord can propose a deduction inside the deposit'
);

select throws_ok(
  $sql$select pg_temp.acting('11111111-1111-4111-8111-111111111111', $q$insert into public.deductions (tenancy_id, proposed_by_profile_id, amount, reason_category, description) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '11111111-1111-4111-8111-111111111111', 250, 'cleaning', 'Tenant trying to charge themselves') returning id::text$q$)$sql$,
  '23514',
  null,
  'only the landlord may propose a deduction'
);

select throws_ok(
  $sql$select pg_temp.acting('22222222-2222-4222-8222-222222222222', $q$insert into public.deductions (tenancy_id, proposed_by_profile_id, amount, reason_category, description) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '22222222-2222-4222-8222-222222222222', 5000, 'damage', 'More than the deposit held') returning id::text$q$)$sql$,
  '23514',
  null,
  'a deduction can never exceed the protected deposit'
);

select is(
  pg_temp.acting('11111111-1111-4111-8111-111111111111', $sql$update public.deductions set status = 'challenged' where id = 'd0000001-0000-4000-8000-000000000001'::uuid returning id::text$sql$),
  'd0000001-0000-4000-8000-000000000001',
  'the tenant can challenge a proposed deduction'
);

select throws_ok(
  $sql$select pg_temp.acting('22222222-2222-4222-8222-222222222222', $q$update public.deductions set status = 'accepted' where id = 'd0000003-0000-4000-8000-000000000001'::uuid returning id::text$q$)$sql$,
  '23514',
  null,
  'only the tenant may accept or challenge a deduction'
);

select throws_ok(
  $sql$select pg_temp.acting('11111111-1111-4111-8111-111111111111', $q$update public.deductions set status = 'accepted', amount = 350 where id = 'd0000003-0000-4000-8000-000000000001'::uuid returning id::text$q$)$sql$,
  '23514',
  null,
  'responding to a deduction may only change its status'
);

select is(
  pg_temp.acting('44444444-4444-4444-8444-444444444444', $sql$select count(*)::text from public.deductions$sql$),
  '0',
  'an outsider sees no deductions'
);

select throws_ok(
  $sql$select pg_temp.acting('11111111-1111-4111-8111-111111111111', $q$delete from public.deductions where id = 'd0000001-0000-4000-8000-000000000001'::uuid returning id::text$q$)$sql$,
  '42501',
  null,
  'clients cannot delete deductions at all'
);

select * from finish();

rollback;
