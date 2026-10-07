-- ============================================================================
-- DepositLock Phase 6: mutual settlement and dispute freeze
--
-- Phase 5 DepositAgreement bytes do not change. Phase 6 appends AgreementStatus
-- discriminants and stores proposal terms in a new PDA, preserving old funded
-- accounts. Final payouts and disputed state are mirrored only after the
-- reconcile server independently reads the chain.
-- ============================================================================

create table public.settlement_proposals (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references public.tenancies(id) on delete cascade,
  agreement_address text not null,
  proposal_address text not null,
  proposal_version bigint not null,
  settlement_type text not null,
  original_deposit_amount bigint not null,
  tenant_amount bigint not null,
  landlord_amount bigint not null,
  terms_hash text not null,
  evidence_ids uuid[] not null default '{}'::uuid[],
  metadata_verified boolean not null default true,
  proposed_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  deduction_id uuid references public.deductions(id) on delete restrict,
  status text not null default 'proposed',
  proposal_signature text not null unique,
  withdrawal_signature text,
  challenge_signature text,
  execution_signature text,
  challenge_reason text,
  dispute_id uuid references public.disputes(id) on delete restrict,
  settled_tenant_amount numeric(20, 0),
  settled_landlord_amount numeric(20, 0),
  proposed_at timestamptz not null default now(),
  responded_at timestamptz,
  executed_at timestamptz,
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint settlement_proposals_version_positive check (proposal_version > 0),
  constraint settlement_proposals_amounts_positive check (
    original_deposit_amount > 0 and tenant_amount >= 0 and landlord_amount >= 0
  ),
  constraint settlement_proposals_amounts_sum check (
    tenant_amount + landlord_amount = original_deposit_amount
  ),
  constraint settlement_proposals_type check (
    settlement_type in ('full_return', 'partial_deduction')
  ),
  constraint settlement_proposals_full_return_shape check (
    settlement_type <> 'full_return' or (landlord_amount = 0 and deduction_id is null)
  ),
  constraint settlement_proposals_deduction_shape check (
    settlement_type <> 'partial_deduction' or (landlord_amount > 0 and deduction_id is not null)
  ),
  constraint settlement_proposals_status check (
    status in ('proposed', 'withdrawn', 'challenged', 'executed')
  ),
  constraint settlement_proposals_hash check (terms_hash ~ '^[0-9a-f]{64}$'),
  constraint settlement_proposals_addresses check (
    agreement_address ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
    and proposal_address ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
  ),
  constraint settlement_proposals_signatures check (
    proposal_signature ~ '^[1-9A-HJ-NP-Za-km-z]{64,88}$'
    and (withdrawal_signature is null or withdrawal_signature ~ '^[1-9A-HJ-NP-Za-km-z]{64,88}$')
    and (challenge_signature is null or challenge_signature ~ '^[1-9A-HJ-NP-Za-km-z]{64,88}$')
    and (execution_signature is null or execution_signature ~ '^[1-9A-HJ-NP-Za-km-z]{64,88}$')
  ),
  constraint settlement_proposals_response_consistency check (
    (status = 'proposed') = (responded_at is null)
  ),
  constraint settlement_proposals_execution_consistency check (
    (status = 'executed') = (execution_signature is not null and executed_at is not null)
  ),
  constraint settlement_proposals_final_amounts_consistency check (
    (status = 'executed') = (settled_tenant_amount is not null and settled_landlord_amount is not null)
  ),
  constraint settlement_proposals_final_split check (
    (settled_tenant_amount is null and settled_landlord_amount is null)
    or (settled_landlord_amount = landlord_amount and settled_tenant_amount >= tenant_amount)
  ),
  constraint settlement_proposals_challenge_consistency check (
    (status = 'challenged') = (challenge_signature is not null and dispute_id is not null)
  ),
  constraint settlement_proposals_withdrawal_consistency check (
    (status = 'withdrawn') = (withdrawal_signature is not null)
  ),
  unique (tenancy_id, proposal_version)
);

create index settlement_proposals_tenancy_idx
  on public.settlement_proposals(tenancy_id, proposal_version desc);
create index settlement_proposals_status_idx
  on public.settlement_proposals(status);

alter table public.settlements
  drop constraint settlements_split_equals_original;
alter table public.settlements
  add column surplus_amount numeric(30, 6) not null default 0
  constraint settlements_surplus_non_negative check (surplus_amount >= 0);
alter table public.settlements
  alter column tenant_amount type numeric(30, 6) using tenant_amount::numeric(30, 6),
  alter column landlord_amount type numeric(30, 6) using landlord_amount::numeric(30, 6);
alter table public.settlements
  add constraint settlements_split_equals_original
  check (tenant_amount + landlord_amount = original_deposit_amount + surplus_amount);

create trigger settlement_proposals_set_updated_at
  before update on public.settlement_proposals
  for each row execute function public.set_updated_at();

comment on table public.settlement_proposals is
  'Server-indexed history of on-chain proposal versions. The Anchor proposal PDA remains authoritative for terms and state.';
comment on column public.settlement_proposals.terms_hash is
  'SHA-256 commitment to canonical off-chain reason/category/evidence metadata and on-chain settlement terms.';

alter table public.settlement_proposals enable row level security;
revoke all on public.settlement_proposals from public, anon, authenticated;
grant select on public.settlement_proposals to authenticated;
grant select, insert, update, delete on public.settlement_proposals to service_role;
create policy settlement_proposals_select_participant on public.settlement_proposals
  for select to authenticated
  using (public.is_tenancy_participant(tenancy_id, auth.uid()));

-- Add Phase 6 vocabulary without dropping existing event types.
alter table public.activity_events drop constraint activity_events_type;
alter table public.activity_events add constraint activity_events_type check (event_type in (
  'tenancy_created', 'tenant_invited', 'tenant_accepted', 'tenant_declined',
  'deposit_vault_initialized', 'deposit_funded', 'deposit_protected',
  'evidence_added', 'move_out_started', 'full_return_proposed',
  'settlement_proposal_withdrawn', 'deduction_proposed', 'deduction_accepted',
  'deduction_challenged', 'dispute_opened', 'dispute_resolved',
  'settlement_approved', 'settlement_completed', 'tenancy_closed'
));

-- A single status gate covers ordinary clients, service-role RPCs, and the
-- existing invitation/funding SECURITY DEFINER functions.
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
    if new.status = 'closed' and new.closed_at is null then new.closed_at := now(); end if;
    if new.status = 'protected' and new.activated_at is null then new.activated_at := now(); end if;
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
    raise exception 'The tenant may only be assigned by accepting an invitation' using errcode = '23514';
  end if;

  if new.status = 'protected'
     and old.status is distinct from 'protected'
     and old.status is distinct from 'awaiting_deposit' then
    raise exception 'A tenancy becomes protected only from %', 'awaiting_deposit'
      using errcode = '23514';
  end if;

  if old.status = 'closed' then
    if new.status is distinct from old.status or v_contract_changed or v_party_changed then
      raise exception 'A closed tenancy is immutable' using errcode = '23514';
    end if;
    return new;
  end if;

  if v_contract_changed then
    if old.status not in ('draft', 'awaiting_tenant') then
      raise exception 'Contract fields are frozen once the tenancy leaves draft/awaiting_tenant'
        using errcode = '23514';
    end if;
    if not v_internal and (v_actor is null or v_actor <> old.landlord_profile_id) then
      raise exception 'Only the landlord may amend the tenancy contract' using errcode = '23514';
    end if;
  end if;

  if new.status is distinct from old.status then
    if not v_internal then
      raise exception 'Tenancy lifecycle state is changed only through verified DepositLock actions'
        using errcode = '42501';
    end if;
    if not (
         (old.status = 'draft' and new.status = 'awaiting_tenant')
      or (old.status = 'awaiting_tenant' and new.status in ('awaiting_deposit', 'cancelled'))
      or (old.status = 'awaiting_deposit' and new.status = 'protected')
      or (old.status = 'protected' and new.status = 'move_out_review')
      or (old.status = 'move_out_review' and new.status in ('settlement_pending', 'deduction_proposed'))
      or (old.status in ('settlement_pending', 'deduction_proposed') and new.status = 'move_out_review')
      or (old.status in ('move_out_review', 'deduction_proposed') and new.status = 'disputed')
      or (old.status = 'deduction_proposed' and new.status = 'closed')
      or (old.status = 'settlement_pending' and new.status = 'closed')
    ) then
      raise exception 'Invalid tenancy lifecycle transition: % to %', old.status, new.status
        using errcode = '23514';
    end if;
  end if;

  if new.status = 'closed' and new.closed_at is null then new.closed_at := now(); end if;
  if new.status <> 'closed' then new.closed_at := null; end if;
  if new.status = 'protected' and new.activated_at is null then new.activated_at := now(); end if;
  return new;
end;
$$;

comment on function public.guard_tenancy_mutation() is
  'Allows only trusted settlement lifecycle transitions; participant writes cannot mark a tenancy closed or disputed.';

-- Clients may read deductions but cannot author or respond to a purported
-- proposal without a verified matching on-chain proposal.
create or replace function public.guard_deduction()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_deposit numeric(12, 2);
  v_landlord uuid;
  v_internal boolean := current_user in ('postgres', 'service_role');
begin
  select deposit_amount, landlord_profile_id
    into v_deposit, v_landlord
    from public.tenancies where id = new.tenancy_id;
  if not found then
    raise exception 'Tenancy % does not exist', new.tenancy_id using errcode = '23503';
  end if;
  if new.amount > v_deposit then
    raise exception 'Deduction exceeds the deposit amount' using errcode = '23514';
  end if;
  if new.proposed_by_profile_id <> v_landlord then
    raise exception 'Only the landlord may propose a deduction' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    if not v_internal then
      raise exception 'Deduction rows are created only after an on-chain proposal is verified'
        using errcode = '42501';
    end if;
    if new.status = 'proposed' then new.responded_at := null; end if;
    return new;
  end if;

  if new.amount is distinct from old.amount
     or new.reason_category is distinct from old.reason_category
     or new.description is distinct from old.description
     or new.tenancy_id is distinct from old.tenancy_id
     or new.proposed_by_profile_id is distinct from old.proposed_by_profile_id then
    raise exception 'Verified deduction terms are immutable' using errcode = '23514';
  end if;
  if not v_internal then
    raise exception 'Deduction responses are recorded only after on-chain verification'
      using errcode = '42501';
  end if;
  if old.status <> 'proposed' or new.status not in ('challenged', 'withdrawn', 'resolved') then
    raise exception 'Invalid verified deduction transition' using errcode = '23514';
  end if;
  new.responded_at := now();
  return new;
end;
$$;

comment on function public.guard_deduction() is
  'Deduction proposal details are frozen; all responses are written by verified settlement reconciliation.';

drop policy deductions_insert_landlord on public.deductions;
drop policy deductions_update_participant on public.deductions;
revoke insert, update, delete on public.deductions from anon, authenticated;
grant select on public.deductions to authenticated;
grant insert, update, select on public.deductions to service_role;

drop policy disputes_insert_participant on public.disputes;
drop policy disputes_update_participant on public.disputes;
revoke insert, update, delete on public.disputes from anon, authenticated;
grant select on public.disputes to authenticated;
grant insert, update, select on public.disputes to service_role;

revoke insert, update, delete on public.settlements from anon, authenticated;
grant select on public.settlements to authenticated;
grant insert, update, select on public.settlements to service_role;

create or replace function public.start_move_out_review(
  p_tenancy_id uuid,
  p_landlord_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenancy public.tenancies%rowtype;
begin
  select * into v_tenancy from public.tenancies where id = p_tenancy_id for update;
  if not found then raise exception 'Tenancy not found' using errcode = 'P0002'; end if;
  if v_tenancy.landlord_profile_id <> p_landlord_profile_id then
    raise exception 'Only the landlord may start move-out review' using errcode = '42501';
  end if;
  if v_tenancy.status = 'move_out_review' then
    return jsonb_build_object('tenancy_id', p_tenancy_id, 'status', 'move_out_review');
  end if;
  if v_tenancy.status <> 'protected' then
    raise exception 'Move-out review requires a protected tenancy' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.deposit_records
    where tenancy_id = p_tenancy_id and onchain_status = 'deposit_funded'
  ) then
    raise exception 'The protected deposit has not been verified' using errcode = '23514';
  end if;

  update public.tenancies set status = 'move_out_review' where id = p_tenancy_id;
  insert into public.activity_events
    (tenancy_id, actor_profile_id, event_type, title, description)
  values
    (p_tenancy_id, p_landlord_profile_id, 'move_out_started', 'Move-out review started',
     'The landlord began the mutually agreed deposit settlement review.');
  return jsonb_build_object('tenancy_id', p_tenancy_id, 'status', 'move_out_review');
end;
$$;

create or replace function public.record_settlement_proposal(
  p_tenancy_id uuid,
  p_landlord_profile_id uuid,
  p_agreement_address text,
  p_proposal_address text,
  p_proposal_version bigint,
  p_settlement_type text,
  p_original_amount bigint,
  p_landlord_amount bigint,
  p_tenant_amount bigint,
  p_decimals smallint,
  p_terms_hash text,
  p_proposal_signature text,
  p_reason_category text default null,
  p_description text default null,
  p_evidence_ids uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenancy public.tenancies%rowtype;
  v_expected numeric;
  v_existing public.settlement_proposals%rowtype;
  v_previous_status text;
  v_deduction_id uuid;
  v_evidence_ids uuid[];
  v_was_protected boolean;
  v_is_full boolean := p_settlement_type = 'full_return';
  v_event_type text;
  v_title text;
begin
  select coalesce(array_agg(value order by value), '{}'::uuid[])
    into v_evidence_ids
    from (select distinct unnest(coalesce(p_evidence_ids, '{}'::uuid[])) as value) evidence_ids;
  if cardinality(v_evidence_ids) <> cardinality(coalesce(p_evidence_ids, '{}'::uuid[])) then
    raise exception 'Evidence IDs must be unique' using errcode = '23514';
  end if;
  if p_decimals is null or p_decimals < 2 or p_decimals > 6 then
    raise exception 'Settlement mint decimals must be between 2 and 6' using errcode = '23514';
  end if;
  select * into v_tenancy from public.tenancies where id = p_tenancy_id for update;
  if not found then raise exception 'Tenancy not found' using errcode = 'P0002'; end if;
  if v_tenancy.landlord_profile_id <> p_landlord_profile_id then
    raise exception 'Only the landlord may propose settlement' using errcode = '42501';
  end if;
  if v_tenancy.status not in ('protected', 'move_out_review', 'settlement_pending', 'deduction_proposed') then
    raise exception 'Tenancy is not accepting settlement proposals' using errcode = '23514';
  end if;
  if p_proposal_version is null or p_proposal_version < 1 then
    raise exception 'Proposal version must be positive' using errcode = '23514';
  end if;
  if p_terms_hash is null or p_terms_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Terms hash is malformed' using errcode = '23514';
  end if;
  if p_agreement_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_proposal_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_proposal_signature !~ '^[1-9A-HJ-NP-Za-km-z]{64,88}$' then
    raise exception 'Settlement chain reference is malformed' using errcode = '23514';
  end if;

  v_expected := round(v_tenancy.deposit_amount * power(10::numeric, p_decimals::numeric));
  if p_original_amount is distinct from v_expected::bigint
     or p_tenant_amount is null or p_landlord_amount is null
     or p_tenant_amount < 0 or p_landlord_amount < 0
     or p_tenant_amount::numeric + p_landlord_amount::numeric <> v_expected then
    raise exception 'On-chain settlement split does not match the protected deposit' using errcode = 'P0001';
  end if;
  if mod(p_landlord_amount::numeric, power(10::numeric, (p_decimals - 2)::numeric)) <> 0 then
    raise exception 'Deduction amount must be representable to two currency decimals' using errcode = '23514';
  end if;
  if p_settlement_type not in ('full_return', 'partial_deduction')
     or (v_is_full and p_landlord_amount <> 0)
     or (not v_is_full and p_landlord_amount = 0) then
    raise exception 'Settlement type and landlord amount do not agree' using errcode = '23514';
  end if;

  select * into v_existing from public.settlement_proposals
   where tenancy_id = p_tenancy_id and proposal_version = p_proposal_version;
  if found then
    if v_existing.agreement_address is distinct from p_agreement_address
       or v_existing.proposal_address is distinct from p_proposal_address
       or v_existing.settlement_type is distinct from p_settlement_type
       or v_existing.original_deposit_amount is distinct from p_original_amount
       or v_existing.landlord_amount is distinct from p_landlord_amount
       or v_existing.tenant_amount is distinct from p_tenant_amount
       or v_existing.terms_hash is distinct from p_terms_hash
       or v_existing.evidence_ids is distinct from v_evidence_ids
       or v_existing.proposal_signature is distinct from p_proposal_signature then
      raise exception 'On-chain proposal does not match its existing record' using errcode = 'P0001';
    end if;
    return jsonb_build_object('proposal_id', v_existing.id, 'status', v_existing.status);
  end if;

  v_was_protected := v_tenancy.status = 'protected';
  if v_tenancy.status not in ('move_out_review', 'protected') then
    raise exception 'A new proposal requires move-out review' using errcode = '23514';
  end if;
  if v_was_protected then
    update public.tenancies set status = 'move_out_review' where id = p_tenancy_id;
    insert into public.activity_events
      (tenancy_id, actor_profile_id, event_type, title, description)
    values
      (p_tenancy_id, p_landlord_profile_id, 'move_out_started', 'Move-out review started',
       'Move-out review was confirmed while reconciling the landlord''s on-chain settlement proposal.');
  end if;

  select status into v_previous_status from public.settlement_proposals
   where tenancy_id = p_tenancy_id order by proposal_version desc limit 1;
  if (p_proposal_version = 1 and v_previous_status is not null)
     or (p_proposal_version > 1 and v_previous_status is distinct from 'withdrawn') then
    raise exception 'A new proposal is allowed only after the previous one was withdrawn' using errcode = '23514';
  end if;
  if p_proposal_version > 1 and p_proposal_version <> (
    select coalesce(max(proposal_version), 0) + 1 from public.settlement_proposals
    where tenancy_id = p_tenancy_id
  ) then
    raise exception 'Proposal version is not the next version' using errcode = '23514';
  end if;

  if v_is_full then
    if p_reason_category is not null or p_description is not null or cardinality(v_evidence_ids) <> 0 then
      raise exception 'Full return proposals do not carry a deduction' using errcode = '23514';
    end if;
    v_event_type := 'full_return_proposed';
    v_title := 'Full deposit return proposed';
  else
    if p_reason_category not in ('damage', 'missing_items', 'cleaning', 'unpaid_rent', 'utilities', 'other')
       or char_length(btrim(coalesce(p_description, ''))) not between 3 and 1000 then
      raise exception 'Deduction reason and description are required' using errcode = '23514';
    end if;
    insert into public.deductions (
      tenancy_id, proposed_by_profile_id, amount, reason_category, description, status
    ) values (
      p_tenancy_id,
      p_landlord_profile_id,
      round(p_landlord_amount::numeric / power(10::numeric, p_decimals::numeric), 2),
      p_reason_category,
      btrim(p_description),
      'proposed'
    ) returning id into v_deduction_id;

    if cardinality(v_evidence_ids) > 0 then
      if (select count(*) from public.evidence
          where id = any(v_evidence_ids) and tenancy_id = p_tenancy_id
            and evidence_context in ('move_out', 'deduction')
            and deduction_id is null) <> cardinality(v_evidence_ids) then
        raise exception 'Evidence must belong to this tenancy and be available for a deduction' using errcode = '23514';
      end if;
      update public.evidence
         set evidence_context = 'deduction', deduction_id = v_deduction_id
       where id = any(v_evidence_ids) and tenancy_id = p_tenancy_id;
    end if;
    v_event_type := 'deduction_proposed';
    v_title := 'Deduction proposed';
  end if;

  insert into public.settlement_proposals (
    tenancy_id, agreement_address, proposal_address, proposal_version,
    settlement_type, original_deposit_amount, tenant_amount, landlord_amount,
    terms_hash, evidence_ids, proposed_by_profile_id, deduction_id, status, proposal_signature
  ) values (
    p_tenancy_id, p_agreement_address, p_proposal_address, p_proposal_version,
    p_settlement_type, p_original_amount, p_tenant_amount, p_landlord_amount,
    p_terms_hash, v_evidence_ids, p_landlord_profile_id,
    v_deduction_id, 'proposed', p_proposal_signature
  ) returning id into v_existing.id;

  update public.tenancies set status =
    case when v_is_full then 'settlement_pending' else 'deduction_proposed' end
    where id = p_tenancy_id;
  insert into public.activity_events (
    tenancy_id, actor_profile_id, event_type, title, description,
    metadata, blockchain_reference
  ) values (
    p_tenancy_id, p_landlord_profile_id, v_event_type, v_title,
    case when v_is_full then 'The landlord proposed returning the full protected deposit.'
         else btrim(p_description) end,
    jsonb_build_object(
      'proposal_version', p_proposal_version,
      'settlement_type', p_settlement_type,
      'landlord_amount', p_landlord_amount,
      'tenant_amount', p_tenant_amount,
      'terms_hash', p_terms_hash,
      'deduction_id', v_deduction_id
    ),
    p_proposal_signature
  );
  return jsonb_build_object('proposal_id', v_existing.id, 'status', 'proposed');
end;
$$;

create or replace function public.record_settlement_withdrawal(
  p_tenancy_id uuid,
  p_landlord_profile_id uuid,
  p_proposal_version bigint,
  p_withdrawal_signature text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenancy public.tenancies%rowtype;
  v_proposal public.settlement_proposals%rowtype;
begin
  select * into v_tenancy from public.tenancies where id = p_tenancy_id for update;
  if not found or v_tenancy.landlord_profile_id <> p_landlord_profile_id then
    raise exception 'Landlord tenancy does not exist' using errcode = '42501';
  end if;
  select * into v_proposal from public.settlement_proposals
   where tenancy_id = p_tenancy_id and proposal_version = p_proposal_version for update;
  if not found then raise exception 'Settlement proposal not found' using errcode = 'P0002'; end if;
  if p_withdrawal_signature !~ '^[1-9A-HJ-NP-Za-km-z]{64,88}$' then
    raise exception 'Withdrawal signature is malformed' using errcode = '23514';
  end if;
  if v_proposal.status = 'withdrawn' then
    if v_proposal.withdrawal_signature <> p_withdrawal_signature then
      raise exception 'Withdrawal does not match the recorded proposal' using errcode = 'P0001';
    end if;
    return jsonb_build_object('proposal_id', v_proposal.id, 'status', 'withdrawn');
  end if;
  if v_proposal.status <> 'proposed' or v_tenancy.status not in ('settlement_pending', 'deduction_proposed') then
    raise exception 'Only an unanswered proposal can be withdrawn' using errcode = '23514';
  end if;

  update public.settlement_proposals set
    status = 'withdrawn', withdrawal_signature = p_withdrawal_signature,
    responded_at = now(), verified_at = now()
  where id = v_proposal.id;
  if v_proposal.deduction_id is not null then
    update public.deductions set status = 'withdrawn'
     where id = v_proposal.deduction_id and status = 'proposed';
  end if;
  update public.tenancies set status = 'move_out_review' where id = p_tenancy_id;
  insert into public.activity_events (
    tenancy_id, actor_profile_id, event_type, title, description, metadata, blockchain_reference
  ) values (
    p_tenancy_id, p_landlord_profile_id, 'settlement_proposal_withdrawn',
    'Settlement proposal withdrawn', 'The landlord withdrew the unanswered proposal.',
    jsonb_build_object('proposal_version', p_proposal_version), p_withdrawal_signature
  );
  return jsonb_build_object('proposal_id', v_proposal.id, 'status', 'withdrawn');
end;
$$;

create or replace function public.record_settlement_dispute(
  p_tenancy_id uuid,
  p_tenant_profile_id uuid,
  p_agreement_address text,
  p_proposal_address text,
  p_proposal_version bigint,
  p_settlement_type text,
  p_original_amount bigint,
  p_landlord_amount bigint,
  p_tenant_amount bigint,
  p_decimals smallint,
  p_terms_hash text,
  p_proposal_signature text,
  p_challenge_signature text,
  p_reason text,
  p_evidence_ids uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenancy public.tenancies%rowtype;
  v_proposal public.settlement_proposals%rowtype;
  v_expected numeric;
  v_dispute_id uuid;
begin
  select * into v_tenancy from public.tenancies where id = p_tenancy_id for update;
  if not found or v_tenancy.tenant_profile_id <> p_tenant_profile_id then
    raise exception 'Tenant tenancy does not exist' using errcode = '42501';
  end if;
  if p_decimals is null or p_decimals < 2 or p_decimals > 6 then
    raise exception 'Settlement mint decimals must be between 2 and 6' using errcode = '23514';
  end if;
  v_expected := round(v_tenancy.deposit_amount * power(10::numeric, p_decimals::numeric));
  if p_original_amount is distinct from v_expected::bigint
     or p_landlord_amount is null or p_tenant_amount is null
     or p_landlord_amount <= 0
     or p_landlord_amount::numeric + p_tenant_amount::numeric <> v_expected
     or p_settlement_type <> 'partial_deduction'
     or p_terms_hash !~ '^[0-9a-f]{64}$'
     or p_agreement_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_proposal_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_proposal_signature !~ '^[1-9A-HJ-NP-Za-km-z]{64,88}$' then
    raise exception 'Challenged on-chain proposal data is invalid' using errcode = 'P0001';
  end if;
  select * into v_proposal from public.settlement_proposals
   where tenancy_id = p_tenancy_id and proposal_version = p_proposal_version for update;
  if not found then
    if v_tenancy.status not in ('protected', 'move_out_review', 'deduction_proposed') then
      raise exception 'Tenancy cannot accept a challenge in its current state' using errcode = '23514';
    end if;
    if v_tenancy.status = 'protected' then
      update public.tenancies set status = 'move_out_review' where id = p_tenancy_id;
      insert into public.activity_events
        (tenancy_id, actor_profile_id, event_type, title, description)
      values
        (p_tenancy_id, p_tenant_profile_id, 'move_out_started', 'Move-out review started',
         'Move-out review was confirmed while reconciling the tenant''s on-chain challenge.');
    end if;
    insert into public.deductions (
      tenancy_id, proposed_by_profile_id, amount, reason_category, description, status
    ) values (
      p_tenancy_id,
      v_tenancy.landlord_profile_id,
      round(p_landlord_amount::numeric / power(10::numeric, p_decimals::numeric), 2),
      'other',
      'No verified landlord reason was recorded before the tenant challenged the on-chain proposal.',
      'proposed'
    ) returning id into v_proposal.deduction_id;
    insert into public.settlement_proposals (
      tenancy_id, agreement_address, proposal_address, proposal_version,
      settlement_type, original_deposit_amount, tenant_amount, landlord_amount,
      terms_hash, evidence_ids, metadata_verified, proposed_by_profile_id,
      deduction_id, status, proposal_signature
    ) values (
      p_tenancy_id, p_agreement_address, p_proposal_address, p_proposal_version,
      p_settlement_type, p_original_amount, p_tenant_amount, p_landlord_amount,
      p_terms_hash, '{}', false, v_tenancy.landlord_profile_id,
      v_proposal.deduction_id, 'proposed', p_proposal_signature
    ) returning * into v_proposal;
  end if;
  if v_proposal.settlement_type <> 'partial_deduction'
     or v_proposal.deduction_id is null
     or v_proposal.agreement_address <> p_agreement_address
     or v_proposal.proposal_address <> p_proposal_address
     or v_proposal.proposal_signature <> p_proposal_signature
     or v_proposal.original_deposit_amount <> p_original_amount
     or v_proposal.landlord_amount <> p_landlord_amount
     or v_proposal.tenant_amount <> p_tenant_amount
     or v_proposal.terms_hash <> p_terms_hash then
    raise exception 'Only the matching on-chain deduction proposal can be challenged' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 3 and 1000
     or p_challenge_signature !~ '^[1-9A-HJ-NP-Za-km-z]{64,88}$' then
    raise exception 'Challenge reason or signature is malformed' using errcode = '23514';
  end if;
  if v_proposal.status = 'challenged' then
    if v_proposal.challenge_signature <> p_challenge_signature then
      raise exception 'Challenge does not match the recorded proposal' using errcode = 'P0001';
    end if;
    return jsonb_build_object('proposal_id', v_proposal.id, 'dispute_id', v_proposal.dispute_id, 'status', 'challenged');
  end if;
  if v_proposal.status <> 'proposed'
     or v_tenancy.status not in ('protected', 'move_out_review', 'deduction_proposed') then
    raise exception 'Only an active deduction proposal can be challenged' using errcode = '23514';
  end if;

  update public.deductions set status = 'challenged'
   where id = v_proposal.deduction_id and status = 'proposed';
  insert into public.disputes (
    tenancy_id, deduction_id, opened_by_profile_id, reason, status, opened_at
  ) values (
    p_tenancy_id, v_proposal.deduction_id, p_tenant_profile_id, btrim(p_reason), 'open', now()
  ) returning id into v_dispute_id;
  if coalesce(cardinality(p_evidence_ids), 0) > 0 then
    if (select count(*) from public.evidence
        where id = any(p_evidence_ids) and tenancy_id = p_tenancy_id
          and (deduction_id is null or deduction_id = v_proposal.deduction_id)) <> cardinality(p_evidence_ids) then
      raise exception 'Dispute evidence must belong to this tenancy' using errcode = '23514';
    end if;
    update public.evidence set evidence_context = 'dispute', deduction_id = v_proposal.deduction_id
     where id = any(p_evidence_ids) and tenancy_id = p_tenancy_id;
  end if;
  update public.settlement_proposals set
    status = 'challenged', challenge_signature = p_challenge_signature,
    challenge_reason = btrim(p_reason), dispute_id = v_dispute_id,
    responded_at = now(), verified_at = now()
  where id = v_proposal.id;
  update public.tenancies set status = 'disputed' where id = p_tenancy_id;

  insert into public.activity_events (
    tenancy_id, actor_profile_id, event_type, title, description, metadata, blockchain_reference
  ) values
    (p_tenancy_id, p_tenant_profile_id, 'deduction_challenged', 'Deduction challenged',
     btrim(p_reason), jsonb_build_object('deduction_id', v_proposal.deduction_id, 'proposal_version', p_proposal_version), p_challenge_signature),
    (p_tenancy_id, p_tenant_profile_id, 'dispute_opened', 'Dispute opened',
     'The deposit remains protected while the proposed deduction is disputed.',
     jsonb_build_object('dispute_id', v_dispute_id), p_challenge_signature);
  return jsonb_build_object('proposal_id', v_proposal.id, 'dispute_id', v_dispute_id, 'status', 'challenged');
end;
$$;

create or replace function public.mark_settlement_executed(
  p_tenancy_id uuid,
  p_tenant_profile_id uuid,
  p_proposal_version bigint,
  p_original_amount bigint,
  p_landlord_amount numeric,
  p_tenant_amount numeric,
  p_decimals smallint,
  p_execution_signature text,
  p_onchain_executed_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenancy public.tenancies%rowtype;
  v_proposal public.settlement_proposals%rowtype;
  v_expected bigint;
  v_money_scale numeric;
  v_surplus numeric;
begin
  if p_decimals is null or p_decimals < 2 or p_decimals > 6 then
    raise exception 'Settlement mint decimals must be between 2 and 6' using errcode = '23514';
  end if;
  select * into v_tenancy from public.tenancies where id = p_tenancy_id for update;
  if not found or v_tenancy.tenant_profile_id <> p_tenant_profile_id then
    raise exception 'Tenant tenancy does not exist' using errcode = '42501';
  end if;
  select * into v_proposal from public.settlement_proposals
   where tenancy_id = p_tenancy_id and proposal_version = p_proposal_version for update;
  if not found then raise exception 'Settlement proposal not found' using errcode = 'P0002'; end if;

  if p_execution_signature !~ '^[1-9A-HJ-NP-Za-km-z]{64,88}$' or p_onchain_executed_at is null then
    raise exception 'Execution transaction is malformed' using errcode = '23514';
  end if;
  v_expected := round(v_tenancy.deposit_amount * power(10::numeric, p_decimals::numeric))::bigint;
  if p_original_amount is distinct from v_expected
     or p_landlord_amount is distinct from v_proposal.landlord_amount
     or p_tenant_amount < v_proposal.tenant_amount
     or p_landlord_amount::numeric + p_tenant_amount::numeric < v_expected then
    raise exception 'Verified payout does not match the stored proposal and tenancy' using errcode = 'P0001';
  end if;
  v_surplus := p_tenant_amount - v_proposal.tenant_amount;

  if v_proposal.status = 'executed' then
    if v_proposal.execution_signature <> p_execution_signature then
      raise exception 'Settlement replay has a different signature' using errcode = 'P0001';
    end if;
    return jsonb_build_object('tenancy_id', p_tenancy_id, 'status', 'closed');
  end if;
  if v_proposal.status <> 'proposed'
     or v_tenancy.status not in ('settlement_pending', 'deduction_proposed') then
    raise exception 'Only an approved, non-disputed proposal can be executed' using errcode = '23514';
  end if;

  v_money_scale := power(10::numeric, p_decimals::numeric);
  insert into public.settlements (
    tenancy_id, original_deposit_amount, tenant_amount, landlord_amount,
    settlement_type, tenant_approved, landlord_approved, surplus_amount,
    blockchain_transaction, settled_at
  ) values (
    p_tenancy_id,
    v_tenancy.deposit_amount,
    round(p_tenant_amount::numeric / v_money_scale, p_decimals),
    round(p_landlord_amount::numeric / v_money_scale, p_decimals),
    v_proposal.settlement_type,
    true,
    true,
    round(v_surplus::numeric / v_money_scale, p_decimals),
    p_execution_signature,
    p_onchain_executed_at
  );

  if v_proposal.deduction_id is not null then
    update public.deductions set status = 'resolved'
     where id = v_proposal.deduction_id and status = 'proposed';
  end if;
  update public.settlement_proposals set
    status = 'executed', execution_signature = p_execution_signature,
    settled_tenant_amount = p_tenant_amount,
    settled_landlord_amount = p_landlord_amount,
    responded_at = coalesce(responded_at, p_onchain_executed_at),
    executed_at = p_onchain_executed_at, verified_at = now()
  where id = v_proposal.id;
  update public.tenancies set status = 'closed' where id = p_tenancy_id;

  insert into public.activity_events (
    tenancy_id, actor_profile_id, event_type, title, description, metadata, blockchain_reference
  ) values
    (p_tenancy_id, p_tenant_profile_id, 'settlement_approved', 'Settlement approved',
     'The tenant approved the exact settlement split stored on chain.',
     jsonb_build_object('proposal_version', p_proposal_version), p_execution_signature),
    (p_tenancy_id, null, 'settlement_completed', 'Settlement completed',
     'The approved amounts were released from the on-chain vault.',
     jsonb_build_object('tenant_amount', p_tenant_amount, 'landlord_amount', p_landlord_amount), p_execution_signature),
    (p_tenancy_id, null, 'tenancy_closed', 'Tenancy closed',
     'The tenancy was closed after the on-chain settlement was verified.',
     jsonb_build_object('settlement_type', v_proposal.settlement_type), p_execution_signature);

  return jsonb_build_object('tenancy_id', p_tenancy_id, 'status', 'closed');
end;
$$;

-- RPCs are the only route to server-created lifecycle state.
revoke execute on function public.start_move_out_review(uuid, uuid) from public, anon, authenticated;
grant execute on function public.start_move_out_review(uuid, uuid) to service_role;
revoke execute on function public.record_settlement_proposal(uuid, uuid, text, text, bigint, text, bigint, bigint, bigint, smallint, text, text, text, text, uuid[]) from public, anon, authenticated;
grant execute on function public.record_settlement_proposal(uuid, uuid, text, text, bigint, text, bigint, bigint, bigint, smallint, text, text, text, text, uuid[]) to service_role;
revoke execute on function public.record_settlement_withdrawal(uuid, uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.record_settlement_withdrawal(uuid, uuid, bigint, text) to service_role;
revoke execute on function public.record_settlement_dispute(uuid, uuid, text, text, bigint, text, bigint, bigint, bigint, smallint, text, text, text, text, uuid[]) from public, anon, authenticated;
grant execute on function public.record_settlement_dispute(uuid, uuid, text, text, bigint, text, bigint, bigint, bigint, smallint, text, text, text, text, uuid[]) to service_role;
revoke execute on function public.mark_settlement_executed(uuid, uuid, bigint, bigint, numeric, numeric, smallint, text, timestamptz) from public, anon, authenticated;
grant execute on function public.mark_settlement_executed(uuid, uuid, bigint, bigint, numeric, numeric, smallint, text, timestamptz) to service_role;

comment on function public.record_settlement_proposal(uuid, uuid, text, text, bigint, text, bigint, bigint, bigint, smallint, text, text, text, text, uuid[]) is
  'Service-only, idempotent settlement-proposal mirror written after independent on-chain verification.';
comment on function public.record_settlement_dispute(uuid, uuid, text, text, bigint, text, bigint, bigint, bigint, smallint, text, text, text, text, uuid[]) is
  'Service-only disputed-state mirror. Can preserve a tenant challenge even if proposal metadata failed to sync; it never releases tokens or arbitrates the dispute.';
comment on function public.mark_settlement_executed(uuid, uuid, bigint, bigint, numeric, numeric, smallint, text, timestamptz) is
  'Service-only final settlement writer after chain verification; closes the tenancy exactly once.';
