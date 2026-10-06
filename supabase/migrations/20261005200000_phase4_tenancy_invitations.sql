-- ============================================================================
-- DepositLock — Phase 4: tenancy creation & tenant invitations
--
-- Phase 4 turns the static creation shell into a real flow. A tenancy is now
-- created *before* its tenant exists: the landlord records the property and
-- the terms, an invitation link is issued, and only when the tenant accepts
-- does `tenant_profile_id` get set — at which point the tenancy moves from
-- `awaiting_tenant` to `awaiting_deposit`.
--
-- Design notes
-- ------------
-- * `tenancies.tenant_profile_id` becomes nullable. The existing
--   `tenancies_distinct_parties` check tolerates NULL, and a new check keeps
--   the invariant "a tenancy without a tenant is always pre-agreement".
-- * `tenancy_participants` keeps mirroring the contract: while the tenant is
--   unknown only the landlord row exists, so every participant-scoped policy
--   already behaves correctly with no changes.
-- * Invitations live in `tenancy_invitations`. The raw link token is stored
--   (server-generated, 64 hex chars, never derived from the email) so the
--   landlord can re-copy it; rows are landlord-readable and never writable
--   from the client — all lifecycle changes go through SECURITY DEFINER RPCs.
-- * The RPCs are the only sanctioned path that assigns a tenant. The
--   `guard_tenancy_mutation` trigger therefore refuses tenant reassignment
--   from client sessions: it trusts `current_user`, which is the function
--   owner inside a SECURITY DEFINER body and cannot be forged by
--   `authenticated`/`anon` (unlike a transaction-local GUC).
-- * Email-only invitations are matched against the profile e-mail on accept.
--   That is a deliberate MVP trust model: possession of the bearer link plus
--   a matching profile identity. Wallet-bound invitations require the
--   session's verified wallet to match exactly.
-- * Declining requires a signed-in session but not an identity match —
--   the bearer of the link may decline; accepting always requires the match.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. A tenancy may exist before its tenant is known
-- ---------------------------------------------------------------------------

alter table public.tenancies
  alter column tenant_profile_id drop not null;

alter table public.tenancies
  add constraint tenancies_tenant_state
  check (
    tenant_profile_id is not null
    or status in ('draft', 'awaiting_tenant')
  );

comment on constraint tenancies_tenant_state on public.tenancies is
  'A tenancy without a tenant may only sit in a pre-agreement state; acceptance assigns the tenant and moves it to awaiting_deposit.';

comment on column public.tenancies.tenant_profile_id is
  'The accepting tenant''s profile. Null while the tenancy waits for an invitation to be accepted.';

-- ---------------------------------------------------------------------------
-- 2. Participant graph: null-tenant aware
--
-- `sync_tenancy_participants` skips the tenant row until one exists; the
-- reassign trigger then creates it (as `accepted`, because by then the
-- tenancy has left `draft`) the moment acceptance assigns the tenant.
-- ---------------------------------------------------------------------------

create or replace function public.sync_tenancy_participants()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.tenancy_participants where tenancy_id = new.id;

  insert into public.tenancy_participants
    (tenancy_id, profile_id, role, status, joined_at, accepted_at)
  values
    (new.id, new.landlord_profile_id, 'landlord', 'accepted', now(), now());

  if new.tenant_profile_id is not null then
    insert into public.tenancy_participants
      (tenancy_id, profile_id, role, status, joined_at, accepted_at)
    values
      (
        new.id,
        new.tenant_profile_id,
        'tenant',
        case when new.status = 'draft' then 'invited' else 'accepted' end,
        now(),
        case when new.status = 'draft' then null else now() end
      );
  end if;

  return new;
end;
$$;

comment on function public.sync_tenancy_participants() is
  'Derives the participants graph from the contract; the tenant row appears only once the tenant is known.';

-- 2b. Party rows may only ever describe the tenancy's own contract — now
--     also while the contract still has no tenant.

create or replace function public.guard_tenancy_participant()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_landlord uuid;
  v_tenant uuid;
begin
  select landlord_profile_id, tenant_profile_id
    into v_landlord, v_tenant
  from public.tenancies
  where id = new.tenancy_id;

  if not found then
    raise exception 'Tenancy % does not exist', new.tenancy_id
      using errcode = '23503';
  end if;

  if new.profile_id = v_landlord then
    if new.role <> 'landlord' then
      raise exception 'Only the tenancy landlord may hold the landlord role'
        using errcode = '23514';
    end if;
  elsif v_tenant is not null and new.profile_id = v_tenant then
    if new.role <> 'tenant' then
      raise exception 'Only the tenancy tenant may hold the tenant role'
        using errcode = '23514';
    end if;
  else
    raise exception 'Profile % is not a party of tenancy %', new.profile_id, new.tenancy_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.guard_tenancy_participant() is
  'Rejects participant rows that do not match the tenancy contract, including while the tenant is still unknown.';

-- 2c. Tenancy lifecycle: auto timestamps + who may change what.
--
--     Compared to Phase 3A this adds two authorisation rules on top of the
--     existing freeze rules, for sessions that carry an identity:
--       * contract fields are landlord-only,
--       * `tenant_profile_id` never changes outside the invitation RPCs.
--     Migrations, seeds and the SECURITY DEFINER RPCs run with owner rights
--     (`current_user` = the migration role) and pass through untouched.

create or replace function public.guard_tenancy_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_internal boolean := current_user in ('postgres', 'service_role');
  v_party_changed boolean;
  v_contract_changed boolean;
begin
  if tg_op = 'INSERT' then
    if new.status = 'closed' and new.closed_at is null then
      new.closed_at := now();
    end if;
    if new.status = 'protected' and new.activated_at is null then
      new.activated_at := now();
    end if;
    return new;
  end if;

  v_party_changed := new.tenant_profile_id is distinct from old.tenant_profile_id;
  v_contract_changed :=
       new.property_id is distinct from old.property_id
    or new.landlord_profile_id is distinct from old.landlord_profile_id
    or new.deposit_amount is distinct from old.deposit_amount
    or new.monthly_rent_amount is distinct from old.monthly_rent_amount
    or new.start_date is distinct from old.start_date;

  if v_party_changed and not v_internal then
    raise exception 'The tenant may only be assigned by accepting an invitation'
      using errcode = '23514';
  end if;

  if old.status = 'closed' then
    if new.property_id is distinct from old.property_id
       or new.landlord_profile_id is distinct from old.landlord_profile_id
       or new.tenant_profile_id is distinct from old.tenant_profile_id
       or new.deposit_amount is distinct from old.deposit_amount
       or new.monthly_rent_amount is distinct from old.monthly_rent_amount
       or new.start_date is distinct from old.start_date then
      raise exception 'A closed tenancy is immutable'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if v_contract_changed then
    if old.status not in ('draft', 'awaiting_tenant') then
      raise exception 'Contract fields are frozen once the tenancy leaves %/%',
        'draft', 'awaiting_tenant'
        using errcode = '23514';
    end if;
    if not v_internal and (v_actor is null or v_actor <> old.landlord_profile_id) then
      raise exception 'Only the landlord may amend the tenancy contract'
        using errcode = '23514';
    end if;
  end if;

  if new.status = 'closed' and new.closed_at is null then
    new.closed_at := now();
  end if;

  if new.status <> 'closed' then
    new.closed_at := null;
  end if;

  if new.status = 'protected' and new.activated_at is null then
    new.activated_at := now();
  end if;

  return new;
end;
$$;

comment on function public.guard_tenancy_mutation() is
  'Auto timestamps plus defence in depth: contract fields are landlord-only and the tenant is assigned only by the invitation RPCs.';

-- ---------------------------------------------------------------------------
-- 3. Activity timeline: the tenant declining is a recorded event
-- ---------------------------------------------------------------------------

alter table public.activity_events
  drop constraint activity_events_type;

alter table public.activity_events
  add constraint activity_events_type
  check (event_type in (
    'tenancy_created',
    'tenant_invited',
    'tenant_accepted',
    'tenant_declined',
    'deposit_funded',
    'deposit_protected',
    'evidence_added',
    'move_out_started',
    'deduction_proposed',
    'deduction_accepted',
    'deduction_challenged',
    'dispute_opened',
    'dispute_resolved',
    'settlement_approved',
    'settlement_completed',
    'tenancy_closed'
  ));

-- ---------------------------------------------------------------------------
-- 4. tenancy_invitations
--
-- One row per invitation attempt. `token` is the bearer credential of the
-- `/invite/<token>` link: 64 hex chars built from two server-side UUIDs, so
-- it never encodes the e-mail address. The raw value is stored so the
-- landlord can copy the link again; it is exposed through the landlord-only
-- SELECT policy and nowhere else.
-- ---------------------------------------------------------------------------

create table public.tenancy_invitations (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null
    references public.tenancies (id) on delete cascade,
  invited_by_profile_id uuid not null
    references public.profiles (id) on delete restrict,
  accepted_by_profile_id uuid
    references public.profiles (id) on delete set null,
  email text,
  wallet_address text,
  token text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  constraint tenancy_invitations_token_shape
    check (token ~ '^[0-9a-f]{64}$'),
  constraint tenancy_invitations_status
    check (status in ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
  constraint tenancy_invitations_target
    check (email is not null or wallet_address is not null),
  constraint tenancy_invitations_email_length
    check (email is null or char_length(email) between 3 and 254),
  constraint tenancy_invitations_email_normalized
    check (email is null or email = lower(email)),
  constraint tenancy_invitations_wallet_length
    check (wallet_address is null or char_length(wallet_address) between 32 and 64),
  constraint tenancy_invitations_accepted_consistency
    check ((status = 'accepted') = (accepted_at is not null))
);

-- At most one pending invitation per tenancy: issuing a new one cancels the
-- old first, so the slot is freed for re-invitation after a cancel, decline
-- or expiry.
create unique index tenancy_invitations_one_pending
  on public.tenancy_invitations (tenancy_id)
  where status = 'pending';

create index tenancy_invitations_tenancy_idx
  on public.tenancy_invitations (tenancy_id, created_at desc);

comment on table public.tenancy_invitations is
  'Bearer-link invitations that assign the tenant of a tenancy once accepted.';

-- ---------------------------------------------------------------------------
-- 5. RLS: the landlord may read their invitations; nobody writes them
--    directly — every mutation is a SECURITY DEFINER RPC below.
-- ---------------------------------------------------------------------------

alter table public.tenancy_invitations enable row level security;

create policy invitations_select_landlord on public.tenancy_invitations
  for select to authenticated
  using (public.is_tenancy_landlord(tenancy_id, auth.uid()));

grant select on public.tenancy_invitations to authenticated, service_role;

revoke insert, update, delete on public.tenancy_invitations
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. RPCs
--
-- All are SECURITY DEFINER with a restricted search_path: they run with the
-- migration role's rights, see the rows they need regardless of RLS, and are
-- revoked from PUBLIC up front so each role only gets the calls it needs.
-- ---------------------------------------------------------------------------

-- 6a. Create property (optional) + tenancy + invitation in one transaction.

create or replace function public.create_tenancy_with_invitation(
  p_start_date date,
  p_monthly_rent numeric,
  p_deposit numeric,
  p_end_date date default null,
  p_tenant_email text default null,
  p_tenant_wallet text default null,
  p_property_id uuid default null,
  p_property jsonb default null,
  p_currency text default 'EUR'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_property_id uuid := p_property_id;
  v_email text := nullif(lower(btrim(coalesce(p_tenant_email, ''))), '');
  v_wallet text := nullif(btrim(coalesce(p_tenant_wallet, '')), '');
  v_tenancy_id uuid;
  v_token text;
begin
  if v_actor is null then
    raise exception 'Sign in to create a tenancy'
      using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = v_actor;
  if not found then
    raise exception 'Complete your profile before creating a tenancy'
      using errcode = '23514';
  end if;

  if v_email is null and v_wallet is null then
    raise exception 'An invitation needs an email address or a wallet address'
      using errcode = '23514';
  end if;

  if v_email = v_profile.email
     or (v_wallet is not null and v_wallet = v_profile.wallet_address) then
    raise exception 'You cannot invite yourself to a tenancy'
      using errcode = '23514';
  end if;

  if p_start_date is null then
    raise exception 'The tenancy start date is required'
      using errcode = '23514';
  end if;

  if p_end_date is not null and p_end_date <= p_start_date then
    raise exception 'The end date must be after the start date'
      using errcode = '23514';
  end if;

  if p_monthly_rent is null or p_monthly_rent < 0 then
    raise exception 'The monthly rent must be zero or more'
      using errcode = '23514';
  end if;

  if p_deposit is null or p_deposit <= 0 then
    raise exception 'The deposit must be greater than zero'
      using errcode = '23514';
  end if;

  if v_property_id is null then
    if p_property is null then
      raise exception 'Choose an existing property or enter a new address'
        using errcode = '23514';
    end if;
    if nullif(btrim(coalesce(p_property->>'address_line_1', '')), '') is null then
      raise exception 'The property address is required'
        using errcode = '23514';
    end if;
    if nullif(btrim(coalesce(p_property->>'city', '')), '') is null then
      raise exception 'The property city is required'
        using errcode = '23514';
    end if;
    if nullif(btrim(coalesce(p_property->>'property_type', '')), '') is null then
      raise exception 'The property type is required'
        using errcode = '23514';
    end if;

    insert into public.properties (
      created_by_profile_id,
      address_line_1,
      address_line_2,
      city,
      county,
      postal_code,
      country,
      property_type,
      bedrooms,
      cover_image_url
    ) values (
      v_actor,
      btrim(p_property->>'address_line_1'),
      nullif(btrim(coalesce(p_property->>'address_line_2', '')), ''),
      btrim(p_property->>'city'),
      nullif(btrim(coalesce(p_property->>'county', '')), ''),
      nullif(btrim(coalesce(p_property->>'postal_code', '')), ''),
      coalesce(nullif(btrim(coalesce(p_property->>'country', '')), ''), 'IE'),
      btrim(p_property->>'property_type'),
      nullif(btrim(coalesce(p_property->>'bedrooms', '')), '')::smallint,
      nullif(btrim(coalesce(p_property->>'cover_image_url', '')), '')
    )
    returning id into v_property_id;
  else
    if not exists (
      select 1
      from public.properties
      where id = v_property_id
        and created_by_profile_id = v_actor
    ) then
      raise exception 'That property could not be found'
        using errcode = 'P0002';
    end if;
  end if;

  insert into public.tenancies (
    property_id,
    landlord_profile_id,
    tenant_profile_id,
    start_date,
    end_date,
    monthly_rent_amount,
    deposit_amount,
    display_currency,
    status
  ) values (
    v_property_id,
    v_actor,
    null,
    p_start_date,
    p_end_date,
    p_monthly_rent,
    p_deposit,
    coalesce(nullif(btrim(p_currency), ''), 'EUR'),
    'awaiting_tenant'
  )
  returning id into v_tenancy_id;

  v_token := replace(gen_random_uuid()::text, '-', '')
          || replace(gen_random_uuid()::text, '-', '');

  insert into public.tenancy_invitations (
    tenancy_id,
    invited_by_profile_id,
    email,
    wallet_address,
    token
  ) values (
    v_tenancy_id,
    v_actor,
    v_email,
    v_wallet,
    v_token
  );

  insert into public.activity_events
    (tenancy_id, actor_profile_id, event_type, title, description)
  values
    (v_tenancy_id, v_actor, 'tenancy_created', 'Tenancy created',
     'The agreement was recorded and is waiting for the tenant.'),
    (v_tenancy_id, v_actor, 'tenant_invited', 'Tenant invited',
     'An invitation link was generated for the tenant.');

  return jsonb_build_object(
    'tenancy_id', v_tenancy_id,
    'property_id', v_property_id,
    'invitation_token', v_token
  );
end;
$$;

comment on function public.create_tenancy_with_invitation(date, numeric, numeric, date, text, text, uuid, jsonb, text) is
  'Creates the property (optional), the awaiting_tenant tenancy and its first invitation in one transaction. Returns the tenancy id and the raw invitation token.';

-- 6b. Issue a fresh invitation for a tenancy that is still waiting for a
--     tenant (re-invitation after a cancel, decline or expiry).

create or replace function public.create_tenancy_invitation(
  p_tenancy_id uuid,
  p_tenant_email text default null,
  p_tenant_wallet text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_email text := nullif(lower(btrim(coalesce(p_tenant_email, ''))), '');
  v_wallet text := nullif(btrim(coalesce(p_tenant_wallet, '')), '');
  v_status text;
  v_tenant uuid;
  v_invitation_id uuid;
  v_token text;
begin
  if v_actor is null then
    raise exception 'Sign in to manage invitations'
      using errcode = '42501';
  end if;

  if not public.is_tenancy_landlord(p_tenancy_id, v_actor) then
    raise exception 'Only the landlord may send invitations'
      using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = v_actor;
  if not found then
    raise exception 'Complete your profile before sending an invitation'
      using errcode = '23514';
  end if;

  if v_email is null and v_wallet is null then
    raise exception 'An invitation needs an email address or a wallet address'
      using errcode = '23514';
  end if;

  if v_email = v_profile.email
     or (v_wallet is not null and v_wallet = v_profile.wallet_address) then
    raise exception 'You cannot invite yourself to a tenancy'
      using errcode = '23514';
  end if;

  select status, tenant_profile_id
    into v_status, v_tenant
  from public.tenancies
  where id = p_tenancy_id;

  if not found then
    raise exception 'That tenancy could not be found'
      using errcode = 'P0002';
  end if;

  if v_tenant is not null or v_status not in ('draft', 'awaiting_tenant') then
    raise exception 'This tenancy is no longer waiting for a tenant'
      using errcode = '23514';
  end if;

  update public.tenancy_invitations
    set status = 'cancelled'
  where tenancy_id = p_tenancy_id
    and status = 'pending';

  v_token := replace(gen_random_uuid()::text, '-', '')
          || replace(gen_random_uuid()::text, '-', '');

  insert into public.tenancy_invitations (
    tenancy_id,
    invited_by_profile_id,
    email,
    wallet_address,
    token
  ) values (
    p_tenancy_id,
    v_actor,
    v_email,
    v_wallet,
    v_token
  )
  returning id into v_invitation_id;

  insert into public.activity_events
    (tenancy_id, actor_profile_id, event_type, title, description)
  values
    (p_tenancy_id, v_actor, 'tenant_invited', 'Tenant invited',
     'An invitation link was generated for the tenant.');

  return jsonb_build_object(
    'invitation_id', v_invitation_id,
    'invitation_token', v_token
  );
end;
$$;

comment on function public.create_tenancy_invitation(uuid, text, text) is
  'Landlord-only re-invitation: cancels any pending invitation and issues a fresh token while the tenancy still waits for a tenant.';

-- 6c. Preview an invitation from the public /invite/<token> page.

create or replace function public.resolve_tenancy_invitation(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'invitation_status',
      case
        when i.expires_at < now() then 'expired'
        else i.status
      end,
    'expires_at', i.expires_at,
    'landlord_name', pr.full_name,
    'property', jsonb_build_object(
      'address_line_1', p.address_line_1,
      'city', p.city,
      'county', p.county,
      'postal_code', p.postal_code,
      'property_type', p.property_type,
      'bedrooms', p.bedrooms
    ),
    'terms', jsonb_build_object(
      'start_date', t.start_date,
      'end_date', t.end_date,
      'monthly_rent', t.monthly_rent_amount,
      'deposit', t.deposit_amount,
      'currency', t.display_currency
    )
  )
  from public.tenancy_invitations i
  join public.tenancies t on t.id = i.tenancy_id
  join public.properties p on p.id = t.property_id
  join public.profiles pr on pr.id = t.landlord_profile_id
  where i.token = p_token;
$$;

comment on function public.resolve_tenancy_invitation(text) is
  'Public, read-only preview of an invitation: address, landlord name, terms and invitation state. Returns no e-mail addresses and no tenancy id.';

-- 6d. Accept: the only path that assigns a tenant to a tenancy.

create or replace function public.accept_tenancy_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_invitation public.tenancy_invitations%rowtype;
  v_profile public.profiles%rowtype;
  v_status text;
  v_landlord uuid;
  v_tenant uuid;
begin
  if v_actor is null then
    raise exception 'Sign in with your wallet to accept this invitation'
      using errcode = '42501';
  end if;

  select * into v_invitation
  from public.tenancy_invitations
  where token = p_token
  for update;

  if not found then
    raise exception 'This invitation link is not valid'
      using errcode = 'P0002';
  end if;

  if v_invitation.status = 'accepted' then
    if v_invitation.accepted_by_profile_id = v_actor then
      return jsonb_build_object('tenancy_id', v_invitation.tenancy_id);
    end if;
    raise exception 'This invitation has already been accepted'
      using errcode = '42501';
  end if;

  if v_invitation.status <> 'pending' then
    raise exception 'This invitation is no longer active'
      using errcode = '23514';
  end if;

  if v_invitation.expires_at < now() then
    update public.tenancy_invitations
      set status = 'expired'
    where id = v_invitation.id;

    raise exception 'This invitation has expired. Ask the landlord to send a new one.'
      using errcode = '23514';
  end if;

  select * into v_profile from public.profiles where id = v_actor;
  if not found then
    raise exception 'Complete your profile before accepting this invitation'
      using errcode = '23514';
  end if;

  select status, landlord_profile_id, tenant_profile_id
    into v_status, v_landlord, v_tenant
  from public.tenancies
  where id = v_invitation.tenancy_id;

  if v_tenant is not null or v_status not in ('draft', 'awaiting_tenant') then
    raise exception 'This tenancy is no longer waiting for a tenant'
      using errcode = '23514';
  end if;

  if v_landlord = v_actor then
    raise exception 'The landlord cannot accept their own invitation'
      using errcode = '42501';
  end if;

  if v_invitation.wallet_address is not null then
    if v_profile.wallet_address is null
       or v_profile.wallet_address <> v_invitation.wallet_address then
      raise exception 'This invitation was sent to a different wallet. Open it with the invited wallet to accept.'
        using errcode = '42501';
    end if;
  elsif lower(v_profile.email) <> lower(v_invitation.email) then
    raise exception 'This invitation was sent to a different email address. Open it with the invited wallet to accept.'
      using errcode = '42501';
  end if;

  update public.tenancies
    set tenant_profile_id = v_actor,
        status = 'awaiting_deposit'
  where id = v_invitation.tenancy_id;

  update public.tenancy_invitations
    set status = 'accepted',
        accepted_at = now(),
        accepted_by_profile_id = v_actor
  where id = v_invitation.id;

  insert into public.activity_events
    (tenancy_id, actor_profile_id, event_type, title, description)
  values
    (v_invitation.tenancy_id, v_actor, 'tenant_accepted',
     'Tenant accepted the agreement',
     'The tenant signed in and accepted the tenancy terms.');

  return jsonb_build_object('tenancy_id', v_invitation.tenancy_id);
end;
$$;

comment on function public.accept_tenancy_invitation(text) is
  'Accepts a pending invitation: verifies the session against the invited wallet or e-mail, assigns the tenant and moves the tenancy to awaiting_deposit. Accepting twice with the same profile is idempotent.';

-- 6e. Decline: signed-in bearer of the link may decline; the tenancy is
--     untouched and the landlord can invite again.

create or replace function public.decline_tenancy_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_invitation public.tenancy_invitations%rowtype;
  v_actor_profile uuid := null;
begin
  if v_actor is null then
    raise exception 'Sign in to respond to this invitation'
      using errcode = '42501';
  end if;

  select * into v_invitation
  from public.tenancy_invitations
  where token = p_token
  for update;

  if not found then
    raise exception 'This invitation link is not valid'
      using errcode = 'P0002';
  end if;

  if v_invitation.status = 'declined' then
    return jsonb_build_object(
      'invitation_id', v_invitation.id,
      'status', 'declined'
    );
  end if;

  if v_invitation.status <> 'pending' then
    raise exception 'This invitation is no longer active'
      using errcode = '23514';
  end if;

  if v_invitation.expires_at < now() then
    update public.tenancy_invitations
      set status = 'expired'
    where id = v_invitation.id;

    raise exception 'This invitation has expired. Ask the landlord to send a new one.'
      using errcode = '23514';
  end if;

  if v_invitation.invited_by_profile_id = v_actor then
    raise exception 'The landlord cannot decline their own invitation'
      using errcode = '42501';
  end if;

  if exists (select 1 from public.profiles where id = v_actor) then
    v_actor_profile := v_actor;
  end if;

  update public.tenancy_invitations
    set status = 'declined'
  where id = v_invitation.id;

  insert into public.activity_events
    (tenancy_id, actor_profile_id, event_type, title, description)
  values
    (v_invitation.tenancy_id, v_actor_profile, 'tenant_declined',
     'Tenant declined the invitation',
     'The invited tenant declined the tenancy terms.');

  return jsonb_build_object(
    'invitation_id', v_invitation.id,
    'status', 'declined'
  );
end;
$$;

comment on function public.decline_tenancy_invitation(text) is
  'Declines a pending invitation. Requires a signed-in session but not an identity match — possession of the bearer link is enough to decline, never to accept.';

-- 6f. Cancel: landlord withdraws a pending invitation.

create or replace function public.cancel_tenancy_invitation(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_invitation public.tenancy_invitations%rowtype;
begin
  if v_actor is null then
    raise exception 'Sign in to manage invitations'
      using errcode = '42501';
  end if;

  select * into v_invitation
  from public.tenancy_invitations
  where id = p_invitation_id
  for update;

  if not found then
    raise exception 'That invitation could not be found'
      using errcode = 'P0002';
  end if;

  if not public.is_tenancy_landlord(v_invitation.tenancy_id, v_actor) then
    raise exception 'Only the landlord may cancel an invitation'
      using errcode = '42501';
  end if;

  if v_invitation.status <> 'pending' then
    raise exception 'Only a pending invitation can be cancelled'
      using errcode = '23514';
  end if;

  update public.tenancy_invitations
    set status = 'cancelled'
  where id = v_invitation.id;

  return jsonb_build_object(
    'invitation_id', v_invitation.id,
    'status', 'cancelled'
  );
end;
$$;

comment on function public.cancel_tenancy_invitation(uuid) is
  'Landlord-only: marks a pending invitation as cancelled so a new one can be issued.';

-- ---------------------------------------------------------------------------
-- 7. Explicit function privileges (mirrors Phase 3A/3B style)
-- ---------------------------------------------------------------------------

revoke execute on function public.create_tenancy_with_invitation(date, numeric, numeric, date, text, text, uuid, jsonb, text) from public;
revoke execute on function public.create_tenancy_with_invitation(date, numeric, numeric, date, text, text, uuid, jsonb, text) from anon;
grant execute on function public.create_tenancy_with_invitation(date, numeric, numeric, date, text, text, uuid, jsonb, text) to authenticated, service_role;

revoke execute on function public.create_tenancy_invitation(uuid, text, text) from public;
revoke execute on function public.create_tenancy_invitation(uuid, text, text) from anon;
grant execute on function public.create_tenancy_invitation(uuid, text, text) to authenticated, service_role;

-- The preview is deliberately public: the invite page renders before sign-in.
revoke execute on function public.resolve_tenancy_invitation(text) from public;
grant execute on function public.resolve_tenancy_invitation(text) to anon, authenticated, service_role;

revoke execute on function public.accept_tenancy_invitation(text) from public;
revoke execute on function public.accept_tenancy_invitation(text) from anon;
grant execute on function public.accept_tenancy_invitation(text) to authenticated, service_role;

revoke execute on function public.decline_tenancy_invitation(text) from public;
revoke execute on function public.decline_tenancy_invitation(text) from anon;
grant execute on function public.decline_tenancy_invitation(text) to authenticated, service_role;

revoke execute on function public.cancel_tenancy_invitation(uuid) from public;
revoke execute on function public.cancel_tenancy_invitation(uuid) from anon;
grant execute on function public.cancel_tenancy_invitation(uuid) to authenticated, service_role;
