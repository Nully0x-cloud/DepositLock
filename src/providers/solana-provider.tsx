"use client";

import { BackpackWalletAdapter } from "@solana/wallet-adapter-backpack";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import type {
  Adapter,
  WalletAdapterNetwork,
} from "@solana/wallet-adapter-base";
import { useCallback, useMemo, useState } from "react";
import { WalletModal } from "@/components/wallet/wallet-modal";
import { describeWalletError } from "@/lib/solana/wallet-identity";
import {
  SOLANA_CLUSTER,
  SOLANA_COMMITMENT,
  SOLANA_RPC_URL,
  WALLET_STORAGE_KEY,
} from "@/lib/solana/config";
import { WalletSessionProvider } from "@/providers/wallet-session-context";

/**
 * Application-level Solana wiring.
 *
 * Mount this inside the authenticated app route only — the landing page stays
 * free of wallet code and wallet UI.
 *
 * Cluster + RPC come from `src/lib/solana/config.ts`; switching to mainnet is
 * an environment change, not a code change.
 */
export function SolanaProvider({ children }: { children: React.ReactNode }) {
  const [adapterError, setAdapterError] = useState<string | null>(null);

  // Explicit adapters supplement the wallets discovered via wallet-standard.
  const wallets = useMemo<Adapter[]>(
    () => [
      new PhantomWalletAdapter(),
      // Our cluster union matches the adapter's string enum; TS keeps them apart.
      new SolflareWalletAdapter({
        network: SOLANA_CLUSTER as WalletAdapterNetwork,
      }),
      new BackpackWalletAdapter(),
    ],
    [],
  );

  // Every adapter error is reduced to calm copy; raw errors never reach the UI.
  const onError = useCallback((error: unknown) => {
    setAdapterError(describeWalletError(error));
  }, []);

  const onDismissError = useCallback(() => setAdapterError(null), []);

  return (
    <ConnectionProvider
      endpoint={SOLANA_RPC_URL}
      config={{ commitment: SOLANA_COMMITMENT }}
    >
      <WalletProvider
        wallets={wallets}
        autoConnect
        localStorageKey={WALLET_STORAGE_KEY}
        onError={onError}
      >
        <WalletSessionProvider
          adapterError={adapterError}
          onDismissError={onDismissError}
        >
          <WalletModal />
          {children}
        </WalletSessionProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
