-- ============================================================================
-- DepositLock — Phase 3B: wallet authentication identity
--
-- Phase 3A designed every policy around `profiles.id = auth.uid()` but stopped
-- short of enforcing the mapping, because no authentication existed yet. This
-- migration closes that gap without touching a single RLS policy:
--
--   1. `profiles.id` must reference a real Supabase Auth user
--      (`auth.users.id`). A profile row can no longer exist for an identity
--      that never signed in.
--   2. `profiles.wallet_address` is derived from the *verified* wallet of the
--      acting session (the `auth.identities` row GoTrue writes after it
--      verifies a Sign-In-With-Solana signature) instead of trusting whatever
--      the browser submits. `user_metadata` is deliberately NOT used: it is
--      client-writable through `auth.updateUser`, so it is not an
--      authorization source.
--   3. `properties.bedrooms` — an additive column the existing UI already
--      renders (kept out of 3A, added now that records come from the database).
--
-- Identity simulation for pgTAP is unchanged: tests set `request.jwt.claims`
-- the same way PostgREST does, and profiles created under a session resolve
-- their wallet through `auth.identities` rows that the seed/tests create.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. profiles must correspond to an authenticated user
-- ---------------------------------------------------------------------------

alter table public.profiles
  add constraint profiles_auth_user_fkey
  foreign key (id)
  references auth.users (id)
  on delete cascade;

comment on constraint profiles_auth_user_fkey on public.profiles is
  'A DepositLock profile is the deposit-side face of exactly one Supabase Auth user.';

-- ---------------------------------------------------------------------------
-- 2. Verified wallet lookup
--
-- SECURITY DEFINER so the binding trigger can read `auth.identities`, which
-- the `authenticated` role must never query directly (it would let one user
-- enumerate another user''s wallet). The function takes the session subject as
-- its only argument, has an empty search_path, and is revoked from every
-- client role: only definer-rights code (triggers, owners) can call it.
-- ---------------------------------------------------------------------------

create or replace function public.verified_wallet_address(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(
    coalesce(
      i.identity_data -> 'custom_claims' ->> 'address',
      -- Fallback: GoTrue stores the identity as `web3:solana:<address>`.
      case
        when i.provider_id like 'web3:solana:%'
          then substr(i.provider_id, length('web3:solana:') + 1)
        else null
      end
    ),
    ''
  )
  from auth.identities i
  where i.user_id = p_user_id
    and i.provider = 'web3'
  limit 1;
$$;

comment on function public.verified_wallet_address(uuid) is
  'The wallet address GoTrue verified for a user''s Sign-In-With-Solana session, or null.';

revoke execute on function public.verified_wallet_address(uuid) from public;
revoke execute on function public.verified_wallet_address(uuid) from anon;
revoke execute on function public.verified_wallet_address(uuid) from authenticated;
revoke execute on function public.verified_wallet_address(uuid) from service_role;

-- ---------------------------------------------------------------------------
-- 3. Wallet binding trigger
--
-- Runs BEFORE INSERT/UPDATE on profiles, only when a session exists:
--   * the row must describe the signed-in subject (defence in depth on top of
--     the `profiles_insert_own` / `profiles_update_own` policies),
--   * `wallet_address` must match the verified wallet or be absent, in which
--     case it is stamped with the verified address.
-- Without a session (migrations, seeds, owner maintenance) the row passes
-- through untouched — those paths are already restricted to the migration
-- role, and the foreign key above still applies.
-- ---------------------------------------------------------------------------

create or replace function public.bind_profile_wallet()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_wallet text;
begin
  if v_actor is null then
    return new;
  end if;

  if new.id <> v_actor then
    raise exception 'A profile can only be created or edited by its own authenticated user'
      using errcode = '42501';
  end if;

  v_wallet := public.verified_wallet_address(v_actor);

  if v_wallet is null then
    raise exception 'No verified wallet is bound to this session'
      using errcode = '23514';
  end if;

  if new.wallet_address is not null and new.wallet_address <> v_wallet then
    raise exception 'The wallet address must match the verified wallet of this session'
      using errcode = '23514';
  end if;

  new.wallet_address := v_wallet;
  return new;
end;
$$;

comment on function public.bind_profile_wallet() is
  'Forces profiles.wallet_address to the session''s cryptographically verified wallet.';

create trigger profiles_bind_wallet
  before insert or update on public.profiles
  for each row execute function public.bind_profile_wallet();

-- ---------------------------------------------------------------------------
-- 4. properties.bedrooms (additive)
-- ---------------------------------------------------------------------------

alter table public.properties
  add column bedrooms smallint;

alter table public.properties
  add constraint properties_bedrooms_range
  check (bedrooms is null or bedrooms between 0 and 50);

comment on column public.properties.bedrooms is
  'Bedroom count as shown on tenancy cards; optional because listings may omit it.';
