"use client";

import { ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSiwsWallet } from "@/hooks/use-siws-wallet";
import { useWalletIdentity } from "@/hooks/use-wallet-identity";
import { useAuth } from "@/providers/auth-provider";

/**
 * Header "Verify Wallet" control (spec §42).
 *
 * Visible only when a wallet is connected but no session exists: it asks
 * the wallet to sign the SIWS message and creates the Supabase Auth session.
 * While the signature is outstanding the label tells the user where to look
 * ("Check your wallet…"), and a failure surfaces directly under the button
 * instead of vanishing into a console.
 */
export function VerifyWalletButton({ className }: { className?: string }) {
  const { status, signing, error, signInWithWallet, clearError } = useAuth();
  const identity = useWalletIdentity();
  const solanaWallet = useSiwsWallet();

  if (status !== "unauthenticated") return null;
  if (!identity.connected || !solanaWallet) return null;

  return (
    <span className="relative inline-flex">
      <Button
        variant="outline"
        size="sm"
        className={className}
        disabled={signing || identity.connecting}
        onClick={() => {
          clearError();
          void signInWithWallet(solanaWallet);
        }}
        title="Sign a message to prove you own this wallet. No funds will move."
      >
        <ShieldCheck aria-hidden className="size-4" strokeWidth={1.9} />
        <span className="hidden sm:inline">
          {signing ? "Check your wallet…" : "Verify Wallet"}
        </span>
        <span className="sm:hidden">{signing ? "Verify…" : "Verify"}</span>
      </Button>

      {error && !signing ? (
        <div
          role="alert"
          className="absolute right-0 top-full z-50 mt-2 w-[19rem] rounded-2xl border border-dispute/30 bg-dispute-soft p-3 shadow-[0_18px_40px_-20px_rgba(16,42,32,0.5)] animate-fade-in"
        >
          <div className="flex items-start gap-2">
            <p className="min-w-0 flex-1 text-xs leading-relaxed text-dispute">
              {error}
            </p>
            <button
              type="button"
              onClick={clearError}
              aria-label="Dismiss sign-in error"
              className="grid size-5 shrink-0 place-items-center rounded-md text-dispute/70 transition-colors hover:bg-dispute/10 hover:text-dispute"
            >
              <X aria-hidden className="size-3.5" strokeWidth={2} />
            </button>
          </div>
        </div>
      ) : null}
    </span>
  );
}
