-- ============================================================================
-- DepositLock — 0007 wallet auth identity (Phase 3B)
--
-- Verifies the identity contract added in
-- `20261004180000_phase3b_wallet_identity.sql`:
--   * profiles must reference a real auth user (FK to auth.users),
--   * `profiles.wallet_address` is derived from the verified `auth.identities`
--     row of the acting session and can never be claimed by the client,
--   * the lookup function is not callable by client roles,
--   * the additive `properties.bedrooms` column keeps its range check.
--
-- Identity is simulated exactly the way the other suites simulate it:
-- `request.jwt.claims` carries the subject, the session role is
-- `authenticated`. The wallet rows below mirror what GoTrue writes after it
-- verifies a real Sign-In-With-Solana signature.
-- ============================================================================

begin;

set local search_path = "$user", public, extensions;

create extension if not exists pgtap with schema extensions;

select plan(10);

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

-- ---------------------------------------------------------------------------
-- Fixture: three fresh auth users, mirroring GoTrue's SIWS rows.
-- ---------------------------------------------------------------------------

insert into auth.users (id, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (
    '55555555-5555-4555-8555-555555555501',
    'authenticated', 'authenticated',
    '{"provider": "web3", "providers": ["web3"]}'::jsonb,
    jsonb_build_object(
      'sub', 'web3:solana:DEVWALLET-00000000000000000000NEWUSER001',
      'custom_claims', jsonb_build_object(
        'address', 'DEVWALLET-00000000000000000000NEWUSER001',
        'chain', 'solana', 'domain', 'localhost:3000'
      )
    ),
    now(), now()
  ),
  (
    '77777777-7777-4777-8777-777777777702',
    'authenticated', 'authenticated',
    '{"provider": "web3", "providers": ["web3"]}'::jsonb,
    jsonb_build_object(
      'sub', 'web3:solana:DEVWALLET-00000000000000000000LEGIT0002',
      'custom_claims', jsonb_build_object(
        'address', 'DEVWALLET-00000000000000000000LEGIT0002',
        'chain', 'solana', 'domain', 'localhost:3000'
      )
    ),
    now(), now()
  ),
  (
    '66666666-6666-4666-8666-666666666603',
    'authenticated', 'authenticated',
    '{"provider": "web3", "providers": ["web3"]}'::jsonb,
    null,
    now(), now()
  );

insert into auth.identities (provider, provider_id, user_id, identity_data, last_sign_in_at, created_at, updated_at)
select
  'web3',
  u.raw_user_meta_data ->> 'sub',
  u.id,
  jsonb_build_object(
    'sub', u.raw_user_meta_data ->> 'sub',
    'custom_claims', u.raw_user_meta_data -> 'custom_claims'
  ),
  u.created_at, u.created_at, u.created_at
from auth.users u
where u.id in ('55555555-5555-4555-8555-555555555501', '77777777-7777-4777-8777-777777777702');

-- ---------------------------------------------------------------------------
-- Foreign key: a profile cannot exist without an auth user
-- ---------------------------------------------------------------------------

select throws_ok(
  $sql$insert into public.profiles (id, full_name, email) values ('99999999-9999-4999-8999-999999999904', 'Ghost User', 'ghost@example.ie')$sql$,
  '23503',
  null,
  'a profile cannot be created for an identity that never signed up'
);

select is(
  (select count(*)::text from auth.users where id = '11111111-1111-4111-8111-111111111111'),
  '1',
  'every seeded demo profile has a local auth user behind it'
);

-- ---------------------------------------------------------------------------
-- Wallet binding on create
-- ---------------------------------------------------------------------------

select is(
  pg_temp.acting('55555555-5555-4555-8555-555555555501', $q$insert into public.profiles (id, full_name, email) values ('55555555-5555-4555-8555-555555555501', 'Tess Byrne', 'tess.byrne@example.ie') returning id::text$q$),
  '55555555-5555-4555-8555-555555555501',
  'a signed-in user can create their own profile without supplying a wallet'
);

select is(
  pg_temp.acting('55555555-5555-4555-8555-555555555501', $q$select wallet_address::text from public.profiles where id = '55555555-5555-4555-8555-555555555501'::uuid$q$),
  'DEVWALLET-00000000000000000000NEWUSER001',
  'the wallet is stamped from the verified identity, not from the client payload'
);

select throws_ok(
  $sql$select pg_temp.acting('77777777-7777-4777-8777-777777777702', $q$insert into public.profiles (id, full_name, email, wallet_address) values ('77777777-7777-4777-8777-777777777702', 'Gerald Forde', 'gerald.forde@example.ie', 'DEVWALLET-00000000000000000000VICTIM001') returning id::text$q$)$sql$,
  '23514',
  null,
  'a client cannot claim somebody else''s wallet on signup'
);

select throws_ok(
  $sql$select pg_temp.acting('66666666-6666-4666-8666-666666666603', $q$insert into public.profiles (id, full_name, email) values ('66666666-6666-4666-8666-666666666603', 'No Wallet', 'no.wallet@example.ie') returning id::text$q$)$sql$,
  '23514',
  null,
  'a session without a verified wallet cannot create a profile'
);

-- ---------------------------------------------------------------------------
-- Wallet binding on update + function privileges
-- ---------------------------------------------------------------------------

select throws_ok(
  $sql$select pg_temp.acting('11111111-1111-4111-8111-111111111111', $q$update public.profiles set wallet_address = 'DEVWALLET-00000000000000000000FORGED001' where id = '11111111-1111-4111-8111-111111111111'::uuid returning id::text$q$)$sql$,
  '23514',
  null,
  'the bound wallet cannot be edited to a different address'
);

select throws_ok(
  $sql$select pg_temp.acting('11111111-1111-4111-8111-111111111111', $q$select public.verified_wallet_address('11111111-1111-4111-8111-111111111111')$q$)$sql$,
  '42501',
  null,
  'client roles cannot call the wallet lookup function directly'
);

-- ---------------------------------------------------------------------------
-- bedrooms column
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::text
     from information_schema.columns
    where table_schema = 'public'
      and table_name = 'properties'
      and column_name = 'bedrooms'),
  '1',
  'properties carry the bedrooms column the UI renders'
);

select throws_ok(
  $sql$insert into public.properties (id, created_by_profile_id, address_line_1, city, postal_code, property_type, bedrooms) values ('99999999-9999-4999-8999-999999999905', '22222222-2222-4222-8222-222222222222', '99 Absurd Road', 'Dublin', 'D01 AA01', 'house', 999)$sql$,
  '23514',
  null,
  'bedrooms outside the allowed range are rejected'
);

select * from finish();

rollback;
