import {
  createProfile as insertProfile,
  getProfileById,
  mapRepositoryError,
  updateProfile,
} from "@/lib/db";
import type { DbClient } from "@/lib/db/client-type";
import type { ProfileRecord } from "@/lib/db/models";
import type { RepositoryErrorCode } from "@/lib/db/errors";
import type { ProfileFormValues, UserProfile } from "@/types/profile";

/**
 * The async persistence seam for profiles — Phase 3B edition.
 *
 * Supabase is now the authority, and rows are keyed by the auth user id
 * (`profiles.id = auth.uid()`), never by a wallet address the browser claims:
 *
 *   UI / hooks
 *     → profile store (fast, SSR-safe, synchronous reads)
 *       → `ProfileRemoteStore` (this file)
 *         → `local`   (no Supabase configured: nothing remote exists)
 *         → `supabase`(wraps the profile repository under RLS)
 *
 * Remote failures are thrown as `ProfileRemoteError` with copy that is safe
 * to render; the caller decides whether that is a form error or a page state.
 */
export type ProfileRemoteStore = {
  readonly mode: "local" | "supabase";
  /** The signed-in user's profile, or `null` when it does not exist yet. */
  load(userId: string): Promise<UserProfile | null>;
  /** Creates the profile row for `userId` (wallet is stamped by the DB). */
  create(userId: string, values: ProfileFormValues): Promise<UserProfile>;
  /** Updates name/email on `userId`'s own row. */
  update(userId: string, values: ProfileFormValues): Promise<UserProfile>;
};

/** A remote profile failure, carrying render-safe copy. */
export class ProfileRemoteError extends Error {
  readonly code: RepositoryErrorCode;

  constructor(error: { code: RepositoryErrorCode; message: string }) {
    super(error.message);
    this.name = "ProfileRemoteError";
    this.code = error.code;
  }
}

export function isProfileRemoteError(value: unknown): value is ProfileRemoteError {
  return value instanceof ProfileRemoteError;
}

/** Friendly copy for any profile failure (remote or otherwise). */
export function profileErrorCopy(cause: unknown): string {
  if (isProfileRemoteError(cause)) return cause.message;
  const message =
    cause && typeof cause === "object" && "message" in cause
      ? String((cause as { message: unknown }).message)
      : "";
  if (/fetch|network|load failed/i.test(message)) {
    return "We couldn't reach DepositLock. Check your connection and try again.";
  }
  return "We couldn't save your profile. Please try again.";
}

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

/** No Supabase configured: the remote side simply does not exist. */
export const localProfileRemoteStore: ProfileRemoteStore = {
  mode: "local",
  load: async () => null,
  create: async () => {
    throw new ProfileRemoteError({
      code: "unknown",
      message: "No remote profile store is configured.",
    });
  },
  update: async () => {
    throw new ProfileRemoteError({
      code: "unknown",
      message: "No remote profile store is configured.",
    });
  },
};

/**
 * Supabase-backed store. Uses the anon-key client, so it inherits RLS: every
 * read/write is the signed-in user's own row, and the `bind_profile_wallet`
 * trigger stamps `wallet_address` from `auth.identities`.
 */
export function createSupabaseProfileRemoteStore(
  client: DbClient,
): ProfileRemoteStore {
  return {
    mode: "supabase",

    async load(userId) {
      const result = await getProfileById(client, userId);
      if (!result.ok) throw new ProfileRemoteError(result.error);
      return result.data ? toUserProfile(result.data) : null;
    },

    async create(userId, values) {
      const result = await insertProfile(client, {
        id: userId,
        fullName: values.fullName,
        email: values.email,
      });
      if (!result.ok) throw new ProfileRemoteError(result.error);
      return toUserProfile(result.data);
    },

    async update(userId, values) {
      const result = await updateProfile(client, userId, {
        fullName: values.fullName,
        email: values.email,
      });
      if (!result.ok) throw new ProfileRemoteError(result.error);
      return toUserProfile(result.data);
    },
  };
}

/** Maps an unexpected repository failure onto the same error family. */
export function asProfileRemoteError(cause: unknown): ProfileRemoteError {
  if (isProfileRemoteError(cause)) return cause;
  return new ProfileRemoteError(mapRepositoryError(cause));
}
