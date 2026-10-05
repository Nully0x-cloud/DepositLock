"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useMemo } from "react";
import type { SolanaWallet } from "@supabase/supabase-js";

/**
 * The connected wallet, shaped for `auth.signInWithWeb3`.
 *
 * auth-js prefers the Wallet Standard `signIn` request when the wallet
 * supports it and falls back to `signMessage` with a hand-built SIWS message
 * — either way the signature is verified by Supabase Auth, never here.
 * Returns `null` until a wallet is connected.
 */
export function useSiwsWallet(): SolanaWallet | null {
  const { publicKey, signMessage, signIn } = useWallet();

  return useMemo(() => {
    if (!publicKey) return null;
    return {
      publicKey,
      signMessage: signMessage ?? undefined,
      // The wallet-standard and auth-js copies of the SIWS types are
      // structurally identical at runtime; only their nominal types differ.
      signIn: signIn as SolanaWallet["signIn"],
    };
  }, [publicKey, signIn, signMessage]);
}
