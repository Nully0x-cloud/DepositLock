import type { ProfileFormValues, UserProfile } from "@/types/profile";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/db/client";
import {
  createSupabaseProfileRemoteStore,
  localProfileRemoteStore,
  type ProfileRemoteStore,
} from "./remote-store";

/**
 * Picks the remote store for the current environment.
 *
 * With no Supabase configured it returns the Phase 2 no-op store, so the app
 * keeps working exactly as it did before any backend existed.
 */
export function resolveProfileRemoteStore(): ProfileRemoteStore {
  if (!isSupabaseConfigured()) return localProfileRemoteStore;

  const client = getSupabaseBrowserClient();
  if (!client) return localProfileRemoteStore;

  return createSupabaseProfileRemoteStore(client);
}

/**
 * Loads the signed-in user's profile. Remote is authoritative — a missing
 * row means "no profile created yet", which is a normal state (the create
 * form), not an error. Connection/permission failures throw.
 */
export async function loadRemoteProfile(
  userId: string,
): Promise<UserProfile | null> {
  return resolveProfileRemoteStore().load(userId);
}

/** Creates the profile for the signed-in user. Throws on failure. */
export async function createRemoteProfile(
  userId: string,
  values: ProfileFormValues,
): Promise<UserProfile> {
  return resolveProfileRemoteStore().create(userId, values);
}

/** Updates the signed-in user's own profile. Throws on failure. */
export async function updateRemoteProfile(
  userId: string,
  values: ProfileFormValues,
): Promise<UserProfile> {
  return resolveProfileRemoteStore().update(userId, values);
}

/**
 * Prefill seed for the create form (spec §26).
 *
 * The local cache is *not* the profile — it is a convenience copy. It may
 * only prefill the create form when it was written for the very wallet whose
 * signature the user is about to produce, so a shared or stale browser cache
 * can never graft someone else's name/email onto a new account.
 */
export function prefillFromCache(
  cached: UserProfile | null,
  sessionWallet: string | null,
): ProfileFormValues | null {
  if (!cached || !sessionWallet) return null;
  if (!cached.walletAddress) return null;
  if (cached.walletAddress !== sessionWallet) return null;
  return { fullName: cached.fullName, email: cached.email };
}
