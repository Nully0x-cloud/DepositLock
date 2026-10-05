import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Profile, SharedProfile } from "@/types/database";
import type { RepositoryResult } from "./errors";
import { fromResult } from "./from-result";
import type { ProfileRecord, SharedProfileRecord } from "./models";

type Client = SupabaseClient<Database>;

export function toProfileRecord(row: Profile): ProfileRecord {
  return {
    id: row.id,
    walletAddress: row.wallet_address,
    fullName: row.full_name,
    email: row.email,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSharedProfileRecord(row: SharedProfile): SharedProfileRecord | null {
  // The generator types every view column as nullable — it cannot prove the
  // underlying columns are not — so narrow before handing the record on.
  if (!row.id || !row.full_name || !row.created_at) return null;
  return {
    id: row.id,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    walletAddress: row.wallet_address,
    createdAt: row.created_at,
  };
}

/** Read a profile by id. `data` is `null` when it does not exist yet. */
export async function getProfileById(
  client: Client,
  id: string,
): Promise<RepositoryResult<ProfileRecord | null>> {
  const result = await fromResult<Profile | null>(
    client.from("profiles").select("*").eq("id", id).maybeSingle(),
    { allowNull: true },
  );
  if (!result.ok) return result;
  return { ok: true, data: result.data ? toProfileRecord(result.data) : null };
}

/** Look up the profile bound to a wallet address (wallet → profile seam). */
export async function getProfileByWallet(
  client: Client,
  walletAddress: string,
): Promise<RepositoryResult<ProfileRecord | null>> {
  const result = await fromResult<Profile | null>(
    client
      .from("profiles")
      .select("*")
      .eq("wallet_address", walletAddress.trim())
      .maybeSingle(),
    { allowNull: true },
  );
  if (!result.ok) return result;
  return { ok: true, data: result.data ? toProfileRecord(result.data) : null };
}

export type CreateProfileInput = {
  /**
   * Profile id. Phase 3B: this is the Supabase Auth user id (`auth.uid()`) —
   * RLS only lets a caller insert their own row, and `bind_profile_wallet`
   * rejects any other value.
   */
  id: string;
  fullName: string;
  email: string;
  avatarUrl?: string | null;
};

export async function createProfile(
  client: Client,
  input: CreateProfileInput,
): Promise<RepositoryResult<ProfileRecord>> {
  const result = await fromResult<Profile[]>(
    client
      .from("profiles")
      .insert({
        id: input.id,
        full_name: input.fullName.trim(),
        email: input.email.trim().toLowerCase(),
        avatar_url: input.avatarUrl ?? null,
      })
      .select("*"),
  );
  if (!result.ok) return result;
  const row = result.data[0];
  if (!row) return { ok: false, error: { code: "unknown", message: "The profile was not created." } };
  return { ok: true, data: toProfileRecord(row) };
}

export type UpdateProfileInput = {
  fullName?: string;
  email?: string;
  avatarUrl?: string | null;
  walletAddress?: string | null;
};

export async function updateProfile(
  client: Client,
  id: string,
  patch: UpdateProfileInput,
): Promise<RepositoryResult<ProfileRecord>> {
  const payload: Partial<Profile> = {};
  if (patch.fullName !== undefined) payload.full_name = patch.fullName.trim();
  if (patch.email !== undefined) payload.email = patch.email.trim().toLowerCase();
  if (patch.avatarUrl !== undefined) payload.avatar_url = patch.avatarUrl;
  if (patch.walletAddress !== undefined) payload.wallet_address = patch.walletAddress;

  const result = await fromResult<Profile[]>(
    client.from("profiles").update(payload).eq("id", id).select("*"),
    { emptyAsMissing: true },
  );
  if (!result.ok) return result;
  return { ok: true, data: toProfileRecord(result.data[0]) };
}

/**
 * Profiles the caller shares a tenancy with (or their own) — name, avatar and
 * wallet only. Backed by the `v_shared_profiles` view; `email` never leaves
 * the `profiles` table.
 */
export async function listSharedProfiles(
  client: Client,
): Promise<RepositoryResult<SharedProfileRecord[]>> {
  const result = await fromResult<SharedProfile[]>(
    client.from("v_shared_profiles").select("*").order("created_at"),
  );
  if (!result.ok) return result;
  return {
    ok: true,
    data: result.data
      .map(toSharedProfileRecord)
      .filter((record): record is SharedProfileRecord => record !== null),
  };
}
