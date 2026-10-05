"use client";

import type { Session, SolanaWallet, User } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { SIWS_STATEMENT, siwsErrorCopy, walletFromUser } from "@/lib/auth/siws";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/db/client";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export type AuthContextValue = {
  /** `loading` only until Supabase Auth has answered the very first time. */
  status: AuthStatus;
  /** False when no Supabase project is configured (Phase 2 local mode). */
  configured: boolean;
  session: Session | null;
  user: User | null;
  /**
   * The wallet address proven by the session. Display/consistency only —
   * every authorization decision re-derives it from `auth.identities`.
   */
  walletAddress: string | null;
  /** True while a signature request is outstanding. */
  signing: boolean;
  /** User-facing copy for the last sign-in failure, if any. */
  error: string | null;
  /** Sign in with Solana. Resolves `true` once a session exists. */
  signInWithWallet(wallet: SolanaWallet): Promise<boolean>;
  /** End the Supabase Auth session (the wallet stays connected). */
  signOut(): Promise<void>;
  clearError(): void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Hosts the Supabase Auth session for the app.
 *
 * Sign-in is a Sign-In-With-Solana signature (SIWS): the wallet proves it
 * owns an address, Supabase Auth verifies the signature and returns a normal
 * session whose `sub` is the profile id used everywhere in the schema.
 *
 * Adapter-free on purpose — the wallet adapter is wired up separately by
 * `<AuthWalletSync>` so this provider stays testable and reusable.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const configured = isSupabaseConfigured();
  const client = configured ? getSupabaseBrowserClient() : null;

  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>(() =>
    configured ? "loading" : "unauthenticated",
  );
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const commit = useCallback((next: Session | null) => {
    setSession(next);
    setStatus(next ? "authenticated" : "unauthenticated");
  }, []);

  // Every session transition — restore, sign-in, sign-out, token refresh —
  // arrives through this one subscription (INITIAL_SESSION is emitted
  // asynchronously after the client finishes restoring from storage).
  useEffect(() => {
    if (!client) return;

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, next) => {
      commit(next);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [client, commit]);

  const signInWithWallet = useCallback(
    async (wallet: SolanaWallet): Promise<boolean> => {
      if (!client) return false;

      setSigning(true);
      setError(null);
      try {
        const { error: signInError } = await client.auth.signInWithWeb3({
          chain: "solana",
          statement: SIWS_STATEMENT,
          wallet,
          options: { url: window.location.origin },
        });
        if (signInError) throw signInError;
        // The SIGNED_IN event commits the session through the subscription.
        return true;
      } catch (cause) {
        setError(siwsErrorCopy(cause));
        return false;
      } finally {
        setSigning(false);
      }
    },
    [client],
  );

  const signOut = useCallback(async () => {
    setError(null);
    if (!client) {
      commit(null);
      return;
    }
    try {
      await client.auth.signOut();
    } catch {
      // The local session is cleared below regardless; a failed server-side
      // revoke only means the refresh token dies on its own expiry.
    }
    commit(null);
  }, [client, commit]);

  const clearError = useCallback(() => setError(null), []);

  const walletAddress = useMemo(() => walletFromUser(session?.user ?? null), [session]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      configured,
      session,
      user: session?.user ?? null,
      walletAddress,
      signing,
      error,
      signInWithWallet,
      signOut,
      clearError,
    }),
    [
      clearError,
      configured,
      error,
      session,
      signInWithWallet,
      signOut,
      signing,
      status,
      walletAddress,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Auth state for components inside `<AuthProvider>` (the /app layout). */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error(
      "useAuth must be used inside <AuthProvider>. It is mounted by the /app layout.",
    );
  }
  return context;
}
