"use client";

import type { ReactNode } from "react";
import { ConnectToContinue } from "@/components/wallet/connect-to-continue";
import { useWalletIdentity } from "@/hooks/use-wallet-identity";

type WalletRequiredProps = {
  children: ReactNode;
  /** Custom state to render when no wallet is connected. */
  fallback?: ReactNode;
};

/**
 * Gate for actions that will require a wallet in a later phase.
 *
 * Nothing in Phase 2 is wrapped by default — the application stays browsable
 * while disconnected. Use this only where a real protected action lives.
 */
export function WalletRequired({ children, fallback }: WalletRequiredProps) {
  const { connected } = useWalletIdentity();

  if (connected) return <>{children}</>;
  return <>{fallback ?? <ConnectToContinue />}</>;
}
