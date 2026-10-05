"use client";

import { ShieldCheck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useSiwsWallet } from "@/hooks/use-siws-wallet";
import { useWalletIdentity } from "@/hooks/use-wallet-identity";
import { useAuth } from "@/providers/auth-provider";

type SignInPromptProps = {
  title?: string;
  description?: string;
  className?: string;
};

/**
 * The gate shown where a session is required but none exists (spec §42).
 *
 * Connected wallet → one-tap verification with the copy the spec asks for:
 * it is a signature over a message, never a transaction. No wallet yet →
 * connect first.
 */
export function SignInPrompt({
  title = "Verify wallet ownership",
  description = "Sign this message to continue. No funds will move.",
  className,
}: SignInPromptProps) {
  const { signing, error, signInWithWallet, clearError } = useAuth();
  const identity = useWalletIdentity();
  const solanaWallet = useSiwsWallet();

  const action = solanaWallet ? (
    <div className="flex flex-col items-center gap-2.5">
      <Button
        onClick={() => {
          clearError();
          void signInWithWallet(solanaWallet);
        }}
        disabled={signing}
      >
        <ShieldCheck aria-hidden className="size-4" strokeWidth={1.9} />
        {signing ? "Check your wallet…" : "Verify wallet to continue"}
      </Button>
      {error ? (
        <p role="alert" className="max-w-xs text-xs leading-relaxed text-dispute">
          {error}
        </p>
      ) : (
        <p className="max-w-xs text-xs leading-relaxed text-muted">
          Your wallet signs a message — no transaction is created and no funds
          move.
        </p>
      )}
    </div>
  ) : (
    <Button
      onClick={identity.connect}
      disabled={identity.connecting}
    >
      <Wallet aria-hidden className="size-4" strokeWidth={1.9} />
      {identity.connecting ? "Connecting…" : "Connect wallet first"}
    </Button>
  );

  return (
    <EmptyState
      icon={ShieldCheck}
      title={title}
      description={description}
      action={action}
      className={className}
    />
  );
}
