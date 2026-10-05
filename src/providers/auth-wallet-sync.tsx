"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect } from "react";
import { hasWalletMismatch, signOutOnDisconnect } from "@/lib/auth/session-sync";
import { useAuth } from "@/providers/auth-provider";

/**
 * Keeps the Supabase Auth session in step with the connected Solana wallet.
 *
 * Lives inside `<SolanaProvider>` (wallet events) and `<AuthProvider>`
 * (session), rendered by the /app layout. Two rules, both implemented in
 * `src/lib/auth/session-sync.ts`:
 *
 *  1. the wallet disconnects → the session proven through it is dropped;
 *  2. a *different* wallet connects while signed in → the stale session is
 *     dropped immediately rather than let to keep acting for the old wallet.
 *
 * Deliberately does nothing during `autoConnect` grace: an absent public key
 * is not a mismatch.
 */
export function AuthWalletSync() {
  const { status, session, walletAddress: sessionWallet, signOut } = useAuth();
  const { wallets, publicKey } = useWallet();

  const connectedWallet = publicKey ? publicKey.toBase58() : null;
  const authenticated = status === "authenticated" && session !== null;

  // (1) adapter disconnect event
  useEffect(() => {
    const adapters = wallets.map((entry) => entry.adapter);
    const handleDisconnect = () => {
      if (signOutOnDisconnect(authenticated)) void signOut();
    };
    adapters.forEach((adapter) => adapter.on("disconnect", handleDisconnect));
    return () => {
      adapters.forEach((adapter) => adapter.off("disconnect", handleDisconnect));
    };
  }, [authenticated, signOut, wallets]);

  // (2) wallet changed underneath a live session
  useEffect(() => {
    if (!authenticated) return;
    if (hasWalletMismatch(sessionWallet, connectedWallet)) {
      void signOut();
    }
  }, [authenticated, connectedWallet, sessionWallet, signOut]);

  return null;
}
