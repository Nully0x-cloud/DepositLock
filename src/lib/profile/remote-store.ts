import { createProfile as insertProfile, getProfileByWallet, updateProfile } from "@/lib/db";
import type { DbClient } from "@/lib/db/client-type";
import type { ProfileRecord } from "@/lib/db/models";
import type { UserProfile } from "@/types/profile";

/**
 * The async persistence seam for profiles.
 *
 * Phase 2 persisted to `localStorage` through the synchronous
 * `ProfileRepository`. Phase 3A keeps that exactly as it is and adds this
 * second interface for the remote side, so the switch from local to Supabase
 * is a change of implementation rather than a change of callers:
 *
 *   UI / hooks
 *     → profile store (fast, SSR-safe, synchronous reads)
 *       → `ProfileRemoteStore` (this file)
 *         → `local`   (no remote: today's behaviour)
 *         → `supabase`(wraps the profile repository)
 */
export type ProfileRemoteStore = {
  readonly mode: "local" | "supabase";
  /** Resolves the profile bound to a wallet, or `null` when there is none. */
  load(walletAddress: string | null): Promise<UserProfile | null>;
  /** Mirrors a profile upstream. Never throws — local remains authoritative. */
  push(profile: UserProfile): Promise<void>;
};

function toUserProfile(record: ProfileRecord): UserProfile {
  return {
    id: record.id,
    fullName: record.fullName,
    email: record.email,
    walletAddress: record.walletAddress,
    avatarUrl: record.avatarUrl,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/** Phase 2 behaviour: there is no remote, so nothing is ever loaded/pushed. */
export const localProfileRemoteStore: ProfileRemoteStore = {
  mode: "local",
  load: async () => null,
  push: async () => undefined,
};

/**
 * Supabase-backed store. Uses the anon key client, so it inherits RLS — with
 * no authenticated session yet this resolves to "no remote profile" rather
 * than bypassing anything.
 */
export function createSupabaseProfileRemoteStore(
  client: DbClient,
): ProfileRemoteStore {
  return {
    mode: "supabase",

    async load(walletAddress) {
      if (!walletAddress) return null;

      const result = await getProfileByWallet(client, walletAddress);
      if (!result.ok) return null;
      return result.data ? toUserProfile(result.data) : null;
    },

    async push(profile) {
      if (!profile.walletAddress) return;

      try {
        const existing = await getProfileByWallet(client, profile.walletAddress);
        const payload = {
          fullName: profile.fullName,
          email: profile.email,
          avatarUrl: profile.avatarUrl ?? null,
          walletAddress: profile.walletAddress,
        };

        if (existing.ok && existing.data) {
          await updateProfile(client, existing.data.id, payload);
          return;
        }

        await insertProfile(client, payload);
      } catch {
        // Remote mirroring is best-effort: the local profile stays source of
        // truth until an authenticated session exists (Phase 3B).
      }
    },
  };
}
