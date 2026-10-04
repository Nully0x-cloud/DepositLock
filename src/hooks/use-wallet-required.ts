"use client";

import { useWalletIdentity, type WalletIdentity } from "@/hooks/use-wallet-identity";

export type WalletGate = WalletIdentity & {
  /** True when the action ahead needs a wallet that is not connected yet. */
  required: boolean;
};

/**
 * Declarative helper for code that needs to branch on wallet availability
 * (for example: hide a submit button until a wallet is connected).
 */
export function useWalletRequired(): WalletGate {
  const identity = useWalletIdentity();
  return { ...identity, required: !identity.connected };
}
