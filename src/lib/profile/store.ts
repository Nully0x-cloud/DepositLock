import type { ProfileFormValues, UserProfile } from "@/types/profile";

/** Bump when the persisted shape changes so old records are discarded safely. */
export const PROFILE_SCHEMA_VERSION = 1;

export type CreateProfileInput = ProfileFormValues & {
  walletAddress: string | null;
  /** Injected for deterministic tests. */
  id?: string;
  now?: string;
};

export type ProfilePatch = Partial<
  Pick<UserProfile, "fullName" | "email" | "walletAddress" | "avatarUrl">
>;

function generateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `profile_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createProfile(input: CreateProfileInput): UserProfile {
  const timestamp = input.now ?? new Date().toISOString();
  const profile: UserProfile = {
    id: input.id ?? generateId(),
    fullName: input.fullName.trim(),
    email: input.email.trim(),
    walletAddress: input.walletAddress,
    avatarUrl: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return profile;
}

/**
 * Applies a patch without ever dropping unrelated fields.
 * `walletAddress` can only be changed here (from a connected wallet) —
 * the profile form never writes it.
 */
export function updateProfile(
  current: UserProfile,
  patch: ProfilePatch,
  now: string = new Date().toISOString(),
): UserProfile {
  const next: UserProfile = { ...current };

  if (typeof patch.fullName === "string") {
    next.fullName = patch.fullName.trim();
  }
  if (typeof patch.email === "string") {
    next.email = patch.email.trim();
  }
  if ("walletAddress" in patch && patch.walletAddress !== undefined) {
    next.walletAddress = patch.walletAddress;
  }
  if ("avatarUrl" in patch) {
    next.avatarUrl = patch.avatarUrl;
  }

  next.updatedAt = now;
  return next;
}

/** True when the only difference is the bound wallet identity. */
export function walletOnlyChange(
  current: UserProfile,
  walletAddress: string | null,
): boolean {
  return current.walletAddress !== walletAddress;
}
