-- ============================================================================
-- DepositLock — 0009 deposit records & the protected transition
--
-- Phase 5 reconciliation layer: the `deposit_records` read model is readable
-- by both participants and writable by nobody but the service role, the two
-- reconcile RPCs are server-only and idempotent, and `protected` is reachable
-- only from `awaiting_deposit` after the funding was verified on chain.
--
-- Constraint assertions run as the migration role (`postgres`); RLS
-- assertions impersonate profiles through the same helpers the rest of the
-- suite uses. Everything rolls back with the transaction.
-- ============================================================================

begin;

set local search_path = "$user", public, extensions;

create extension if not exists pgtap with schema extensions;

select plan(74);

-- Helpers (copied per file: pg_temp is session scoped) -----------------------

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

create or replace function pg_temp.as_anon(p_sql text)
returns text
language plpgsql
as $$
declare
  v_value text;
begin
  v_value := null;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  execute p_sql into v_value;
  reset role;
  return v_value;
exception when others then
  reset role;
  raise;
end;
$$;

-- Section A — schema and privileges ------------------------------------------

select has_table('public', 'deposit_records', 'deposit_records table exists');

select col_type_is('public', 'deposit_records', 'tenancy_id', 'uuid',
                   'tenancy_id is a uuid');
select col_type_is('public', 'deposit_records', 'required_amount', 'bigint',
                   'required_amount is a bigint of mint base units');
select col_type_is('public', 'deposit_records', 'deposited_amount', 'bigint',
                   'deposited_amount is a bigint of mint base units');
select col_type_is('public', 'deposit_records', 'onchain_status', 'text',
                   'onchain_status is text standing in for an enum');
select col_not_null('public', 'deposit_records', 'onchain_status',
                    'onchain_status is required');
select col_not_null('public', 'deposit_records', 'agreement_address',
                    'agreement_address is required');
select col_not_null('public', 'deposit_records', 'verified_at',
                    'verified_at is required');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.deposit_records'::regclass),
  'RLS enabled on deposit_records'
);

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'deposit_records'
      and lower(cmd) = 'select'),
  1,
  'exactly one SELECT policy: the participants'
);

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'deposit_records'
      and lower(cmd) in ('insert', 'update', 'delete')),
  0,
  'no client-side write policies exist on deposit_records'
);

select ok(
  has_table_privilege('authenticated', 'public.deposit_records', 'select'),
  'participants can be granted reads on deposit_records'
);

select ok(
  not has_table_privilege('authenticated', 'public.deposit_records', 'insert'),
  'authenticated holds no insert privilege on deposit_records'
);

select ok(
  not has_table_privilege('anon', 'public.deposit_records', 'select'),
  'anon holds no select privilege on deposit_records'
);

select ok(
  has_table_privilege('service_role', 'public.deposit_records', 'insert'),
  'the service role can write deposit_records'
);

select has_function(
  'public'::name, 'record_deposit_agreement'::name,
  array['uuid', 'text', 'text', 'text', 'bigint', 'smallint', 'text']::name[]
);

select has_function(
  'public'::name, 'mark_deposit_protected'::name,
  array['uuid', 'text', 'text', 'text', 'bigint', 'bigint', 'smallint', 'text',
        'timestamptz']::name[]
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.record_deposit_agreement(uuid,text,text,text,bigint,smallint,text)',
    'execute'),
  'authenticated cannot execute record_deposit_agreement'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.mark_deposit_protected(uuid,text,text,text,bigint,bigint,smallint,text,timestamptz)',
    'execute'),
  'anon cannot execute mark_deposit_protected'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.mark_deposit_protected(uuid,text,text,text,bigint,bigint,smallint,text,timestamptz)',
    'execute'),
  'the service role can execute mark_deposit_protected'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.mark_deposit_protected(uuid,text,text,text,bigint,bigint,smallint,text,timestamptz)',
    'execute'),
  'authenticated cannot execute mark_deposit_protected'
);

-- Section B — activity vocabulary --------------------------------------------

select lives_ok(
  $q$insert into public.activity_events
       (tenancy_id, event_type, title, description, blockchain_reference)
     values
       ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'deposit_vault_initialized',
        'Deposit vault created',
        'The landlord created the on-chain deposit agreement and its token vault.',
        'initSigCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC')$q$,
  'deposit_vault_initialized is a valid activity event type'
);

select throws_ok(
  $q$insert into public.activity_events
       (tenancy_id, event_type, title)
     values
       ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'deposit_vault_initialize',
        'Typo')$q$,
  '23514',
  null,
  'an unknown activity event type is still rejected'
);

-- Section C — the protected transition rule ---------------------------------

select lives_ok(
  $q$insert into public.tenancies
       (id, property_id, landlord_profile_id, tenant_profile_id, start_date,
        monthly_rent_amount, deposit_amount, status)
     values
       ('f5a00001-0000-4000-8000-000000000001',
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        '11111111-1111-4111-8111-111111111111',
        '33333333-3333-4333-8333-333333333333',
        date '2027-01-01', 1000, 1000, 'draft')$q$,
  'a draft fixture tenancy is created'
);

select throws_ok(
  $q$update public.tenancies set status = 'protected'
     where id = 'f5a00001-0000-4000-8000-000000000001'$q$,
  '23514',
  'A tenancy becomes protected only from awaiting_deposit',
  'a draft tenancy cannot jump straight to protected'
);

select lives_ok(
  $q$update public.tenancies set status = 'awaiting_tenant'
     where id = 'f5a00001-0000-4000-8000-000000000001'$q$,
  'the fixture moves to awaiting_tenant'
);

select throws_ok(
  $q$update public.tenancies set status = 'protected'
     where id = 'f5a00001-0000-4000-8000-000000000001'$q$,
  '23514',
  'A tenancy becomes protected only from awaiting_deposit',
  'an invited tenancy cannot jump to protected'
);

select lives_ok(
  $q$update public.tenancies set status = 'awaiting_deposit'
     where id = 'f5a00001-0000-4000-8000-000000000001'$q$,
  'the fixture reaches awaiting_deposit'
);

select lives_ok(
  $q$update public.tenancies set status = 'protected'
     where id = 'f5a00001-0000-4000-8000-000000000001'$q$,
  'awaiting_deposit to protected is allowed'
);

select ok(
  (select activated_at is not null
     from public.tenancies
    where id = 'f5a00001-0000-4000-8000-000000000001'),
  'the transition stamps activated_at'
);

select lives_ok(
  $q$insert into public.tenancies
       (id, property_id, landlord_profile_id, tenant_profile_id, start_date,
        monthly_rent_amount, deposit_amount, status)
     values
       ('f5a00002-0000-4000-8000-000000000002',
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        '11111111-1111-4111-8111-111111111111',
        '33333333-3333-4333-8333-333333333333',
        date '2026-01-01', 1000, 1000, 'closed')$q$,
  'a closed fixture tenancy is created'
);

select throws_ok(
  $q$update public.tenancies set status = 'protected'
     where id = 'f5a00002-0000-4000-8000-000000000002'$q$,
  '23514',
  'A tenancy becomes protected only from awaiting_deposit',
  'even an internal role cannot revive a closed tenancy as protected'
);

-- Section D — record_deposit_agreement ---------------------------------------

select lives_ok(
  $q$select public.record_deposit_agreement(
         'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
         '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
         'SysvarC1ock11111111111111111111111111111111',
         '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
         1200000000::bigint, 6::smallint,
         'initTxSignatureQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ')$q$,
  'the reconcile server records the landlord-created agreement'
);

select is(
  (select onchain_status from public.deposit_records
    where tenancy_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  'agreement_initialized',
  'the record starts as agreement_initialized'
);

select is(
  (select required_amount::text from public.deposit_records
    where tenancy_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  '1200000000',
  'the required amount is 1200.00 in six-decimal base units'
);

select is(
  (select vault_address from public.tenancies
    where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  'SysvarC1ock11111111111111111111111111111111',
  'the tenancy is pointed at its vault'
);

select is(
  (select blockchain_reference from public.tenancies
    where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
  'the tenancy is pointed at its agreement address'
);

select is(
  (select count(*)::text from public.activity_events
    where tenancy_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
      and event_type = 'deposit_vault_initialized'),
  '1',
  'creating the vault appends one deposit_vault_initialized event'
);

select lives_ok(
  $q$select public.record_deposit_agreement(
         'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
         '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
         'SysvarC1ock11111111111111111111111111111111',
         '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
         1200000000::bigint, 6::smallint,
         'initTxSignatureQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ')$q$,
  'recording the same agreement twice is idempotent'
);

select is(
  (select count(*)::text from public.activity_events
    where tenancy_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
      and event_type = 'deposit_vault_initialized'),
  '1',
  'the repeat call emits no second vault event'
);

select is(
  (select onchain_status from public.deposit_records
    where tenancy_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  'agreement_initialized',
  'a repeat record call does not fabricate funding'
);

-- Section E — table constraints ----------------------------------------------

select throws_ok(
  $q$insert into public.deposit_records
       (tenancy_id, agreement_address, vault_address, mint_address,
        required_amount)
     values
       ('99999999-9999-4999-8999-999999999999',
        'AaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaa',
        'AaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaa',
        'AaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaa',
        0) returning id$q$,
  '23514',
  null,
  'a zero required amount is rejected'
);

select throws_ok(
  $q$insert into public.deposit_records
       (tenancy_id, agreement_address, vault_address, mint_address,
        required_amount, onchain_status)
     values
       ('99999999-9999-4999-8999-999999999999',
        'AaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaa',
        'AaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaa',
        'AaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaa',
        1200000000, 'funded') returning id$q$,
  '23514',
  null,
  'an unknown onchain_status is rejected'
);

select throws_ok(
  $q$insert into public.deposit_records
       (tenancy_id, agreement_address, vault_address, mint_address,
        required_amount, deposited_amount)
     values
       ('99999999-9999-4999-8999-999999999999',
        'AaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaa',
        'AaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaa',
        'AaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaa',
        1200000000, 1) returning id$q$,
  '23514',
  null,
  'a deposited amount that differs from the required amount is rejected'
);

select throws_ok(
  $q$insert into public.deposit_records
       (tenancy_id, agreement_address, vault_address, mint_address,
        required_amount)
     values
       ('99999999-9999-4999-8999-999999999999',
        'not a base58 address',
        'AaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaa',
        'AaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaa',
        1200000000) returning id$q$,
  '23514',
  null,
  'an address that is not base58 is rejected'
);

select throws_ok(
  $q$insert into public.deposit_records
       (tenancy_id, agreement_address, vault_address, mint_address,
        required_amount, onchain_status)
     values
       ('99999999-9999-4999-8999-999999999999',
        'AaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaa',
        'AaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaa',
        'AaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaa',
        1200000000, 'deposit_funded') returning id$q$,
  '23514',
  null,
  'deposit_funded without a deposited amount is rejected'
);

select throws_ok(
  $q$insert into public.deposit_records
       (tenancy_id, agreement_address, vault_address, mint_address,
        required_amount)
     values
       ('dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        'AaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaa',
        'AaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaa',
        'AaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaa',
        1200000000) returning id$q$,
  '23505',
  null,
  'a tenancy can hold only one deposit record'
);

select throws_ok(
  $q$insert into public.deposit_records
       (tenancy_id, agreement_address, vault_address, mint_address,
        required_amount)
     values
       ('cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
        'AaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaa',
        'AaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaa',
        1800000000) returning id$q$,
  '23505',
  null,
  'an agreement address cannot be shared by two tenancies'
);

-- Section F — participant visibility and the write lockdown ------------------

select is(
  pg_temp.acting('11111111-1111-4111-8111-111111111111',
    $q$select count(*)::text from public.deposit_records$q$),
  '1',
  'the landlord of the tenancy reads its deposit record'
);

select is(
  pg_temp.acting('33333333-3333-4333-8333-333333333333',
    $q$select count(*)::text from public.deposit_records$q$),
  '1',
  'the tenant of the tenancy reads its deposit record'
);

select is(
  pg_temp.acting('22222222-2222-4222-8222-222222222222',
    $q$select count(*)::text from public.deposit_records$q$),
  '0',
  'an outsider reads no deposit records'
);

select throws_ok(
  $outer$select pg_temp.as_anon($q$select count(*) from public.deposit_records$q$)$outer$,
  '42501',
  null,
  'an anonymous session cannot read deposit records'
);

select throws_ok(
  $outer$select pg_temp.act('11111111-1111-4111-8111-111111111111',
    $q$insert into public.deposit_records
         (tenancy_id, agreement_address, vault_address, mint_address,
          required_amount)
       values
         ('dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          'AaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaa',
          'AaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaa',
          'AaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaa',
          1200000000) returning id$q$)$outer$,
  '42501',
  null,
  'not even the landlord can insert a deposit record'
);

select throws_ok(
  $outer$select pg_temp.act('11111111-1111-4111-8111-111111111111',
    $q$update public.deposit_records set verified_at = now()
       where tenancy_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' returning id$q$)$outer$,
  '42501',
  null,
  'not even the landlord can rewrite a deposit record'
);

select throws_ok(
  $outer$select pg_temp.act('11111111-1111-4111-8111-111111111111',
    $q$delete from public.deposit_records
       where tenancy_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' returning id$q$)$outer$,
  '42501',
  null,
  'not even the landlord can delete a deposit record'
);

-- Section G — mark_deposit_protected -----------------------------------------

select lives_ok(
  $q$select public.mark_deposit_protected(
         'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
         '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
         'SysvarC1ock11111111111111111111111111111111',
         '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
         1200000000::bigint, 1200000000::bigint, 6::smallint,
         'fundingTxSignatureWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
         timestamptz '2026-10-06T10:00:00+00:00')$q$,
  'the reconcile server verifies the funding'
);

select is(
  (select status from public.tenancies
    where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  'protected',
  'the tenancy moves awaiting_deposit to protected'
);

select ok(
  (select activated_at is not null
     from public.tenancies
    where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  'the transition stamps activated_at'
);

select is(
  (select onchain_status from public.deposit_records
    where tenancy_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  'deposit_funded',
  'the record is deposit_funded'
);

select is(
  (select deposited_amount::text from public.deposit_records
    where tenancy_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  '1200000000',
  'the deposited amount matches the required amount'
);

select is(
  (select funding_signature from public.deposit_records
    where tenancy_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  'fundingTxSignatureWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
  'the funding transaction signature is stored'
);

select is(
  (select funded_at from public.deposit_records
    where tenancy_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  timestamptz '2026-10-06T10:00:00+00:00',
  'the on-chain funding time is stored'
);

select is(
  (select initialization_signature from public.deposit_records
    where tenancy_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  'initTxSignatureQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ',
  'funding preserves the initialization signature'
);

select is(
  (select count(*)::text from public.activity_events
    where tenancy_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
      and event_type = 'deposit_protected'),
  '1',
  'verification appends one deposit_protected event'
);

select lives_ok(
  $q$select public.mark_deposit_protected(
         'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
         '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
         'SysvarC1ock11111111111111111111111111111111',
         '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
         1200000000::bigint, 1200000000::bigint, 6::smallint,
         'fundingTxSignatureWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
         timestamptz '2026-10-06T10:00:00+00:00')$q$,
  'a replayed reconcile call is idempotent'
);

select is(
  (select count(*)::text from public.activity_events
    where tenancy_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
      and event_type = 'deposit_protected'),
  '1',
  'the replay emits no second protection event'
);

select is(
  (select count(*)::text from public.activity_events
    where tenancy_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
      and event_type = 'deposit_vault_initialized'),
  '1',
  'the replay leaves the vault event alone'
);

select is(
  (select status from public.tenancies
    where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  'protected',
  'the replay leaves the tenancy protected'
);

-- Section H — mismatched or stale reconcile calls ----------------------------

select throws_ok(
  $q$select public.mark_deposit_protected(
         'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
         '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
         'SysvarC1ock11111111111111111111111111111111',
         '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
         1199999999::bigint, 1199999999::bigint, 6::smallint,
         'fundingTxSignatureWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
         timestamptz '2026-10-06T10:00:00+00:00')$q$,
  'P0001',
  'Required amount does not match the tenancy deposit',
  'an amount that does not match the contract deposit is refused'
);

select throws_ok(
  $q$select public.mark_deposit_protected(
         'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
         '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
         'SysvarC1ock11111111111111111111111111111111',
         '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
         1200000000::bigint, 1199999999::bigint, 6::smallint,
         'fundingTxSignatureWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
         timestamptz '2026-10-06T10:00:00+00:00')$q$,
  'P0001',
  'Funded amount must equal the required deposit',
  'a partial funding is refused even though the row already exists'
);

select throws_ok(
  $q$select public.mark_deposit_protected(
         'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
         'AaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaa',
         'SysvarC1ock11111111111111111111111111111111',
         '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
         1200000000::bigint, 1200000000::bigint, 6::smallint,
         'fundingTxSignatureWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
         timestamptz '2026-10-06T10:00:00+00:00')$q$,
  'P0001',
  'On-chain deposit state does not match the recorded agreement',
  'a reconcile pointing at a different agreement is refused'
);

select throws_ok(
  $q$select public.record_deposit_agreement(
         'f5a00002-0000-4000-8000-000000000002',
         'AaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaa',
         'AaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaa',
         'AaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaa',
         1000000000::bigint, 6::smallint,
         'initTxSignatureQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ')$q$,
  'P0001',
  'A deposit agreement can only be recorded while the tenancy awaits the deposit',
  'a closed tenancy cannot have an agreement recorded'
);

select throws_ok(
  $q$select public.record_deposit_agreement(
         '99999999-9999-4999-8999-999999999999',
         'AaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaa',
         'AaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaa',
         'AaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaaAAAaa',
         1000000000::bigint, 6::smallint, null)$q$,
  'P0001',
  null,
  'an unknown tenancy is refused'
);

select throws_ok(
  $q$select public.mark_deposit_protected(
         'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
         '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
         'SysvarC1ock11111111111111111111111111111111',
         '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
         1200000000::bigint, 1200000000::bigint, 8::smallint,
         'fundingTxSignatureWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
         timestamptz '2026-10-06T10:00:00+00:00')$q$,
  'P0001',
  'Required amount does not match the tenancy deposit',
  'the required amount is derived from the passed decimals'
);

select * from finish();

rollback;
