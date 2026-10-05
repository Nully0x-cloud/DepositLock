import type { ProfileFormValues, UserProfile } from "@/types/profile";
import type { ProfileRepository } from "@/lib/profile/storage";
import { localProfileRepository } from "@/lib/profile/storage";
import { createProfile, updateProfile } from "@/lib/profile/store";
import { validateProfileForm } from "@/lib/profile/validation";

type Listener = () => void;

export type ProfileCreateResult =
  | { ok: true; profile: UserProfile }
  | { ok: false; errors: Record<string, string | undefined> };

export type ProfileStore = {
  /** Stable client snapshot for `useSyncExternalStore`. */
  getSnapshot(): UserProfile | null;
  /** Always null on the server so hydration matches. */
  getServerSnapshot(): UserProfile | null;
  subscribe(listener: Listener): () => void;
  /**
   * The raw local cache from storage, independent of the snapshot. Used only
   * to seed the create form when the wallet matches (§26) — never to render
   * a profile.
   */
  getCached(): UserProfile | null;
  /** Validates then persists a brand-new profile. */
  create(values: ProfileFormValues, walletAddress: string | null): ProfileCreateResult;
  /** Validates then persists edits to name/email only. */
  update(values: ProfileFormValues): ProfileCreateResult;
  /** Re-binds the wallet identity without touching anything else. */
  syncWallet(walletAddress: string | null): void;
  /**
   * Adopts a profile loaded from the remote. Remote is the authority
   * (Phase 3B): timestamps never veto the row the server just returned.
   */
  adopt(profile: UserProfile): void;
  /**
   * Drops the in-memory snapshot WITHOUT touching storage. Used when the
   * session ends or the signed-in user has no remote row yet: the UI shows
   * "no profile", while the local copy survives as a prefill seed (§26).
   */
  reset(): void;
  /** Drops the profile from memory and storage (explicit wipe). */
  clear(): void;
};

/**
 * A tiny external store around the profile repository.
 *
 * `useSyncExternalStore` gives us SSR-safe reads (server always sees null)
 * without any setState-in-effect, and keeps persistence behind a single
 * seam that Supabase can replace in Phase 3.
 */
export function createProfileStore(repository: ProfileRepository): ProfileStore {
  let snapshot: UserProfile | null | undefined;
  const listeners = new Set<Listener>();

  function load(): UserProfile | null {
    if (snapshot === undefined) snapshot = repository.read();
    return snapshot;
  }

  function notify(): void {
    listeners.forEach((listener) => listener());
  }

  function commit(next: UserProfile | null): void {
    snapshot = next;
    if (next) repository.write(next);
    else repository.clear();
    notify();
  }

  return {
    getSnapshot: load,
    getServerSnapshot: () => null,
    getCached() {
      return repository.read();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    create(values, walletAddress) {
      const result = validateProfileForm(values);
      if (!result.valid) return { ok: false, errors: result.errors };

      const profile = createProfile({
        fullName: result.values.fullName,
        email: result.values.email,
        walletAddress,
      });
      commit(profile);
      return { ok: true, profile };
    },
    update(values) {
      const current = load();
      if (!current) return { ok: false, errors: { fullName: "No profile yet." } };

      const result = validateProfileForm(values);
      if (!result.valid) return { ok: false, errors: result.errors };

      const next = updateProfile(current, {
        fullName: result.values.fullName,
        email: result.values.email,
      });
      commit(next);
      return { ok: true, profile: next };
    },
    syncWallet(walletAddress) {
      const current = load();
      if (!current) return;
      if (current.walletAddress === walletAddress) return;
      commit(updateProfile(current, { walletAddress }));
    },
    adopt(profile) {
      commit(profile);
    },
    reset() {
      snapshot = null;
      notify();
    },
    clear() {
      commit(null);
    },
  };
}

/** The store the application uses. */
export const profileStore = createProfileStore(localProfileRepository);
