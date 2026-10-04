"use client";

import { ShieldCheck, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useWalletIdentity } from "@/hooks/use-wallet-identity";

type ConnectToContinueProps = {
  title?: string;
  description?: string;
  actionLabel?: string;
  /** Rendered inside the panel under the CTA (e.g. a secondary link). */
  children?: ReactNode;
  className?: string;
};

/**
 * Reusable action state for features that will eventually need a wallet.
 * Reused wherever a protected action is gated in a later phase.
 */
export function ConnectToContinue({
  title = "Connect your wallet to continue",
  description = "Your wallet verifies your identity when you create, fund, or settle a tenancy.",
  actionLabel = "Connect Wallet",
  children,
  className,
}: ConnectToContinueProps) {
  const { connect, connecting, connected } = useWalletIdentity();

  if (connected) return null;

  return (
    <div
      className={
        className ??
        "flex flex-col items-center rounded-3xl border border-dashed border-line bg-cream-raised px-6 py-12 text-center"
      }
    >
      <span
        aria-hidden
        className="grid size-12 place-items-center rounded-full bg-sand text-forest"
      >
        <ShieldCheck className="size-6" strokeWidth={1.75} />
      </span>

      <h3 className="mt-5 font-serif text-[1.5rem] leading-tight tracking-[-0.02em] text-ink">
        {title}
      </h3>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
        {description}
      </p>

      <div className="mt-7">
        <Button onClick={connect} disabled={connecting}>
          <Wallet aria-hidden className="size-4" strokeWidth={1.9} />
          {connecting ? "Connecting…" : actionLabel}
        </Button>
      </div>

      {children}
    </div>
  );
}
