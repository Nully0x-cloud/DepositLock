"use client";

import { useWalletSession } from "@/providers/wallet-session-context";

/** Opens and closes the DepositLock wallet-selection dialog. */
export function useWalletModal() {
  const { open, openModal, closeModal } = useWalletSession();
  return { open, openModal, closeModal };
}
