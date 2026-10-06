-- ============================================================================
-- DepositLock — Phase 5: on-chain deposit reconciliation
--
-- The chain stays authoritative for the deposit agreement: its address, the
-- recorded parties, the mint, the exact required amount, the
-- program-controlled vault and the single funding transaction. Supabase is
-- only the index layer on top of that truth, so everything here is written
-- from the server after it has re-verified the chain state itself:
--
--   * `deposit_records` mirrors one tenancy's agreement PDA and token vault.
--     It is written exclusively by the two SECURITY DEFINER RPCs below
--     (granted to `service_role` only) and read by both participants through
--     the standard tenancy SELECT policy. Clients get no insert/update/
--     delete surface at all.
--   * `guard_tenancy_mutation` now only lets a tenancy become `protected`
--     from `awaiting_deposit` — the transition `mark_deposit_protected`
--     performs after verifying the funding on chain. The rule applies to
--     every role, internal ones included, and only to UPDATEs, so seeds and
--     fixtures that insert a `protected` tenancy stay valid.
--   * `deposit_vault_initialized` joins the activity timeline so the landlord
--     creating the vault becomes part of the story.
--
-- Both RPCs are idempotent: recording or verifying the same on-chain state
-- twice keeps one deposit record, one activity event and one transition.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. deposit_records
--
-- One row per tenancy. `required_amount`/`deposited_amount` are integer base
-- units of the configured mint (never EUR cents) so the row can be compared
-- byte-for-byte with the on-chain account.
-- ---------------------------------------------------------------------------

create table public.deposit_records (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null unique
    references public.tenancies (id) on delete cascade,
  agreement_address text not null unique,
  vault_address text not null unique,
  mint_address text not null,
  required_amount bigint not null,
  deposited_amount bigint,
  onchain_status text not null default 'agreement_initialized',
  initialization_signature text,
  funding_signature text,
  funded_at timestamptz,
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deposit_records_required_positive
    check (required_amount > 0),
  constraint deposit_records_status
    check (onchain_status in ('agreement_initialized', 'deposit_funded')),
  constraint deposit_records_amount_matches
    check (deposited_amount is null or deposited_amount = required_amount),
  constraint deposit_records_funded_consistency
    check (
      (onchain_status = 'deposit_funded')
      = (deposited_amount is not null and funding_signature is not null)
    ),
  constraint deposit_records_solana_addresses
    check (
      agreement_address ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
      and vault_address ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
      and mint_address ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
    )
);

comment on table public.deposit_records is
  'Server-side mirror of the on-chain deposit agreement PDA and its token vault, written only by the reconcile RPCs.';
comment on column public.deposit_records.tenancy_id is
  'Exactly one record per tenancy; the agreement address is derived from this id on chain.';
comment on column public.deposit_records.agreement_address is
  'Deposit Agreement PDA, base58. Unique: one agreement per tenancy across the programme.';
comment on column public.deposit_records.vault_address is
  'Programme-controlled token vault (ATA of the agreement PDA), base58.';
comment on column public.deposit_records.mint_address is
  'The deposit mint the tenant must transfer, base58; must equal the deployment constant the server checks.';
comment on column public.deposit_records.required_amount is
  'Exact deposit in integer base units of the mint — the value fund_deposit enforces on chain.';
comment on column public.deposit_records.deposited_amount is
  'Integer base units actually transferred on chain; null until the funding is verified, then equal to required_amount.';
comment on column public.deposit_records.onchain_status is
  'Agreement lifecycle as observed on chain: agreement_initialized or deposit_funded.';
comment on column public.deposit_records.verified_at is
  'When the reconcile server last re-read this state from the chain.';

create trigger deposit_records_set_updated_at
  before update on public.deposit_records
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. RLS: participants read, nobody but the service role writes
-- ---------------------------------------------------------------------------

alter table public.deposit_records enable row level security;

revoke all on public.deposit_records from public, anon;
revoke insert, update, delete on public.deposit_records from authenticated;
grant select, insert, update, delete on public.deposit_records to service_role;

create policy deposit_records_select_participant on public.deposit_records
  for select to authenticated
  using (public.is_tenancy_participant(tenancy_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- 3. Activity timeline: the landlord creating the vault is part of the story
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
    'deposit_vault_initialized',
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

comment on constraint activity_events_type on public.activity_events is
  'The event vocabulary shared by appendActivity(), the timeline UI and the reconcile server.';

-- ---------------------------------------------------------------------------
-- 4. guard_tenancy_mutation: `protected` is only reachable from
--    `awaiting_deposit`
--
-- Phase 5 addition on top of the Phase 4 guard (otherwise identical): the
-- status transition that hands a tenancy its protection happens exclusively
-- in `mark_deposit_protected`, after the server has independently verified
-- the funding transaction on chain. The check runs for every role — the
-- service role included — because a forged or stale reconcile call must not
-- be able to promote a draft, invited or closed tenancy. It is deliberately
-- placed before the closed-tenancy early return so `closed → protected` is
-- rejected with this rule rather than silently returned, and it never fires
-- on INSERT, so seeds and fixtures are unaffected.
-- ---------------------------------------------------------------------------

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

  if new.status = 'protected'
     and old.status is distinct from 'protected'
     and old.status <> 'awaiting_deposit' then
    raise exception 'A tenancy becomes protected only from %', 'awaiting_deposit'
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
  'Auto timestamps plus defence in depth: contract fields are landlord-only, the tenant is assigned only by the invitation RPCs, and protected is reached only from awaiting_deposit after the on-chain funding was verified.';

-- ---------------------------------------------------------------------------
-- 5. record_deposit_agreement
--
-- Called by the reconcile server after the landlord's initialize_deposit
-- transaction confirms. Writes the agreement row and its
-- `deposit_vault_initialized` activity, and points the tenancy at the new
-- vault. Calling it again with the same addresses is a no-op beyond the
-- verification timestamp; it never downgrades a funded record.
-- ---------------------------------------------------------------------------

create or replace function public.record_deposit_agreement(
  p_tenancy_id uuid,
  p_agreement_address text,
  p_vault_address text,
  p_mint_address text,
  p_required_amount bigint,
  p_decimals smallint,
  p_initialization_signature text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenancy public.tenancies%rowtype;
  v_expected bigint;
  v_is_new boolean;
begin
  if p_decimals is null or p_decimals < 0 or p_decimals > 18 then
    raise exception 'Decimals must be between 0 and 18';
  end if;

  select * into v_tenancy from public.tenancies where id = p_tenancy_id for update;
  if not found then
    raise exception 'Tenancy % not found', p_tenancy_id;
  end if;

  if v_tenancy.status not in ('awaiting_deposit', 'protected') then
    raise exception 'A deposit agreement can only be recorded while the tenancy awaits the deposit';
  end if;

  v_expected := round(v_tenancy.deposit_amount * power(10::numeric, p_decimals::numeric))::bigint;
  if p_required_amount is null or p_required_amount <> v_expected then
    raise exception 'Required amount does not match the tenancy deposit';
  end if;

  if exists (
    select 1 from public.deposit_records
    where tenancy_id = p_tenancy_id
      and (agreement_address is distinct from p_agreement_address
        or vault_address is distinct from p_vault_address
        or mint_address is distinct from p_mint_address
        or required_amount is distinct from p_required_amount)
  ) then
    raise exception 'On-chain deposit state does not match the recorded agreement';
  end if;

  select not exists (
    select 1 from public.deposit_records where tenancy_id = p_tenancy_id
  ) into v_is_new;

  insert into public.deposit_records (
    tenancy_id, agreement_address, vault_address, mint_address,
    required_amount, onchain_status, initialization_signature, verified_at
  )
  values (
    p_tenancy_id, p_agreement_address, p_vault_address, p_mint_address,
    p_required_amount, 'agreement_initialized', p_initialization_signature, now()
  )
  on conflict (tenancy_id) do update set
    initialization_signature =
      coalesce(deposit_records.initialization_signature, excluded.initialization_signature),
    verified_at = now();

  if v_is_new then
    insert into public.activity_events
      (tenancy_id, event_type, title, description, metadata, blockchain_reference)
    values
      (p_tenancy_id, 'deposit_vault_initialized', 'Deposit vault created',
       'The landlord created the on-chain deposit agreement and its token vault.',
       jsonb_build_object(
         'agreement_address', p_agreement_address,
         'vault_address', p_vault_address,
         'mint_address', p_mint_address,
         'required_amount', p_required_amount,
         'decimals', p_decimals
       ),
       p_initialization_signature);
  end if;

  update public.tenancies set
    vault_address = coalesce(nullif(vault_address, ''), p_vault_address),
    blockchain_reference = coalesce(nullif(blockchain_reference, ''), p_agreement_address)
  where id = p_tenancy_id;

  return (
    select jsonb_build_object(
      'tenancy_id', dr.tenancy_id,
      'agreement_address', dr.agreement_address,
      'vault_address', dr.vault_address,
      'onchain_status', dr.onchain_status,
      'required_amount', dr.required_amount,
      'verified_at', dr.verified_at
    )
    from public.deposit_records dr
    where dr.tenancy_id = p_tenancy_id
  );
end;
$$;

comment on function public.record_deposit_agreement(uuid, text, text, text, bigint, smallint, text) is
  'Server-only: records the landlord-created agreement PDA and vault for a tenancy, cross-checked against the deposit amount in integer base units. Idempotent; never downgrades a funded record.';

-- ---------------------------------------------------------------------------
-- 6. mark_deposit_protected
--
-- Called by the reconcile server after fund_deposit confirms. Upserts the
-- funding into `deposit_records` and, on the first verification, moves the
-- tenancy `awaiting_deposit → protected` (guard stamps `activated_at`) and
-- appends the `deposit_protected` activity. Subsequent calls only refresh
-- `verified_at`, so a replayed reconcile cannot double-emit the event or
-- touch a tenancy that has moved on.
-- ---------------------------------------------------------------------------

create or replace function public.mark_deposit_protected(
  p_tenancy_id uuid,
  p_agreement_address text,
  p_vault_address text,
  p_mint_address text,
  p_required_amount bigint,
  p_deposited_amount bigint,
  p_decimals smallint,
  p_funding_signature text,
  p_onchain_funded_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenancy public.tenancies%rowtype;
  v_expected bigint;
  v_was_awaiting boolean;
begin
  if p_decimals is null or p_decimals < 0 or p_decimals > 18 then
    raise exception 'Decimals must be between 0 and 18';
  end if;

  select * into v_tenancy from public.tenancies where id = p_tenancy_id for update;
  if not found then
    raise exception 'Tenancy % not found', p_tenancy_id;
  end if;

  if v_tenancy.status not in ('awaiting_deposit', 'protected') then
    raise exception 'The deposit can only be verified while the tenancy awaits the deposit';
  end if;

  v_expected := round(v_tenancy.deposit_amount * power(10::numeric, p_decimals::numeric))::bigint;
  if p_required_amount is null or p_required_amount <> v_expected then
    raise exception 'Required amount does not match the tenancy deposit';
  end if;

  if p_deposited_amount is distinct from p_required_amount then
    raise exception 'Funded amount must equal the required deposit';
  end if;

  if exists (
    select 1 from public.deposit_records
    where tenancy_id = p_tenancy_id
      and (agreement_address is distinct from p_agreement_address
        or vault_address is distinct from p_vault_address
        or mint_address is distinct from p_mint_address
        or required_amount is distinct from p_required_amount)
  ) then
    raise exception 'On-chain deposit state does not match the recorded agreement';
  end if;

  insert into public.deposit_records (
    tenancy_id, agreement_address, vault_address, mint_address,
    required_amount, deposited_amount, onchain_status,
    funding_signature, funded_at, verified_at
  )
  values (
    p_tenancy_id, p_agreement_address, p_vault_address, p_mint_address,
    p_required_amount, p_deposited_amount, 'deposit_funded',
    p_funding_signature, p_onchain_funded_at, now()
  )
  on conflict (tenancy_id) do update set
    deposited_amount = excluded.deposited_amount,
    onchain_status = excluded.onchain_status,
    funding_signature =
      coalesce(deposit_records.funding_signature, excluded.funding_signature),
    funded_at = coalesce(deposit_records.funded_at, excluded.funded_at),
    verified_at = now();

  v_was_awaiting := v_tenancy.status = 'awaiting_deposit';

  if v_was_awaiting then
    update public.tenancies set status = 'protected' where id = p_tenancy_id;

    insert into public.activity_events
      (tenancy_id, event_type, title, description, metadata, blockchain_reference)
    values
      (p_tenancy_id, 'deposit_protected', 'Deposit protected',
       'The deposit was funded and verified on chain. Neither party can withdraw it alone.',
       jsonb_build_object(
         'agreement_address', p_agreement_address,
         'vault_address', p_vault_address,
         'mint_address', p_mint_address,
         'required_amount', p_required_amount,
         'deposited_amount', p_deposited_amount,
         'funding_signature', p_funding_signature,
         'funded_at', p_onchain_funded_at
       ),
       p_funding_signature);
  end if;

  update public.tenancies set
    vault_address = coalesce(nullif(vault_address, ''), p_vault_address),
    blockchain_reference = coalesce(nullif(blockchain_reference, ''), p_agreement_address)
  where id = p_tenancy_id;

  return (
    select jsonb_build_object(
      'tenancy_id', dr.tenancy_id,
      'agreement_address', dr.agreement_address,
      'vault_address', dr.vault_address,
      'onchain_status', dr.onchain_status,
      'required_amount', dr.required_amount,
      'deposited_amount', dr.deposited_amount,
      'verified_at', dr.verified_at
    )
    from public.deposit_records dr
    where dr.tenancy_id = p_tenancy_id
  );
end;
$$;

comment on function public.mark_deposit_protected(uuid, text, text, text, bigint, bigint, smallint, text, timestamptz) is
  'Server-only: verifies the funded deposit against the tenancy amount in integer base units, records it and — once, idempotently — moves the tenancy awaiting_deposit to protected with its activity event.';

-- ---------------------------------------------------------------------------
-- 7. Execution grants — reconcile server only
--
-- Clients must never be able to promote themselves to protected: neither
-- RPC is executable by anon or authenticated, so PostgREST does not even
-- expose them.
-- ---------------------------------------------------------------------------

revoke execute on function public.record_deposit_agreement(uuid, text, text, text, bigint, smallint, text)
  from public, anon, authenticated;
grant execute on function public.record_deposit_agreement(uuid, text, text, text, bigint, smallint, text)
  to service_role;

revoke execute on function public.mark_deposit_protected(uuid, text, text, text, bigint, bigint, smallint, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.mark_deposit_protected(uuid, text, text, text, bigint, bigint, smallint, text, timestamptz)
  to service_role;
