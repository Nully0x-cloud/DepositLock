"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { validateProfileForm } from "@/lib/profile/validation";
import { profileStore } from "@/lib/profile/profile-store";
import { selectVisibleProfile } from "@/lib/profile/visible-profile";
import {
  createRemoteProfile,
  loadRemoteProfile,
  prefillFromCache,
  updateRemoteProfile,
} from "@/lib/profile/profile-service";
import { profileErrorCopy } from "@/lib/profile/remote-store";
import { useAuth } from "@/providers/auth-provider";
import type { ProfileFormValues, UserProfile } from "@/types/profile";

export type ProfileSyncStatus = "idle" | "loading" | "ready" | "error";

export type ProfileMutationResult =
  | { ok: true; profile: UserProfile }
  | { ok: false; errors: Record<string, string | undefined> };

export type ProfileContextValue = {
  /** Snapshot the UI renders. Null means "no profile (yet)". */
  profile: UserProfile | null;
  /** Address of the currently connected wallet adapter (form display only). */
  walletAddress: string | null;
  /** Remote profile sync for the current auth session. `idle` when local-only. */
  syncStatus: ProfileSyncStatus;
  /** Render-safe copy of the last sync/mutation failure. */
  syncError: string | null;
  /** Create-form seed from the local cache — only for a wallet match (§26). */
  prefill: ProfileFormValues | null;
  createProfile(values: ProfileFormValues): Promise<ProfileMutationResult>;
  updateProfile(values: ProfileFormValues): Promise<ProfileMutationResult>;
  /** Re-run the remote profile load (used by the error state's retry). */
  reloadProfile(): void;
  /** Explicit wipe of profile from memory and storage. */
  clearProfile(): void;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

/**
 * Hosts the profile store and keeps it in step with the auth session.
 *
 * Phase 3B rules:
 * - Supabase is authoritative. On sign-in the row for `auth.uid()` replaces
 *   the snapshot; a missing row means the create form, not an error.
 * - Sign-out drops the snapshot but NOT the local cache — the cache survives
 *   only as a prefill seed for the next verification (§26).
 * - Without Supabase configured nothing changes from Phase 2: the local
 *   profile still follows the connected wallet.
 *
 * Lives inside `<SolanaProvider>` (wallet events) and `<AuthProvider>`.
 */
export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { status: authStatus, user, configured: authConfigured, walletAddress: sessionWallet } =
    useAuth();
  const { wallets, publicKey } = useWallet();

  const snapshot = useSyncExternalStore(
    profileStore.subscribe,
    profileStore.getSnapshot,
    profileStore.getServerSnapshot,
  );

  const [syncedFor, setSyncedFor] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const walletAddress = publicKey ? publicKey.toBase58() : null;

  // Phase 2 only: with no backend, the local profile follows the connected
  // wallet. When Supabase is configured the wallet binding is a database
  // concern (`bind_profile_wallet`) and this rewrite must not happen.
  useEffect(() => {
    if (authConfigured) return;

    const adapters = wallets.map((entry) => entry.adapter);
    const handleConnect = (connectedKey: { toBase58(): string }) => {
      profileStore.syncWallet(connectedKey.toBase58());
    };
    adapters.forEach((adapter) => adapter.on("connect", handleConnect));
    return () => {
      adapters.forEach((adapter) => adapter.off("connect", handleConnect));
    };
  }, [authConfigured, wallets]);

  // Remote profile lifecycle: load the row for the signed-in user, or drop
  // the snapshot when there is none / the session ended.
  useEffect(() => {
    if (!authConfigured) return;
    if (authStatus === "loading") return;

    if (authStatus === "unauthenticated" || !user) {
      profileStore.reset();
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const remote = await loadRemoteProfile(user.id);
        if (cancelled) return;
        if (remote) profileStore.adopt(remote);
        else profileStore.reset();
        setSyncError(null);
        setSyncedFor(user.id);
      } catch (cause) {
        if (cancelled) return;
        profileStore.reset();
        setSyncError(profileErrorCopy(cause));
        setSyncedFor(user.id);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authConfigured, authStatus, reloadToken, user]);

  const syncStatus = useMemo<ProfileSyncStatus>(() => {
    if (!authConfigured) return "idle";
    if (authStatus === "loading") return "loading";
    if (authStatus === "unauthenticated" || !user) return "idle";
    if (syncedFor !== user.id) return "loading";
    return syncError ? "error" : "ready";
  }, [authConfigured, authStatus, syncError, syncedFor, user]);

  const prefill = useMemo(
    () => (authConfigured ? prefillFromCache(profileStore.getCached(), sessionWallet) : null),
    [authConfigured, sessionWallet],
  );

  const createProfile = useCallback(
    async (values: ProfileFormValues): Promise<ProfileMutationResult> => {
      if (!authConfigured) {
        // Phase 2 path: synchronous local create (wallet-bound).
        return profileStore.create(values, walletAddress);
      }

      if (!user) {
        return {
          ok: false,
          errors: { walletAddress: "Verify your wallet before creating a profile." },
        };
      }

      const result = validateProfileForm(values);
      if (!result.valid) return { ok: false, errors: result.errors };

      try {
        const created = await createRemoteProfile(user.id, result.values);
        profileStore.adopt(created);
        setSyncError(null);
        setSyncedFor(user.id);
        return { ok: true, profile: created };
      } catch (cause) {
        return { ok: false, errors: { form: profileErrorCopy(cause) } };
      }
    },
    [authConfigured, user, walletAddress],
  );

  const updateProfile = useCallback(
    async (values: ProfileFormValues): Promise<ProfileMutationResult> => {
      if (!authConfigured) {
        return profileStore.update(values);
      }

      if (!user) {
        return {
          ok: false,
          errors: { walletAddress: "Verify your wallet before editing your profile." },
        };
      }

      const result = validateProfileForm(values);
      if (!result.valid) return { ok: false, errors: result.errors };

      try {
        const updated = await updateRemoteProfile(user.id, result.values);
        profileStore.adopt(updated);
        setSyncError(null);
        setSyncedFor(user.id);
        return { ok: true, profile: updated };
      } catch (cause) {
        return { ok: false, errors: { form: profileErrorCopy(cause) } };
      }
    },
    [authConfigured, user],
  );

  const reloadProfile = useCallback(() => setReloadToken((token) => token + 1), []);
  const clearProfile = useCallback(() => profileStore.clear(), []);

  // Never render a snapshot synced for a different (or no) session: after
  // a sign-in, wallet switch, or session restore the store still holds the
  // previous identity until the remote row for the current auth.uid()
  // finishes loading. Gating here keeps one wallet's profile from flashing
  // under another wallet's session.
  const profile = selectVisibleProfile({
    snapshot,
    configured: authConfigured,
    authenticated: authStatus === "authenticated",
    userId: user?.id ?? null,
    syncedFor,
  });

  const value = useMemo<ProfileContextValue>(
    () => ({
      profile,
      walletAddress,
      syncStatus,
      syncError,
      prefill,
      createProfile,
      updateProfile,
      reloadProfile,
      clearProfile,
    }),
    [
      clearProfile,
      createProfile,
      prefill,
      profile,
      reloadProfile,
      syncError,
      syncStatus,
      updateProfile,
      walletAddress,
    ],
  );

  return (
    <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
  );
}

export function useProfileContext(): ProfileContextValue {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error(
      "useProfile must be used inside <ProfileProvider>. It is mounted by the /app layout.",
    );
  }
  return context;
}
