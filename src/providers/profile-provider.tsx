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

  const createProfile = useCallback(
    (values: ProfileFormValues) => profileStore.create(values, walletAddress),
    [walletAddress],
  );

  const updateProfile = useCallback(
    (values: ProfileFormValues) => profileStore.update(values),
    [],
  );

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
