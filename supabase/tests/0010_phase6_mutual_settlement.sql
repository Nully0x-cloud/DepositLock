-- ============================================================================
-- DepositLock — Phase 6 settlement persistence and RLS
-- ============================================================================

begin;
set local search_path = "$user", public, extensions;
create extension if not exists pgtap with schema extensions;

select plan(47);

create or replace function pg_temp.acting(p_profile uuid, p_sql text)
returns text
language plpgsql
as $$
declare
  v_value text;
begin
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

select has_table('public', 'settlement_proposals', 'proposal history has its own participant-readable table');
select ok(not has_table_privilege('authenticated', 'public.deductions', 'INSERT'), 'clients cannot write deduction metadata before chain verification');
select ok(not has_table_privilege('authenticated', 'public.deductions', 'UPDATE'), 'clients cannot accept/challenge deductions directly');
select ok(not has_table_privilege('authenticated', 'public.disputes', 'INSERT'), 'clients cannot create off-chain disputes without an on-chain challenge');
select ok(not has_table_privilege('authenticated', 'public.settlements', 'INSERT'), 'clients cannot create final settlements directly');
select ok(not has_table_privilege('authenticated', 'public.settlements', 'UPDATE'), 'clients cannot rewrite final payout records');
select ok(not has_table_privilege('authenticated', 'public.settlement_proposals', 'INSERT'), 'clients cannot fabricate settlement proposal mirrors');
select ok(has_function_privilege('service_role', 'public.mark_settlement_executed(uuid,uuid,bigint,bigint,numeric,numeric,smallint,text,timestamptz)', 'EXECUTE'), 'only the service role can execute final reconciliation');
select ok(not has_function_privilege('authenticated', 'public.mark_settlement_executed(uuid,uuid,bigint,bigint,numeric,numeric,smallint,text,timestamptz)', 'EXECUTE'), 'authenticated clients cannot call final settlement reconciliation');

-- Chain-index fixture for the seeded protected tenancy, Camden Street.
insert into public.deposit_records (
  tenancy_id, agreement_address, vault_address, mint_address,
  required_amount, deposited_amount, onchain_status, funding_signature, funded_at
) values (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  repeat('1', 32), repeat('2', 32), repeat('3', 32),
  1800000000, 1800000000, 'deposit_funded', repeat('1', 64), now()
);

select is(
  public.start_move_out_review(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '22222222-2222-4222-8222-222222222222'
  )->>'status',
  'move_out_review',
  'verified landlord action starts move-out review'
);

select is(
  (public.record_settlement_proposal(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid,
    '22222222-2222-4222-8222-222222222222'::uuid,
    repeat('1', 32), repeat('7', 32), 1::bigint, 'partial_deduction',
    1800000000::bigint, 150000000::bigint, 1650000000::bigint, 6::smallint,
    repeat('a', 64), repeat('2', 64), 'cleaning',
    'Professional clean after documented inspection.', array[]::uuid[]
  )->>'status'),
  'proposed',
  'reconciliation persists a chain-verified deduction proposal'
);
select is(
  (select status from public.tenancies where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  'deduction_proposed',
  'deduction proposal advances the tenancy workflow'
);
select is(
  (select count(*)::integer from public.deductions
   where tenancy_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' and status = 'proposed'),
  1,
  'a deduction record is created from verified proposal metadata'
);
select is(
  (select landlord_amount::text from public.settlement_proposals
   where tenancy_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' and proposal_version = 1),
  '150000000',
  'proposal row stores integer base units'
);
select is(
  (public.record_settlement_proposal(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid,
    '22222222-2222-4222-8222-222222222222'::uuid,
    repeat('1', 32), repeat('7', 32), 1::bigint, 'partial_deduction',
    1800000000::bigint, 150000000::bigint, 1650000000::bigint, 6::smallint,
    repeat('a', 64), repeat('2', 64), 'cleaning',
    'Professional clean after documented inspection.', array[]::uuid[]
  )->>'proposal_id'),
  (select id::text from public.settlement_proposals
   where tenancy_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' and proposal_version = 1),
  'replaying verified proposal reconciliation is idempotent'
);
select is(
  (select count(*)::integer from public.deductions
   where tenancy_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  1,
  'idempotent proposal reconciliation does not duplicate deductions'
);

select throws_ok(
  $sql$select pg_temp.acting('11111111-1111-4111-8111-111111111111', $q$update public.tenancies set status = 'closed' where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' returning id::text$q$)$sql$,
  '42501', null, 'tenant cannot directly close a tenancy'
);
select throws_ok(
  $sql$select pg_temp.acting('11111111-1111-4111-8111-111111111111', $q$update public.tenancies set status = 'disputed' where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' returning id::text$q$)$sql$,
  '42501', null, 'tenant cannot directly mark a tenancy disputed'
);
select throws_ok(
  $sql$select pg_temp.acting('11111111-1111-4111-8111-111111111111', $q$update public.deductions set status = 'accepted' where tenancy_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' returning id::text$q$)$sql$,
  '42501', null, 'tenant cannot directly accept a deduction without the on-chain approval'
);
select throws_ok(
  $sql$select pg_temp.acting('11111111-1111-4111-8111-111111111111', $q$insert into public.disputes (tenancy_id,deduction_id,opened_by_profile_id,reason) select tenancy_id,id,'11111111-1111-4111-8111-111111111111','Client forged a dispute' from public.deductions where tenancy_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc' limit 1 returning id::text$q$)$sql$,
  '42501', null, 'tenant cannot create a database dispute without the chain challenge'
);

select is(
  (public.record_settlement_dispute(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid,
    '11111111-1111-4111-8111-111111111111'::uuid,
    repeat('1', 32), repeat('7', 32), 1::bigint, 'partial_deduction',
    1800000000::bigint, 150000000::bigint, 1650000000::bigint, 6::smallint,
    repeat('a', 64), repeat('2', 64), repeat('3', 64),
    'The cited damage was documented before move-in.', array[]::uuid[]
  )->>'status'),
  'challenged',
  'verified on-chain challenge creates the off-chain dispute record'
);
select is(
  (select status from public.tenancies where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  'disputed',
  'verified challenge changes tenancy to disputed'
);
select is(
  (select status from public.deductions
   where tenancy_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  'challenged',
  'deduction mirrors the verified tenant challenge'
);
select is(
  (select status from public.disputes
   where tenancy_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  'open',
  'dispute remains open with no arbitration outcome'
);
select is(
  (select status from public.settlement_proposals
   where tenancy_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  'challenged',
  'proposal becomes permanently non-executable after challenge'
);
select is(
  (select count(*)::integer from public.settlements
   where tenancy_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  0,
  'a disputed proposal creates no final settlement'
);
select throws_ok(
  $sql$select public.mark_settlement_executed(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid,
    '11111111-1111-4111-8111-111111111111'::uuid,
    1::bigint, 1800000000::bigint, 150000000::numeric, 1650000000::numeric,
    6::smallint, repeat('4',64), now())$sql$,
  '23514', null, 'a challenged proposal cannot be reconciled as executed'
);

-- Full return path on the second seeded tenancy.
insert into public.deposit_records (
  tenancy_id, agreement_address, vault_address, mint_address,
  required_amount, deposited_amount, onchain_status, funding_signature, funded_at
) values (
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  repeat('4', 32), repeat('5', 32), repeat('6', 32),
  1200000000, 1200000000, 'deposit_funded', repeat('5', 64), now()
);
update public.tenancies set status = 'protected'
 where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
select is(
  (public.start_move_out_review(
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    '11111111-1111-4111-8111-111111111111'
  )->>'status'),
  'move_out_review',
  'second verified landlord can start move-out review'
);
select is(
  (public.record_settlement_proposal(
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid,
    '11111111-1111-4111-8111-111111111111'::uuid,
    repeat('4', 32), repeat('8', 32), 1::bigint, 'full_return',
    1200000000::bigint, 0::bigint, 1200000000::bigint, 6::smallint,
    repeat('b', 64), repeat('6', 64), null::text, null::text, array[]::uuid[]
  )->>'status'),
  'proposed',
  'full-return proposal is recorded without a fake deduction row'
);
select is(
  (select status from public.tenancies where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  'settlement_pending',
  'full-return proposal advances to settlement pending'
);
select is(
  (select count(*)::integer from public.deductions
   where tenancy_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  0,
  'full return does not create a zero-value deduction'
);
select is(
  (public.mark_settlement_executed(
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid,
    '33333333-3333-4333-8333-333333333333'::uuid, 1::bigint,
    1200000000::bigint, 0::numeric, 1201000000::numeric, 6::smallint,
    repeat('7', 64), now()
  )->>'status'),
  'closed',
  'chain-verified full return closes tenancy'
);
select is(
  (select status from public.tenancies where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  'closed',
  'final database tenancy status is closed'
);
select is(
  (select tenant_amount::text || ':' || landlord_amount::text || ':' || settlement_type
   from public.settlements where tenancy_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  '1201.000000:0.000000:full_return',
  'unsolicited vault surplus is returned to tenant and included in actual payout'
);
select is(
  (select surplus_amount::text from public.settlements
   where tenancy_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  '1.000000',
  'settlement records donated vault surplus separately from original deposit'
);
select is(
  (select settled_tenant_amount::text from public.settlement_proposals
   where tenancy_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  '1201000000',
  'proposal history preserves the exact final tenant token payout'
);
select is(
  (select status from public.settlement_proposals
   where tenancy_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  'executed',
  'proposal status records execution'
);
select is(
  (select count(*)::integer from public.activity_events
   where tenancy_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
     and event_type = 'settlement_completed'),
  1,
  'settlement completion activity is emitted once'
);
select is(
  (public.mark_settlement_executed(
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid,
    '33333333-3333-4333-8333-333333333333'::uuid, 1::bigint,
    1200000000::bigint, 0::numeric, 1201000000::numeric, 6::smallint,
    repeat('7', 64), now()
  )->>'status'),
  'closed',
  'replaying final reconciliation is idempotent'
);
select is(
  (select count(*)::integer from public.settlements
   where tenancy_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  1,
  'idempotent final reconciliation does not duplicate settlement rows'
);
select is(
  (select count(*)::integer from public.activity_events
   where tenancy_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
     and event_type = 'settlement_completed'),
  1,
  'idempotent final reconciliation does not duplicate completion activity'
);

-- Missing proposal metadata must not prevent the tenant from freezing a
-- valid on-chain challenge. The fallback is explicitly marked unverified.
insert into public.properties (
  id, created_by_profile_id, address_line_1, city, country, property_type
) values (
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  '22222222-2222-4222-8222-222222222222',
  'Phase 6 recovery fixture', 'Dublin', 'IE', 'apartment'
);
insert into public.tenancies (
  id, property_id, landlord_profile_id, tenant_profile_id, start_date,
  monthly_rent_amount, deposit_amount, display_currency, status
) values (
  'ffffffff-ffff-4fff-8fff-ffffffffffff',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  date '2026-10-07', 1000, 500, 'EUR', 'protected'
);
insert into public.deposit_records (
  tenancy_id, agreement_address, vault_address, mint_address,
  required_amount, deposited_amount, onchain_status, funding_signature, funded_at
) values (
  'ffffffff-ffff-4fff-8fff-ffffffffffff',
  repeat('8', 32), repeat('9', 32), repeat('A', 32),
  500000000, 500000000, 'deposit_funded', repeat('8', 64), now()
);
select is(
  (public.record_settlement_dispute(
    'ffffffff-ffff-4fff-8fff-ffffffffffff'::uuid,
    '11111111-1111-4111-8111-111111111111'::uuid,
    repeat('8', 32), repeat('7', 32), 1::bigint, 'partial_deduction',
    500000000::bigint, 100000000::bigint, 400000000::bigint, 6::smallint,
    repeat('c', 64), repeat('9', 64), repeat('5', 64),
    'The proposed amount does not match move-out evidence.', array[]::uuid[]
  )->>'status'),
  'challenged',
  'tenant challenge can be reconciled even if landlord metadata did not sync'
);
select is(
  (select metadata_verified from public.settlement_proposals
   where tenancy_id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'),
  false,
  'fallback proposal metadata is explicitly marked unverified'
);
select is(
  (select status from public.tenancies where id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'),
  'disputed',
  'fallback challenge still leaves tenancy disputed'
);
select is(
  (select count(*)::integer from public.settlements
   where tenancy_id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'),
  0,
  'fallback disputed flow creates no final settlement'
);
select is(
  (select count(*)::integer from public.disputes
   where tenancy_id = 'ffffffff-ffff-4fff-8fff-ffffffffffff' and status = 'open'),
  1,
  'fallback disputed flow records one open dispute'
);
select is(
  (select amount::text || ':' || reason_category from public.deductions
   where tenancy_id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'),
  '100.00:other',
  'placeholder deduction communicates the missing unverified reason without inventing one'
);

select * from finish();
rollback;
