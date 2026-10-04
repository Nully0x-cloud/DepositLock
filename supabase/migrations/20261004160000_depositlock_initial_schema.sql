-- ============================================================================
-- DepositLock — Phase 3A: initial schema
--
-- Design notes
-- ------------
-- * All ids are UUIDs, all timestamps are `timestamptz`.
-- * Money is `numeric(12,2)` — never floating point.
-- * Roles are tenancy-scoped: a profile can be a landlord on one tenancy and
--   a tenant on another. There is no global `role` column anywhere.
-- * Off-chain rows complement Solana state: only addresses / references are
--   stored (`blockchain_reference`, `vault_address`, `settlement_token`).
--   No keys, seed phrases or signing material ever live here.
-- * Statuses/categories use `text` + CHECK constraints rather than PostgreSQL
--   enum types: adding a value is a non-destructive, transaction-safe
--   `ALTER ... ADD CONSTRAINT`, whereas `ALTER TYPE ... ADD VALUE` historically
--   could not run inside a transaction. Migration history stays append-only.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Reusable trigger helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Shared BEFORE UPDATE trigger that keeps updated_at authoritative.';

create or replace function public.normalize_profile()
returns trigger
language plpgsql
as $$
begin
  new.full_name := btrim(new.full_name);
  new.email := lower(btrim(new.email));
  if new.wallet_address is not null then
    new.wallet_address := btrim(new.wallet_address);
  end if;
  return new;
end;
$$;

comment on function public.normalize_profile() is
  'Trims name/wallet and lowercases email so comparisons are predictable.';

-- ---------------------------------------------------------------------------
-- 1. profiles
--
-- Identity is wallet-shaped: `wallet_address` is unique and nullable so a
-- profile can exist before a wallet is bound. Once Sign-In-With-Solana is
-- wired, `profiles.id` is expected to mirror the auth subject (`auth.uid()`).
-- There is deliberately no tenant/landlord column here.
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  wallet_address text unique,
  full_name text not null,
  email text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_full_name_length
    check (char_length(btrim(full_name)) between 2 and 80),
  constraint profiles_email_length
    check (char_length(email) between 3 and 254),
  constraint profiles_email_shape
    check (email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'),
  constraint profiles_email_normalized
    check (email = lower(email)),
  constraint profiles_wallet_length
    check (wallet_address is null or char_length(wallet_address) between 32 and 64)
);

create index profiles_created_at_idx on public.profiles (created_at desc);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger profiles_normalize
  before insert or update on public.profiles
  for each row execute function public.normalize_profile();

-- ---------------------------------------------------------------------------
-- 2. properties
--
-- A property has exactly one creator/manager for MVP. This is *not* tokenised
-- ownership — it is simply who entered the record.
-- ---------------------------------------------------------------------------

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  created_by_profile_id uuid not null
    references public.profiles (id) on delete restrict,
  address_line_1 text not null,
  address_line_2 text,
  city text not null,
  county text,
  postal_code text,
  country text not null default 'IE',
  property_type text not null,
  cover_image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint properties_address_line_1_length
    check (char_length(btrim(address_line_1)) between 3 and 200),
  constraint properties_city_length
    check (char_length(btrim(city)) between 2 and 100),
  constraint properties_country_shape
    check (country ~ '^[A-Z]{2}$'),
  constraint properties_type
    check (property_type in (
      'apartment', 'house', 'studio', 'shared_accommodation', 'other'
    ))
);

create index properties_created_by_idx
  on public.properties (created_by_profile_id);
create index properties_city_idx on public.properties (lower(city));

create trigger properties_set_updated_at
  before update on public.properties
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. tenancies
--
-- The landlord/tenant columns are the contractual record for MVP.
-- `tenancy_participants` (below) is the derived, queryable role graph that
-- keeps "who may see this" and future multi-party expansion in one place.
-- ---------------------------------------------------------------------------

create table public.tenancies (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null
    references public.properties (id) on delete restrict,
  landlord_profile_id uuid not null
    references public.profiles (id) on delete restrict,
  tenant_profile_id uuid not null
    references public.profiles (id) on delete restrict,
  start_date date not null,
  end_date date,
  monthly_rent_amount numeric(12, 2) not null,
  deposit_amount numeric(12, 2) not null,
  display_currency text not null default 'EUR',
  settlement_token text,
  status text not null default 'draft',
  blockchain_reference text,
  vault_address text,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  closed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint tenancies_distinct_parties
    check (landlord_profile_id <> tenant_profile_id),
  constraint tenancies_date_order
    check (end_date is null or end_date > start_date),
  constraint tenancies_rent_non_negative
    check (monthly_rent_amount >= 0),
  constraint tenancies_deposit_positive
    check (deposit_amount > 0),
  constraint tenancies_currency_shape
    check (display_currency ~ '^[A-Z]{3}$'),
  constraint tenancies_settlement_token_shape
    check (settlement_token is null or settlement_token ~ '^[A-Z0-9]{3,12}$'),
  constraint tenancies_status
    check (status in (
      'draft',
      'awaiting_tenant',
      'awaiting_deposit',
      'protected',
      'move_out_review',
      'deduction_proposed',
      'disputed',
      'settlement_pending',
      'closed',
      'cancelled'
    )),
  constraint tenancies_closed_consistency
    check ((status = 'closed') = (closed_at is not null))
);

create index tenancies_property_idx on public.tenancies (property_id);
create index tenancies_landlord_idx on public.tenancies (landlord_profile_id);
create index tenancies_tenant_idx on public.tenancies (tenant_profile_id);
create index tenancies_status_idx on public.tenancies (status);

create trigger tenancies_set_updated_at
  before update on public.tenancies
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. tenancy_participants
--
-- Decision: yes, a dedicated participants table.
--
-- The tenancy keeps explicit landlord/tenant columns (the contract), while
-- this table is the single authorization surface every other policy asks
-- ("is this profile in this tenancy?"). It also gives us `status`/`accepted_at`
-- for invitations and a clean path to more parties later (guarantor, agent,
-- mediator) without touching the tenancy table.
--
-- A pair of triggers keeps both representations from ever drifting apart.
-- ---------------------------------------------------------------------------

create table public.tenancy_participants (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null
    references public.tenancies (id) on delete cascade,
  profile_id uuid not null
    references public.profiles (id) on delete cascade,
  role text not null,
  joined_at timestamptz not null default now(),
  accepted_at timestamptz,
  status text not null default 'invited',
  constraint tenancy_participants_role
    check (role in ('landlord', 'tenant')),
  constraint tenancy_participants_status
    check (status in ('invited', 'accepted', 'declined')),
  constraint tenancy_participants_accepted_consistency
    check ((status = 'accepted') = (accepted_at is not null)),
  constraint tenancy_participants_unique_profile
    unique (tenancy_id, profile_id),
  constraint tenancy_participants_unique_role
    unique (tenancy_id, role)
);

create index tenancy_participants_profile_idx
  on public.tenancy_participants (profile_id);
create index tenancy_participants_tenancy_idx
  on public.tenancy_participants (tenancy_id);

-- ---------------------------------------------------------------------------
-- 5. deductions
--
-- Created before `evidence` so evidence can carry a composite foreign key
-- that guarantees deduction evidence always belongs to the same tenancy.
-- ---------------------------------------------------------------------------

create table public.deductions (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null
    references public.tenancies (id) on delete cascade,
  proposed_by_profile_id uuid not null
    references public.profiles (id) on delete restrict,
  amount numeric(12, 2) not null,
  reason_category text not null,
  description text not null,
  status text not null default 'proposed',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint deductions_amount_positive check (amount > 0),
  constraint deductions_reason_category
    check (reason_category in (
      'damage', 'missing_items', 'cleaning', 'unpaid_rent', 'utilities', 'other'
    )),
  constraint deductions_description_length
    check (char_length(btrim(description)) between 3 and 1000),
  constraint deductions_status
    check (status in (
      'proposed', 'accepted', 'challenged', 'withdrawn', 'resolved'
    )),
  constraint deductions_responded_consistency
    check ((status = 'proposed') = (responded_at is null)),
  constraint deductions_tenancy_unique_key
    unique (id, tenancy_id)
);

create index deductions_tenancy_idx on public.deductions (tenancy_id);
create index deductions_proposer_idx on public.deductions (proposed_by_profile_id);
create index deductions_status_idx on public.deductions (status);

create trigger deductions_set_updated_at
  before update on public.deductions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 6. evidence
--
-- `deduction_id` (rather than a join table) is the simplest clean MVP link.
-- The composite foreign key enforces "same tenancy" at the database level:
-- a NULL deduction_id simply means the evidence is not deduction-scoped.
-- Storage/URL upload is out of scope for Phase 3A — seeded URLs are local.
-- ---------------------------------------------------------------------------

create table public.evidence (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null
    references public.tenancies (id) on delete cascade,
  uploaded_by_profile_id uuid not null
    references public.profiles (id) on delete restrict,
  evidence_context text not null,
  deduction_id uuid,
  category text not null,
  file_url text,
  caption text not null,
  created_at timestamptz not null default now(),
  constraint evidence_context
    check (evidence_context in (
      'move_in', 'move_out', 'deduction', 'dispute'
    )),
  constraint evidence_category
    check (category in (
      'living_room', 'kitchen', 'bedroom', 'bathroom',
      'furniture', 'appliances', 'general', 'other'
    )),
  constraint evidence_caption_length
    check (char_length(btrim(caption)) between 1 and 500),
  constraint evidence_file_url_length
    check (file_url is null or char_length(file_url) <= 2048),
  constraint evidence_deduction_context_requires_link
    check (evidence_context <> 'deduction' or deduction_id is not null),
  constraint evidence_deduction_same_tenancy
    foreign key (deduction_id, tenancy_id)
    references public.deductions (id, tenancy_id)
    on delete cascade
);

create index evidence_tenancy_idx on public.evidence (tenancy_id);
create index evidence_uploader_idx on public.evidence (uploaded_by_profile_id);
create index evidence_deduction_idx on public.evidence (deduction_id)
  where deduction_id is not null;
create index evidence_context_idx on public.evidence (evidence_context);

-- ---------------------------------------------------------------------------
-- 7. disputes
--
-- MVP rule: a dispute always originates from a challenged deduction, so
-- `deduction_id` is NOT NULL. Relaxing that later is a single additive
-- migration. "One active dispute per deduction" is a partial unique index.
-- ---------------------------------------------------------------------------

create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null
    references public.tenancies (id) on delete cascade,
  deduction_id uuid not null
    references public.deductions (id) on delete cascade,
  opened_by_profile_id uuid not null
    references public.profiles (id) on delete restrict,
  reason text not null,
  status text not null default 'open',
  resolution_notes text,
  resolved_by_profile_id uuid
    references public.profiles (id) on delete set null,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint disputes_reason_length
    check (char_length(btrim(reason)) between 3 and 1000),
  constraint disputes_status
    check (status in ('open', 'under_review', 'resolved', 'cancelled')),
  constraint disputes_resolved_requires_timestamp
    check (status <> 'resolved' or resolved_at is not null),
  constraint disputes_resolver_requires_timestamp
    check (resolved_by_profile_id is null or resolved_at is not null),
  constraint disputes_resolution_notes_length
    check (resolution_notes is null or char_length(resolution_notes) <= 2000)
);

create unique index disputes_one_active_per_deduction
  on public.disputes (deduction_id)
  where status in ('open', 'under_review');

create index disputes_tenancy_idx on public.disputes (tenancy_id);
create index disputes_status_idx on public.disputes (status);

create trigger disputes_set_updated_at
  before update on public.disputes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 8. settlements
--
-- Exactly one settlement row per tenancy (UNIQUE), splits must add back up to
-- the original deposit, and nothing may be negative. Writes are intentionally
-- NOT granted to client roles — see the RLS section: this table is reserved
-- for server-side / on-chain reconciliation in a later phase.
-- ---------------------------------------------------------------------------

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null unique
    references public.tenancies (id) on delete cascade,
  original_deposit_amount numeric(12, 2) not null,
  tenant_amount numeric(12, 2) not null,
  landlord_amount numeric(12, 2) not null,
  settlement_type text not null,
  tenant_approved boolean not null default false,
  landlord_approved boolean not null default false,
  blockchain_transaction text,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  constraint settlements_original_positive
    check (original_deposit_amount > 0),
  constraint settlements_amounts_non_negative
    check (tenant_amount >= 0 and landlord_amount >= 0),
  constraint settlements_split_equals_original
    check (tenant_amount + landlord_amount = original_deposit_amount),
  constraint settlements_type
    check (settlement_type in (
      'full_return', 'partial_deduction', 'disputed_resolution'
    ))
);

create index settlements_tenancy_idx on public.settlements (tenancy_id);

-- ---------------------------------------------------------------------------
-- 9. activity_events — append-only timeline
-- ---------------------------------------------------------------------------

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null
    references public.tenancies (id) on delete cascade,
  actor_profile_id uuid
    references public.profiles (id) on delete set null,
  event_type text not null,
  title text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  blockchain_reference text,
  created_at timestamptz not null default now(),
  constraint activity_events_type
    check (event_type in (
      'tenancy_created',
      'tenant_invited',
      'tenant_accepted',
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
    )),
  constraint activity_events_title_length
    check (char_length(btrim(title)) between 1 and 200),
  constraint activity_events_description_length
    check (description is null or char_length(description) <= 1000),
  constraint activity_events_metadata_is_object
    check (jsonb_typeof(metadata) = 'object')
);

create index activity_events_tenancy_created_idx
  on public.activity_events (tenancy_id, created_at desc);
create index activity_events_actor_idx
  on public.activity_events (actor_profile_id);

-- ---------------------------------------------------------------------------
-- 10. notifications — persistence foundation only (no email/push in Phase 3A)
-- ---------------------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null
    references public.profiles (id) on delete cascade,
  tenancy_id uuid
    references public.tenancies (id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_type
    check (type in (
      'tenant_invited',
      'deposit_protected',
      'evidence_added',
      'deduction_proposed',
      'deduction_resolved',
      'dispute_opened',
      'dispute_resolved',
      'settlement_ready',
      'tenancy_closed',
      'system'
    )),
  constraint notifications_title_length
    check (char_length(btrim(title)) between 1 and 200),
  constraint notifications_body_length
    check (body is null or char_length(body) <= 2000)
);

create index notifications_profile_created_idx
  on public.notifications (profile_id, created_at desc);
create index notifications_unread_idx
  on public.notifications (profile_id)
  where read_at is null;

-- ---------------------------------------------------------------------------
-- 11. Authorization helper functions
--
-- These are SECURITY DEFINER (owned by the migration role, i.e. `postgres`,
-- which owns the tables and therefore bypasses RLS). That is what keeps the
-- policies free of infinite recursion when a policy on table A needs to read
-- table B, whose own policy would otherwise read table A again.
--
-- They expose booleans only � never row data � and are executed with a
-- restricted search_path.
-- ---------------------------------------------------------------------------

create or replace function public.is_tenancy_participant(p_tenancy_id uuid, p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.tenancy_participants tp
    where tp.tenancy_id = p_tenancy_id
      and tp.profile_id = p_profile_id
      and tp.status <> 'declined'
  );
$$;

create or replace function public.is_tenancy_landlord(p_tenancy_id uuid, p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.tenancies t
    where t.id = p_tenancy_id
      and t.landlord_profile_id = p_profile_id
  );
$$;

create or replace function public.is_tenancy_tenant(p_tenancy_id uuid, p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.tenancies t
    where t.id = p_tenancy_id
      and t.tenant_profile_id = p_profile_id
  );
$$;

create or replace function public.can_read_property(p_property_id uuid, p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.tenancies t
    where t.property_id = p_property_id
      and (t.landlord_profile_id = p_profile_id or t.tenant_profile_id = p_profile_id)
  );
$$;

comment on function public.is_tenancy_participant(uuid, uuid) is
  'True when the profile is an invited or accepted participant of the tenancy.';
comment on function public.can_read_property(uuid, uuid) is
  'True when the profile participates in a tenancy situated on the property.';

revoke execute on function public.is_tenancy_participant(uuid, uuid) from public, anon;
revoke execute on function public.is_tenancy_landlord(uuid, uuid) from public, anon;
revoke execute on function public.is_tenancy_tenant(uuid, uuid) from public, anon;
revoke execute on function public.can_read_property(uuid, uuid) from public, anon;

grant execute on function public.is_tenancy_participant(uuid, uuid) to authenticated, service_role;
grant execute on function public.is_tenancy_landlord(uuid, uuid) to authenticated, service_role;
grant execute on function public.is_tenancy_tenant(uuid, uuid) to authenticated, service_role;
grant execute on function public.can_read_property(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 12. Integrity triggers
-- ---------------------------------------------------------------------------

-- 12a. Keep the participants graph identical to the tenancy contract.
create or replace function public.sync_tenancy_participants()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.tenancy_participants where tenancy_id = new.id;

  insert into public.tenancy_participants (tenancy_id, profile_id, role, status, joined_at, accepted_at)
  values
    (new.id, new.landlord_profile_id, 'landlord', 'accepted', now(), now()),
    (
      new.id,
      new.tenant_profile_id,
      'tenant',
      case when new.status = 'draft' then 'invited' else 'accepted' end,
      now(),
      case when new.status = 'draft' then null else now() end
    );

  return new;
end;
$$;

create trigger tenancies_sync_participants_insert
  after insert on public.tenancies
  for each row execute function public.sync_tenancy_participants();

create trigger tenancies_sync_participants_reassign
  after update of landlord_profile_id, tenant_profile_id on public.tenancies
  for each row
  when (old.landlord_profile_id is distinct from new.landlord_profile_id
     or old.tenant_profile_id is distinct from new.tenant_profile_id)
  execute function public.sync_tenancy_participants();

-- 12b. Party rows may only ever describe the tenancy's own contract.
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

  if new.profile_id <> v_landlord and new.profile_id <> v_tenant then
    raise exception 'Profile % is not a party of tenancy %', new.profile_id, new.tenancy_id
      using errcode = '23514';
  end if;

  if new.role = 'landlord' and new.profile_id <> v_landlord then
    raise exception 'Only the tenancy landlord may hold the landlord role'
      using errcode = '23514';
  end if;

  if new.role = 'tenant' and new.profile_id <> v_tenant then
    raise exception 'Only the tenancy tenant may hold the tenant role'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger tenancy_participants_guard
  before insert or update on public.tenancy_participants
  for each row execute function public.guard_tenancy_participant();

-- 12c. Tenancy lifecycle: auto timestamps + critical-field immutability.
create or replace function public.guard_tenancy_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
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

  if new.property_id is distinct from old.property_id
     or new.landlord_profile_id is distinct from old.landlord_profile_id
     or new.tenant_profile_id is distinct from old.tenant_profile_id
     or new.deposit_amount is distinct from old.deposit_amount
     or new.monthly_rent_amount is distinct from old.monthly_rent_amount
     or new.start_date is distinct from old.start_date then
    if old.status not in ('draft', 'awaiting_tenant') then
      raise exception 'Contract fields are frozen once the tenancy leaves %/%',
        'draft', 'awaiting_tenant'
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

create trigger tenancies_guard_mutation
  before insert or update on public.tenancies
  for each row execute function public.guard_tenancy_mutation();

-- 12d. Deductions: deposit ceiling, proposer must be the landlord, and
--      who may change what once it exists.
create or replace function public.guard_deduction()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_deposit numeric(12, 2);
  v_landlord uuid;
  v_tenant uuid;
  v_tenancy_status text;
  v_actor uuid := auth.uid();
begin
  select deposit_amount, landlord_profile_id, tenant_profile_id, status
    into v_deposit, v_landlord, v_tenant, v_tenancy_status
  from public.tenancies
  where id = new.tenancy_id;

  if not found then
    raise exception 'Tenancy % does not exist', new.tenancy_id
      using errcode = '23503';
  end if;

  if new.amount > v_deposit then
    raise exception 'Deduction % exceeds the deposit amount %', new.amount, v_deposit
      using errcode = '23514';
  end if;

  if new.proposed_by_profile_id <> v_landlord then
    raise exception 'Only the landlord may propose a deduction'
      using errcode = '23514';
  end if;

  if v_tenancy_status in ('closed', 'cancelled') then
    raise exception 'Deductions cannot be raised on a % tenancy', v_tenancy_status
      using errcode = '23514';
  end if;

  if new.status <> 'proposed' and new.responded_at is null then
    new.responded_at := now();
  end if;
  if new.status = 'proposed' then
    new.responded_at := null;
  end if;

  -- Defence in depth on top of RLS. Only applies when an identity is present;
  -- migrations and constraint tests run without an identity (and are already
  -- restricted to the table owner).
  if tg_op = 'UPDATE' and v_actor is not null then
    if old.status in ('resolved', 'withdrawn') then
      raise exception 'A % deduction is final', old.status
        using errcode = '23514';
    end if;

    if new.status in ('accepted', 'challenged') and new.status <> old.status then
      if v_actor <> v_tenant then
        raise exception 'Only the tenant may accept or challenge a deduction'
          using errcode = '23514';
      end if;
      if new.amount is distinct from old.amount
         or new.reason_category is distinct from old.reason_category
         or new.description is distinct from old.description
         or new.tenancy_id is distinct from old.tenancy_id
         or new.proposed_by_profile_id is distinct from old.proposed_by_profile_id then
        raise exception 'Responding to a deduction may only change its status'
          using errcode = '23514';
      end if;
    else
      if v_actor <> v_landlord then
        raise exception 'Only the landlord may amend a proposed deduction'
          using errcode = '23514';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create trigger deductions_guard
  before insert or update on public.deductions
  for each row execute function public.guard_deduction();

-- 12e. Evidence: the uploader must belong to the tenancy.
create or replace function public.guard_evidence_uploader()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is not null and new.uploaded_by_profile_id <> v_actor then
    raise exception 'Evidence must be uploaded by the acting profile'
      using errcode = '23514';
  end if;

  if not public.is_tenancy_participant(new.tenancy_id, new.uploaded_by_profile_id) then
    raise exception 'Uploader is not a participant of tenancy %', new.tenancy_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger evidence_guard_uploader
  before insert on public.evidence
  for each row execute function public.guard_evidence_uploader();

-- 12f. Disputes: must come from a challenged deduction, and closing one
--      records its resolution timestamp.
create or replace function public.guard_dispute()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_deduction_tenancy uuid;
  v_deduction_status text;
  v_actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    select tenancy_id, status
      into v_deduction_tenancy, v_deduction_status
    from public.deductions
    where id = new.deduction_id;

    if not found then
      raise exception 'Deduction % does not exist', new.deduction_id
        using errcode = '23503';
    end if;

    if v_deduction_tenancy <> new.tenancy_id then
      raise exception 'Deduction belongs to a different tenancy'
        using errcode = '23514';
    end if;

    if v_deduction_status <> 'challenged' then
      raise exception 'A dispute can only open against a challenged deduction'
        using errcode = '23514';
    end if;

    if v_actor is not null and not public.is_tenancy_participant(new.tenancy_id, v_actor) then
      raise exception 'Only tenancy participants may open a dispute'
        using errcode = '23514';
    end if;

    return new;
  end if;

  if old.status in ('resolved', 'cancelled') then
    raise exception 'A % dispute is final', old.status
      using errcode = '23514';
  end if;

  if new.status in ('resolved', 'cancelled') and new.resolved_at is null then
    new.resolved_at := now();
  end if;

  return new;
end;
$$;

create trigger disputes_guard
  before insert or update on public.disputes
  for each row execute function public.guard_dispute();

-- 12g. Settlements: must mirror the tenancy deposit, and freeze once settled.
create or replace function public.guard_settlement()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_deposit numeric(12, 2);
begin
  select deposit_amount into v_deposit
  from public.tenancies
  where id = new.tenancy_id;

  if not found then
    raise exception 'Tenancy % does not exist', new.tenancy_id
      using errcode = '23503';
  end if;

  if new.original_deposit_amount <> v_deposit then
    raise exception 'Settlement original deposit % does not match tenancy deposit %',
      new.original_deposit_amount, v_deposit
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and old.settled_at is not null then
    raise exception 'A settled settlement is immutable'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger settlements_guard
  before insert or update on public.settlements
  for each row execute function public.guard_settlement();

-- ---------------------------------------------------------------------------
-- 13. Row Level Security
--
-- Identity: `auth.uid()` reads the JWT `sub` claim. For DepositLock the
-- profile id IS that subject (`profiles.id = auth.uid()`), so once
-- Sign-In-With-Solana is wired the wallet session maps 1:1 onto a profile.
--
-- Local development simulates identity by setting `request.jwt.claims` in the
-- session � the exact same code path PostgREST uses in production. Nothing is
-- bypassed: policies still run, because tests execute under the `authenticated`
-- role, which does not own the tables and cannot bypass RLS.
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.properties enable row level security;
alter table public.tenancies enable row level security;
alter table public.tenancy_participants enable row level security;
alter table public.evidence enable row level security;
alter table public.deductions enable row level security;
alter table public.disputes enable row level security;
alter table public.settlements enable row level security;
alter table public.activity_events enable row level security;
alter table public.notifications enable row level security;

-- profiles ---------------------------------------------------------------
-- Own row only. Email and wallet stay private; co-participants get the safe
-- columns through the `v_shared_profiles` view further down.

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- properties -------------------------------------------------------------

create policy properties_select_related on public.properties
  for select to authenticated
  using (
    created_by_profile_id = auth.uid()
    or public.can_read_property(id, auth.uid())
  );

create policy properties_insert_own on public.properties
  for insert to authenticated
  with check (created_by_profile_id = auth.uid());

create policy properties_update_creator on public.properties
  for update to authenticated
  using (created_by_profile_id = auth.uid())
  with check (created_by_profile_id = auth.uid());

create policy properties_delete_creator on public.properties
  for delete to authenticated
  using (created_by_profile_id = auth.uid());

-- tenancies --------------------------------------------------------------
-- Read: landlord + tenant only.
-- Create: you must be the landlord of the row you are creating, and a
--   tenancy can only enter the world in a pre-agreement state.
-- Update: participants only; contract fields are frozen by trigger once the
--   tenancy leaves `draft`/`awaiting_tenant`.
-- Delete: landlord, and only before anything was ever agreed.

create policy tenancies_select_participant on public.tenancies
  for select to authenticated
  using (public.is_tenancy_participant(id, auth.uid()));

create policy tenancies_insert_landlord on public.tenancies
  for insert to authenticated
  with check (
    landlord_profile_id = auth.uid()
    and status in ('draft', 'awaiting_tenant')
  );

create policy tenancies_update_participant on public.tenancies
  for update to authenticated
  using (public.is_tenancy_participant(id, auth.uid()))
  with check (public.is_tenancy_participant(id, auth.uid()));

create policy tenancies_delete_landlord_preliminary on public.tenancies
  for delete to authenticated
  using (
    landlord_profile_id = auth.uid()
    and status in ('draft', 'cancelled')
  );

-- tenancy_participants ---------------------------------------------------
-- No DELETE policy: leaving a tenancy is expressed as `status = 'declined'`,
-- so the contract columns and the role graph can never disagree.

create policy participants_select_shared on public.tenancy_participants
  for select to authenticated
  using (public.is_tenancy_participant(tenancy_id, auth.uid()));

create policy participants_insert_landlord on public.tenancy_participants
  for insert to authenticated
  with check (public.is_tenancy_landlord(tenancy_id, auth.uid()));

create policy participants_update_self_or_landlord on public.tenancy_participants
  for update to authenticated
  using (
    profile_id = auth.uid()
    or public.is_tenancy_landlord(tenancy_id, auth.uid())
  )
  with check (
    profile_id = auth.uid()
    or public.is_tenancy_landlord(tenancy_id, auth.uid())
  );

-- evidence ---------------------------------------------------------------

create policy evidence_select_participant on public.evidence
  for select to authenticated
  using (public.is_tenancy_participant(tenancy_id, auth.uid()));

create policy evidence_insert_participant on public.evidence
  for insert to authenticated
  with check (
    uploaded_by_profile_id = auth.uid()
    and public.is_tenancy_participant(tenancy_id, auth.uid())
  );

create policy evidence_update_uploader on public.evidence
  for update to authenticated
  using (uploaded_by_profile_id = auth.uid())
  with check (uploaded_by_profile_id = auth.uid());

create policy evidence_delete_uploader on public.evidence
  for delete to authenticated
  using (uploaded_by_profile_id = auth.uid());

-- deductions -------------------------------------------------------------
-- Creating is landlord-only. Reading is participant-only. Responding
-- (accept/challenge) is allowed by the UPDATE policy and constrained to the
-- tenant by the `guard_deduction` trigger.

create policy deductions_select_participant on public.deductions
  for select to authenticated
  using (public.is_tenancy_participant(tenancy_id, auth.uid()));

create policy deductions_insert_landlord on public.deductions
  for insert to authenticated
  with check (
    proposed_by_profile_id = auth.uid()
    and public.is_tenancy_landlord(tenancy_id, auth.uid())
  );

create policy deductions_update_participant on public.deductions
  for update to authenticated
  using (public.is_tenancy_participant(tenancy_id, auth.uid()))
  with check (public.is_tenancy_participant(tenancy_id, auth.uid()));

-- disputes ---------------------------------------------------------------

create policy disputes_select_participant on public.disputes
  for select to authenticated
  using (public.is_tenancy_participant(tenancy_id, auth.uid()));

create policy disputes_insert_participant on public.disputes
  for insert to authenticated
  with check (
    opened_by_profile_id = auth.uid()
    and public.is_tenancy_participant(tenancy_id, auth.uid())
  );

create policy disputes_update_participant on public.disputes
  for update to authenticated
  using (public.is_tenancy_participant(tenancy_id, auth.uid()))
  with check (public.is_tenancy_participant(tenancy_id, auth.uid()));

-- settlements ------------------------------------------------------------
-- Reads: participants only.
-- Writes: deliberately NO client policy. Settlement rows are produced by the
-- service layer / on-chain reconciliation in a later phase; until then only
-- the migration role (`postgres`) and the future service role can write them.

create policy settlements_select_participant on public.settlements
  for select to authenticated
  using (public.is_tenancy_participant(tenancy_id, auth.uid()));

-- activity_events --------------------------------------------------------
-- Append-only timeline; no UPDATE/DELETE policies.

create policy activity_select_participant on public.activity_events
  for select to authenticated
  using (public.is_tenancy_participant(tenancy_id, auth.uid()));

create policy activity_insert_participant on public.activity_events
  for insert to authenticated
  with check (
    public.is_tenancy_participant(tenancy_id, auth.uid())
    and (actor_profile_id = auth.uid() or actor_profile_id is null)
  );

-- notifications ----------------------------------------------------------
-- Read / mark-read / clear your own. No client INSERT policy: notifications
-- are written by the service layer in a later phase.

create policy notifications_select_own on public.notifications
  for select to authenticated
  using (profile_id = auth.uid());

create policy notifications_update_own on public.notifications
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy notifications_delete_own on public.notifications
  for delete to authenticated
  using (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 14. Safe profile projection for other participants
--
-- `profiles` itself stays private (email, raw wallet). This view exposes only
-- the columns a co-participant legitimately needs � name, avatar, wallet �
-- and returns nothing to an anonymous visitor because `auth.uid()` is null.
-- Definer rights are safe here: the view's WHERE clause *is* the policy.
-- ---------------------------------------------------------------------------

create or replace view public.v_shared_profiles (id, full_name, avatar_url, wallet_address, created_at)
as
  select p.id, p.full_name, p.avatar_url, p.wallet_address, p.created_at
  from public.profiles p
  where p.id = auth.uid()
     or exists (
          select 1
          from public.tenancy_participants me
          join public.tenancy_participants them
            on them.tenancy_id = me.tenancy_id
          where me.profile_id = auth.uid()
            and them.profile_id = p.id
        );

comment on view public.v_shared_profiles is
  'Read-only projection of profiles shared with the caller through a tenancy.';

revoke select on public.v_shared_profiles from public, anon;
grant select on public.v_shared_profiles to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 15. Explicit privileges
--
-- RLS only filters rows; the underlying table privileges must exist first.
-- Written out explicitly so a fresh database behaves the same regardless of
-- how default privileges were configured.
-- ---------------------------------------------------------------------------

grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete
  on all tables in schema public
  to authenticated, service_role;

grant usage, select
  on all sequences in schema public
  to authenticated, service_role;

revoke delete on public.settlements from authenticated;
revoke insert, update on public.settlements from authenticated;
revoke update, delete on public.activity_events from authenticated;
revoke insert on public.notifications from authenticated;
revoke delete on public.tenancy_participants from authenticated;
revoke delete on public.disputes from authenticated;
revoke delete on public.deductions from authenticated;
