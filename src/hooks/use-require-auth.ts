"use client";

import { useAuth } from "@/providers/auth-provider";

export type AuthGate = {
  status: "loading" | "authenticated" | "unauthenticated";
  /** Supabase Auth has answered — safe to decide what to render. */
  ready: boolean;
  authenticated: boolean;
  configured: boolean;
  /** `auth.uid()` for the current session, or null. */
  userId: string | null;
  /** Wallet proven by the session (display/consistency only). */
  walletAddress: string | null;
};

/**
 * Gate for anything that needs a signed-in user (spec §11).
 *
 * Data hooks call this instead of reaching for the raw session: `ready` is
 * false only during the very first Auth handshake, so views can show a
 * loading state instead of flashing an empty or error state.
 */
export function useRequireAuth(): AuthGate {
  const { status, configured, user, walletAddress } = useAuth();

  return {
    status,
    ready: status !== "loading",
    authenticated: status === "authenticated",
    configured,
    userId: user?.id ?? null,
    walletAddress,
  };
}
