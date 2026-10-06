-- ============================================================================
-- DepositLock — 0008 tenancy creation & tenant invitations
--
-- Phase 4 end to end: the landlord creates an `awaiting_tenant` tenancy with
-- its first invitation in one transaction, invitations are landlord-readable
-- and never directly writable, the public preview leaks no identifiers, and
-- only acceptance assigns the tenant — identity mismatch, expiry, decline,
-- cancel and re-invitation all stay on their documented paths.
-- ============================================================================

begin;

set local search_path = "$user", public, extensions;

create extension if not exists pgtap with schema extensions;

select plan(47);

-- Helpers --------------------------------------------------------------------

-- Runs `p_sql` as the given profile (session claims + authenticated role).
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

-- Runs `p_sql` with no session at all, as the `anon` role.
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

-- Fixtures (rolled back with the suite) --------------------------------------

drop table if exists p4_f1_raw, p4_f1, p4_f2_raw, p4_f2, p4_f3_raw, p4_f3;

create table p4_f1_raw (result text);

insert into p4_f1_raw values (
  pg_temp.acting(
    '44444444-4444-4444-8444-444444444444',
    $q$select public.create_tenancy_with_invitation(
      p_start_date => date '2027-03-01',
      p_end_date => date '2028-02-28',
      p_monthly_rent => 1750,
      p_deposit => 1750,
      p_tenant_email => 'aoife.kelly@example.ie',
      p_tenant_wallet => 'DEVWALLET-00000000000000000000AOIFE0001',
      p_property => jsonb_build_object(
        'address_line_1', '12 Fixture Road',
        'city', 'Dublin',
        'county', 'Dublin',
        'postal_code', 'D07 XX01',
        'property_type', 'apartment',
        'bedrooms', 2
      )
    )::text$q$
  )
);

create table p4_f1 as
select (result::jsonb ->> 'tenancy_id')::uuid as tenancy_id,
       (result::jsonb ->> 'property_id')::uuid as property_id,
       (result::jsonb ->> 'invitation_token')::text as token
from p4_f1_raw;

create table p4_f2_raw (result text);

insert into p4_f2_raw values (
  pg_temp.acting(
    '44444444-4444-4444-8444-444444444444',
    format(
      $q$select public.create_tenancy_with_invitation(
        p_start_date => date '2027-05-01',
        p_monthly_rent => 1500,
        p_deposit => 1500,
        p_tenant_email => 'aoife.kelly@example.ie',
        p_property_id => %L
      )::text$q$,
      (select property_id from p4_f1)
    )
  )
);

create table p4_f2 as
select (result::jsonb ->> 'tenancy_id')::uuid as tenancy_id,
       (result::jsonb ->> 'property_id')::uuid as property_id,
       (result::jsonb ->> 'invitation_token')::text as token
from p4_f2_raw;

create table p4_f3_raw (result text);

insert into p4_f3_raw values (
  pg_temp.acting(
    '44444444-4444-4444-8444-444444444444',
    format(
      $q$select public.create_tenancy_with_invitation(
        p_start_date => date '2027-09-01',
        p_monthly_rent => 1400,
        p_deposit => 1400,
        p_tenant_email => 'aoife.kelly@example.ie',
        p_property_id => %L
      )::text$q$,
      (select property_id from p4_f1)
    )
  )
);

create table p4_f3 as
select (result::jsonb ->> 'tenancy_id')::uuid as tenancy_id,
       (result::jsonb ->> 'invitation_token')::text as token
from p4_f3_raw;

update public.tenancy_invitations
   set expires_at = now() - interval '1 day'
 where tenancy_id = (select tenancy_id from p4_f3);

-- Creation -------------------------------------------------------------------

select is(
  (select tenancy_id from p4_f1) is not null,
  true,
  'creation returns the tenancy id'
);

select is(
  (select status || ':' || (tenant_profile_id is null)::text
     from public.tenancies
    where id = (select tenancy_id from p4_f1)),
  'awaiting_tenant:true',
  'the tenancy starts awaiting its tenant, with no tenant assigned'
);

select is(
  (select count(*)::text
     from public.properties
    where id = (select property_id from p4_f1)
      and created_by_profile_id = '44444444-4444-4444-8444-444444444444'),
  '1',
  'the new property is created in the creating landlord''s name'
);

select is(
  (select status || ':' || (token ~ '^[0-9a-f]{64}$')::text
     from public.tenancy_invitations
    where tenancy_id = (select tenancy_id from p4_f1)),
  'pending:true',
  'the first invitation is pending with a 64-hex bearer token'
);

select is(
  (select count(*)::text
     from public.tenancy_participants
    where tenancy_id = (select tenancy_id from p4_f1)),
  '1',
  'only the landlord participant exists until the invitation is accepted'
);

select is(
  (select string_agg(role, ',' order by role)
     from public.tenancy_participants
    where tenancy_id = (select tenancy_id from p4_f1)),
  'landlord',
  'the participant graph starts with the landlord alone'
);

select is(
  (select string_agg(event_type, ',' order by event_type)
     from public.activity_events
    where tenancy_id = (select tenancy_id from p4_f1)),
  'tenancy_created,tenant_invited',
  'creation records the tenancy and the invitation on the timeline'
);

-- Creation guards ------------------------------------------------------------

select throws_ok(
  format($sql$select pg_temp.as_anon(%L)$sql$,
    $q$select public.create_tenancy_with_invitation(
      p_start_date => date '2027-04-01',
      p_monthly_rent => 1200,
      p_deposit => 1200,
      p_tenant_email => 'someone@example.ie',
      p_property => jsonb_build_object(
        'address_line_1', '9 Anon Road', 'city', 'Dublin', 'property_type', 'house'
      )
    )::text$q$),
  '42501',
  null,
  'an anonymous visitor cannot create a tenancy'
);

select throws_ok(
  format($sql$select pg_temp.acting(%L, %L)$sql$,
    '44444444-4444-4444-8444-444444444444',
    $q$select public.create_tenancy_with_invitation(
      p_start_date => date '2027-04-01',
      p_monthly_rent => 1200,
      p_deposit => 1200,
      p_tenant_email => 'niamh.fitzgerald@example.ie',
      p_property => jsonb_build_object(
        'address_line_1', '9 Self Road', 'city', 'Dublin', 'property_type', 'house'
      )
    )::text$q$),
  '23514',
  null,
  'the landlord cannot invite themselves'
);

select throws_ok(
  format($sql$select pg_temp.acting(%L, %L)$sql$,
    '44444444-4444-4444-8444-444444444444',
    $q$select public.create_tenancy_with_invitation(
      p_start_date => date '2027-04-01',
      p_monthly_rent => 1200,
      p_deposit => 1200,
      p_tenant_email => 'aoife.kelly@example.ie',
      p_property_id => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    )::text$q$),
  'P0002',
  null,
  'an existing property may only be reused by the landlord who created it'
);

select throws_ok(
  format($sql$select pg_temp.acting(%L, %L)$sql$,
    '44444444-4444-4444-8444-444444444444',
    $q$select public.create_tenancy_with_invitation(
      p_start_date => date '2027-04-01',
      p_monthly_rent => 1200,
      p_deposit => 0,
      p_tenant_email => 'aoife.kelly@example.ie',
      p_property => jsonb_build_object(
        'address_line_1', '9 Zero Road', 'city', 'Dublin', 'property_type', 'house'
      )
    )::text$q$),
  '23514',
  null,
  'a zero deposit is rejected'
);

select is(
  (select property_id from p4_f2),
  (select property_id from p4_f1),
  'an existing property of the landlord is reused as-is'
);

-- Visibility and direct writes ------------------------------------------------

select is(
  pg_temp.acting(
    '44444444-4444-4444-8444-444444444444',
    format(
      'select count(*)::text from public.tenancy_invitations where tenancy_id = %L',
      (select tenancy_id from p4_f1)
    )
  ),
  '1',
  'the landlord reads the invitation of their own tenancy'
);

select is(
  pg_temp.acting(
    '11111111-1111-4111-8111-111111111111',
    'select count(*)::text from public.tenancy_invitations'
  ),
  '0',
  'an unrelated profile sees no invitations at all'
);

select throws_ok(
  format($sql$select pg_temp.acting(%L, %L)$sql$,
    '11111111-1111-4111-8111-111111111111',
    format(
      $q$insert into public.tenancy_invitations
        (tenancy_id, invited_by_profile_id, email, token)
       values (%L, '11111111-1111-4111-8111-111111111111', 'x@example.ie', %L)
       returning id::text$q$,
      (select tenancy_id from p4_f1),
      repeat('a', 64)
    )),
  '42501',
  null,
  'nobody creates invitations by inserting the table directly'
);

select throws_ok(
  format($sql$select pg_temp.acting(%L, %L)$sql$,
    '11111111-1111-4111-8111-111111111111',
    format(
      $q$update public.tenancy_invitations
          set status = 'cancelled'
        where tenancy_id = %L
        returning id::text$q$,
      (select tenancy_id from p4_f1)
    )),
  '42501',
  null,
  'nobody cancels invitations by updating the table directly'
);

select throws_ok(
  format($sql$select pg_temp.acting(%L, %L)$sql$,
    '11111111-1111-4111-8111-111111111111',
    format(
      $q$delete from public.tenancy_invitations
        where tenancy_id = %L
        returning id::text$q$,
      (select tenancy_id from p4_f1)
    )),
  '42501',
  null,
  'nobody removes invitations by deleting the table directly'
);

-- Public preview -------------------------------------------------------------

select is(
  (pg_temp.as_anon(
    format($q$select public.resolve_tenancy_invitation(%L)::text$q$,
      (select token from p4_f1))
  )::jsonb ->> 'invitation_status'),
  'pending',
  'anyone can preview a pending invitation before signing in'
);

select is(
  (select string_agg(col, ',' order by col)
     from jsonb_object_keys(
       (pg_temp.as_anon(
         format($q$select public.resolve_tenancy_invitation(%L)::text$q$,
           (select token from p4_f1))
       ))::jsonb
     ) as k(col)),
  'expires_at,invitation_status,landlord_name,property,terms',
  'the preview exposes only the fields the invitee needs'
);

select is(
  pg_temp.as_anon(
    $q$select public.resolve_tenancy_invitation(
      '0000000000000000000000000000000000000000000000000000000000000000'
    )::text$q$
  ),
  null,
  'an unknown token resolves to nothing'
);

-- Acceptance -----------------------------------------------------------------

select throws_ok(
  format($sql$select pg_temp.as_anon(%L)$sql$,
    format($q$select public.accept_tenancy_invitation(%L)::text$q$,
      (select token from p4_f1))),
  '42501',
  null,
  'accepting requires a signed-in session'
);

select throws_ok(
  format($sql$select pg_temp.acting(%L, %L)$sql$,
    '11111111-1111-4111-8111-111111111111',
    format($q$select public.accept_tenancy_invitation(%L)::text$q$,
      (select token from p4_f1))),
  '42501',
  null,
  'an invitation bound to another wallet and e-mail cannot be accepted'
);

select is(
  (pg_temp.acting(
    '33333333-3333-4333-8333-333333333333',
    format($q$select public.accept_tenancy_invitation(%L)::text$q$,
      (select token from p4_f1))
  )::jsonb ->> 'tenancy_id'),
  (select tenancy_id::text from p4_f1),
  'the invited tenant accepts and receives the tenancy id'
);

select is(
  (select status || ':' || tenant_profile_id::text
     from public.tenancies
    where id = (select tenancy_id from p4_f1)),
  'awaiting_deposit:33333333-3333-4333-8333-333333333333',
  'acceptance assigns the tenant and moves the tenancy to awaiting deposit'
);

select is(
  (select count(*)::text
     from public.tenancy_participants
    where tenancy_id = (select tenancy_id from p4_f1)),
  '2',
  'the tenant participant appears alongside the landlord'
);

select is(
  (select string_agg(role || ':' || status, ',' order by role)
     from public.tenancy_participants
    where tenancy_id = (select tenancy_id from p4_f1)),
  'landlord:accepted,tenant:accepted',
  'both parties are recorded as accepted participants'
);

select is(
  (select count(*)::text
     from public.activity_events
    where tenancy_id = (select tenancy_id from p4_f1)
      and event_type = 'tenant_accepted'),
  '1',
  'acceptance is recorded on the timeline'
);

select is(
  (pg_temp.acting(
    '33333333-3333-4333-8333-333333333333',
    format($q$select public.accept_tenancy_invitation(%L)::text$q$,
      (select token from p4_f1))
  )::jsonb ->> 'tenancy_id'),
  (select tenancy_id::text from p4_f1),
  'accepting twice with the same profile is idempotent'
);

select throws_ok(
  format($sql$select pg_temp.acting(%L, %L)$sql$,
    '11111111-1111-4111-8111-111111111111',
    format($q$select public.accept_tenancy_invitation(%L)::text$q$,
      (select token from p4_f1))),
  '42501',
  null,
  'a second profile cannot take an already accepted invitation'
);

select is(
  (pg_temp.as_anon(
    format($q$select public.resolve_tenancy_invitation(%L)::text$q$,
      (select token from p4_f1))
  )::jsonb ->> 'invitation_status'),
  'accepted',
  'the preview reflects the acceptance'
);

select throws_ok(
  format($sql$select pg_temp.acting(%L, %L)$sql$,
    '44444444-4444-4444-8444-444444444444',
    format(
      $q$select public.create_tenancy_invitation(
        p_tenancy_id => %L,
        p_tenant_email => 'someone@example.ie'
      )::text$q$,
      (select tenancy_id from p4_f1)
    )),
  '23514',
  null,
  'the tenancy is no longer waiting for a tenant'
);

-- Decline and re-invitation --------------------------------------------------

select throws_ok(
  format($sql$select pg_temp.as_anon(%L)$sql$,
    format($q$select public.decline_tenancy_invitation(%L)::text$q$,
      (select token from p4_f2))),
  '42501',
  null,
  'declining also requires a signed-in session'
);

select throws_ok(
  format($sql$select pg_temp.acting(%L, %L)$sql$,
    '44444444-4444-4444-8444-444444444444',
    format($q$select public.decline_tenancy_invitation(%L)::text$q$,
      (select token from p4_f2))),
  '42501',
  null,
  'the landlord cannot decline their own invitation'
);

select is(
  (pg_temp.acting(
    '11111111-1111-4111-8111-111111111111',
    format($q$select public.decline_tenancy_invitation(%L)::text$q$,
      (select token from p4_f2))
  )::jsonb ->> 'status'),
  'declined',
  'a signed-in outsider may decline the bearer link'
);

select is(
  (select count(*)::text
     from public.activity_events
    where tenancy_id = (select tenancy_id from p4_f2)
      and event_type = 'tenant_declined'),
  '1',
  'declining records a tenant_declined event'
);

select throws_ok(
  format($sql$select pg_temp.acting(%L, %L)$sql$,
    '11111111-1111-4111-8111-111111111111',
    format(
      $q$select public.create_tenancy_invitation(
        p_tenancy_id => %L,
        p_tenant_email => 'someone@example.ie'
      )::text$q$,
      (select tenancy_id from p4_f2)
    )),
  '42501',
  null,
  'only the landlord may re-invite'
);

select is(
  length((pg_temp.acting(
    '44444444-4444-4444-8444-444444444444',
    format(
      $q$select public.create_tenancy_invitation(
        p_tenancy_id => %L,
        p_tenant_email => 'aoife.kelly@example.ie'
      )::text$q$,
      (select tenancy_id from p4_f2)
    )
  )::jsonb ->> 'invitation_token')),
  64,
  'the landlord can re-invite after a decline, with a fresh 64-hex token'
);

select is(
  (select count(*)::text
     from public.tenancy_invitations
    where tenancy_id = (select tenancy_id from p4_f2)
      and status = 'pending'),
  '1',
  'exactly one invitation is pending after the re-invite'
);

select is(
  (select count(*)::text
     from public.tenancy_invitations
    where tenancy_id = (select tenancy_id from p4_f2)
      and status = 'declined'),
  '1',
  'the declined invitation remains on record'
);

-- Cancellation ---------------------------------------------------------------

select throws_ok(
  format($sql$select pg_temp.acting(%L, %L)$sql$,
    '11111111-1111-4111-8111-111111111111',
    format(
      $q$select public.cancel_tenancy_invitation(%L)::text$q$,
      (select id from public.tenancy_invitations
        where tenancy_id = (select tenancy_id from p4_f2)
          and status = 'pending')
    )),
  '42501',
  null,
  'only the landlord may cancel an invitation'
);

select is(
  (pg_temp.acting(
    '44444444-4444-4444-8444-444444444444',
    format(
      $q$select public.cancel_tenancy_invitation(%L)::text$q$,
      (select id from public.tenancy_invitations
        where tenancy_id = (select tenancy_id from p4_f2)
          and status = 'pending')
    )
  )::jsonb ->> 'status'),
  'cancelled',
  'the landlord cancels the pending invitation'
);

select is(
  (select count(*)::text
     from public.tenancy_invitations
    where tenancy_id = (select tenancy_id from p4_f2)
      and status = 'pending'),
  '0',
  'no invitation is left pending after the cancel'
);

-- Expiry ---------------------------------------------------------------------

select throws_ok(
  format($sql$select pg_temp.acting(%L, %L)$sql$,
    '33333333-3333-4333-8333-333333333333',
    format($q$select public.accept_tenancy_invitation(%L)::text$q$,
      (select token from p4_f3))),
  '23514',
  null,
  'an expired invitation cannot be accepted'
);

select is(
  (pg_temp.as_anon(
    format($q$select public.resolve_tenancy_invitation(%L)::text$q$,
      (select token from p4_f3))
  )::jsonb ->> 'invitation_status'),
  'expired',
  'an out-of-date link reports itself as expired'
);

-- Contract and shape guards --------------------------------------------------

select throws_ok(
  $sql$update public.tenancies
      set tenant_profile_id = null
    where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid$sql$,
  '23514',
  null,
  'a tenancy past the invitation stage keeps its tenant'
);

select throws_ok(
  format($sql$select pg_temp.acting(%L, %L)$sql$,
    '22222222-2222-4222-8222-222222222222',
    $q$update public.tenancies
        set tenant_profile_id = '33333333-3333-4333-8333-333333333333'::uuid
      where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid
      returning id::text$q$),
  '23514',
  null,
  'the tenant is assigned only by accepting an invitation'
);

select throws_ok(
  $sql$insert into public.tenancy_invitations
       (tenancy_id, invited_by_profile_id, email, token)
     values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc',
             '22222222-2222-4222-8222-222222222222',
             'x@example.ie',
             'not-a-valid-token')
     returning id$sql$,
  '23514',
  null,
  'a token that is not 64 hex characters is rejected'
);

select * from finish();

rollback;
