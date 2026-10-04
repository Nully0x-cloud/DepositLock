"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import { profileStore } from "@/lib/profile/profile-store";
import {
  pullRemoteProfile,
  pushRemoteProfile,
  reconcileProfile,
} from "@/lib/profile/profile-service";
import type { ProfileFormValues, UserProfile } from "@/types/profile";

export type ProfileContextValue = {
  profile: UserProfile | null;
  /** The address of the wallet currently connected in this session. */
  walletAddress: string | null;
  createProfile(values: ProfileFormValues): ReturnType<typeof profileStore.create>;
  updateProfile(values: ProfileFormValues): ReturnType<typeof profileStore.update>;
  clearProfile(): void;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

/**
 * Hosts the profile store for the authenticated app and keeps the profile's
 * bound wallet identity in step with whichever wallet is connected.
 *
 * Lives inside `<SolanaProvider>` so it can observe wallet connect events.
 */
export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { wallets, publicKey } = useWallet();

  const profile = useSyncExternalStore(
    profileStore.subscribe,
    profileStore.getSnapshot,
    profileStore.getServerSnapshot,
  );

  // Subscribing to the adapter keeps this out of an effect body: when a wallet
  // connects we only rewrite `walletAddress`, never name or email.
  useEffect(() => {
    const adapters = wallets.map((entry) => entry.adapter);
    const handleConnect = (connectedKey: { toBase58(): string }) => {
      profileStore.syncWallet(connectedKey.toBase58());
    };
    adapters.forEach((adapter) => adapter.on("connect", handleConnect));
    return () => {
      adapters.forEach((adapter) => adapter.off("connect", handleConnect));
    };
  }, [wallets]);

  const walletAddress = publicKey ? publicKey.toBase58() : null;

  // Remote seam. When Supabase is configured, the wallet-bound profile is
  // pulled once per wallet and adopted only if it is newer than the local one.
  // Nothing is ever wiped when the remote has no row or is unreachable, so
  // Phase 2 local-only behaviour is preserved exactly when Supabase is absent.
  useEffect(() => {
    let cancelled = false;

    void pullRemoteProfile(walletAddress).then((remote) => {
      if (cancelled) return;
      const adopted = reconcileProfile(profileStore.getSnapshot(), remote);
      if (adopted) profileStore.replace(adopted);
    });

    return () => {
      cancelled = true;
    };
  }, [walletAddress]);

  const createProfile = useCallback(
    (values: ProfileFormValues) => {
      const result = profileStore.create(values, walletAddress);
      if (result.ok) void pushRemoteProfile(result.profile);
      return result;
    },
    [walletAddress],
  );

  const updateProfile = useCallback((values: ProfileFormValues) => {
    const result = profileStore.update(values);
    if (result.ok) void pushRemoteProfile(result.profile);
    return result;
  }, []);

  const clearProfile = useCallback(() => profileStore.clear(), []);

  const value = useMemo<ProfileContextValue>(
    () => ({ profile, walletAddress, createProfile, updateProfile, clearProfile }),
    [createProfile, clearProfile, profile, updateProfile, walletAddress],
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
