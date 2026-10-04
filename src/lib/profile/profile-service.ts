import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/db/client";
import type { UserProfile } from "@/types/profile";
import {
  createSupabaseProfileRemoteStore,
  localProfileRemoteStore,
  type ProfileRemoteStore,
} from "./remote-store";

/**
 * Picks the remote store for the current environment.
 *
 * With no Supabase configured (the default for this build) it returns the
 * Phase 2 no-op store, so behaviour is byte-for-byte what it was before.
 */
export function resolveProfileRemoteStore(): ProfileRemoteStore {
  if (!isSupabaseConfigured()) return localProfileRemoteStore;

  const client = getSupabaseBrowserClient();
  if (!client) return localProfileRemoteStore;

  return createSupabaseProfileRemoteStore(client);
}

/**
 * Reconciles the local profile with whatever the remote returned.
 *
 * Rules:
 * - no remote profile            → keep local untouched (never wipe on absence)
 * - remote older or same         → keep local (local is the editing surface)
 * - remote newer                 → adopt remote
 *
 * Pure so the conflict policy is unit-testable without a database.
 */
export function reconcileProfile(
  local: UserProfile | null,
  remote: UserProfile | null,
): UserProfile | null {
  if (!remote) return null;
  if (!local) return remote;
  if (Date.parse(remote.updatedAt) > Date.parse(local.updatedAt)) return remote;
  return null;
}

/** Loads the wallet-bound profile from the remote, if one is configured. */
export async function pullRemoteProfile(
  walletAddress: string | null,
): Promise<UserProfile | null> {
  const store = resolveProfileRemoteStore();
  if (store.mode === "local") return null;

  try {
    return await store.load(walletAddress);
  } catch {
    return null;
  }
}

/** Mirrors a profile upstream. Failures are swallowed by design. */
export async function pushRemoteProfile(profile: UserProfile): Promise<void> {
  const store = resolveProfileRemoteStore();
  if (store.mode === "local") return;

  try {
    await store.push(profile);
  } catch {
    // Best-effort mirror; the local repository remains authoritative.
  }
}
