"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useCallback } from "react";
import { shortenAddress } from "@/lib/solana/wallet-identity";
import { useWalletSession } from "@/providers/wallet-session-context";

export type WalletIdentityStatus =
  | "disconnected"
  | "connecting"
  | "connected";

export type WalletIdentity = {
  status: WalletIdentityStatus;
  connected: boolean;
  connecting: boolean;
  address: string | null;
  shortAddress: string | null;
  walletName: string | null;
  walletIcon: string | null;
  /** Calm copy describing the last connection problem, if any. */
  error: string | null;
  /** Opens the wallet-selection dialog. */
  connect: () => void;
  /** Disconnects safely; adapter errors never escape as unhandled rejections. */
  disconnect: () => Promise<void>;
};

/**
 * The single wallet-state layer the UI reads from.
 * Wraps the adapter context so components never touch it directly.
 */
export function useWalletIdentity(): WalletIdentity {
  const {
    publicKey,
    wallet,
    connecting,
    connected,
    disconnect: adapterDisconnect,
  } = useWallet();
  const { openModal, error } = useWalletSession();

  const address = publicKey ? publicKey.toBase58() : null;

  const disconnect = useCallback(async () => {
    try {
      await adapterDisconnect();
    } catch {
      // Disconnect failures are non-actionable for the user; the adapter's
      // own onError already reduced them to calm copy.
    }
  }, [adapterDisconnect]);

  const status: WalletIdentityStatus = connected
    ? "connected"
    : connecting
      ? "connecting"
      : "disconnected";

  return {
    status,
    connected,
    connecting: connecting && !connected,
    address,
    shortAddress: address ? shortenAddress(address) : null,
    walletName: wallet ? String(wallet.adapter.name) : null,
    walletIcon: wallet?.adapter.icon ?? null,
    error,
    connect: openModal,
    disconnect,
  };
}
