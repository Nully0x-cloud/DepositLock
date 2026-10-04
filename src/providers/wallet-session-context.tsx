"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

export type WalletSessionContextValue = {
  /** Whether the wallet-selection dialog is open. */
  open: boolean;
  openModal: () => void;
  closeModal: () => void;
  /** Calm, consumer-facing copy — never a raw adapter error. */
  error: string | null;
  dismissError: () => void;
};

const WalletSessionContext = createContext<WalletSessionContextValue | null>(
  null,
);

export function WalletSessionProvider({
  adapterError,
  onDismissError,
  children,
}: {
  adapterError: string | null;
  onDismissError: () => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const dismissError = useCallback(() => {
    onDismissError();
  }, [onDismissError]);

  const openModal = useCallback(() => {
    onDismissError();
    setOpen(true);
  }, [onDismissError]);

  const closeModal = useCallback(() => {
    setOpen(false);
    onDismissError();
  }, [onDismissError]);

  const value = useMemo<WalletSessionContextValue>(
    () => ({
      open,
      openModal,
      closeModal,
      error: adapterError,
      dismissError,
    }),
    [adapterError, closeModal, dismissError, open, openModal],
  );

  return (
    <WalletSessionContext.Provider value={value}>
      {children}
    </WalletSessionContext.Provider>
  );
}

export function useWalletSession(): WalletSessionContextValue {
  const context = useContext(WalletSessionContext);
  if (!context) {
    throw new Error(
      "useWalletSession must be used inside <SolanaProvider>. Wrap the route in providers/solana-provider.",
    );
  }
  return context;
}
