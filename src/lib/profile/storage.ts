import type { UserProfile } from "@/types/profile";

export const PROFILE_STORAGE_KEY = "depositlock.profile.v1";

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type ProfileRepository = {
  read(): UserProfile | null;
  write(profile: UserProfile): void;
  clear(): void;
};

function isUserProfile(value: unknown): value is UserProfile {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<UserProfile>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.fullName === "string" &&
    typeof candidate.email === "string" &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.updatedAt === "string" &&
    (typeof candidate.walletAddress === "string" ||
      candidate.walletAddress === null)
  );
}

export function parseProfile(raw: string | null): UserProfile | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isUserProfile(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Creates a repository over any Storage-compatible object.
 * Injecting storage keeps this layer unit-testable and lets a Supabase
 * implementation take its place later with the same interface.
 */
export function createProfileRepository(
  storage: StorageLike,
  key: string = PROFILE_STORAGE_KEY,
): ProfileRepository {
  return {
    read() {
      try {
        return parseProfile(storage.getItem(key));
      } catch {
        return null;
      }
    },
    write(profile) {
      try {
        storage.setItem(key, JSON.stringify(profile));
      } catch {
        // Storage full or blocked (private mode) — profile stays in memory.
      }
    },
    clear() {
      try {
        storage.removeItem(key);
      } catch {
        // Ignore — nothing to clean up if storage is unavailable.
      }
    },
  };
}

function browserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const memoryFallback = (() => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  } satisfies StorageLike;
})();

function resolveRepository(): ProfileRepository {
  return createProfileRepository(browserStorage() ?? memoryFallback);
}

/**
 * Default repository used by the app. SSR-safe: storage is resolved lazily on
 * every call, so the browser always gets localStorage while the server (and
 * private-mode browsers) fall back to an in-memory store.
 */
export const localProfileRepository: ProfileRepository = {
  read: () => resolveRepository().read(),
  write: (profile) => resolveRepository().write(profile),
  clear: () => resolveRepository().clear(),
};
