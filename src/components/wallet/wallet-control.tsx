"use client";

import {
  ChevronDown,
  Check,
  Copy,
  ExternalLink,
  LogOut,
  ShieldCheck,
  Unplug,
  UserRound,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { WalletIcon } from "@/components/wallet/wallet-icon";
import { useSiwsWallet } from "@/hooks/use-siws-wallet";
import { useWalletIdentity } from "@/hooks/use-wallet-identity";
import { explorerAddressUrl, explorerClusterLabel } from "@/lib/solana/explorer";
import { useAuth } from "@/providers/auth-provider";
import { cn } from "@/lib/utils";

function CopyState({ copied }: { copied: boolean }) {
  return copied ? (
    <Check aria-hidden className="size-4 text-protected" strokeWidth={2.5} />
  ) : (
    <Copy aria-hidden className="size-4" strokeWidth={1.9} />
  );
}

/**
 * Header wallet control.
 *
 * Disconnected → a single "Connect Wallet" button.
 * Connected    → shortened address that opens copy / explorer / disconnect.
 */
export function WalletControl() {
  const identity = useWalletIdentity();
  const { status: authStatus, signing, signInWithWallet, signOut, clearError } = useAuth();
  const solanaWallet = useSiwsWallet();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const handleVerify = useCallback(() => {
    if (!solanaWallet) return;
    close();
    clearError();
    void signInWithWallet(solanaWallet);
  }, [clearError, close, signInWithWallet, solanaWallet]);

  const handleSignOut = useCallback(() => {
    close();
    void signOut();
  }, [close, signOut]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);

  const handleCopy = useCallback(async () => {
    if (!identity.address) return;
    try {
      await navigator.clipboard.writeText(identity.address);
      setCopied(true);
    } catch {
      // Clipboard access denied — the Explorer link remains available.
    }
  }, [identity.address]);

  const handleDisconnect = useCallback(async () => {
    close();
    await identity.disconnect();
  }, [close, identity]);

  if (!identity.connected) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={identity.connect}
        disabled={identity.connecting}
        className="px-3 sm:px-4"
        aria-label={
          identity.connecting ? "Connecting wallet" : "Connect wallet"
        }
      >
        <Wallet aria-hidden className="size-4" strokeWidth={1.9} />
        <span className="hidden sm:inline">
          {identity.connecting ? "Connecting…" : "Connect Wallet"}
        </span>
      </Button>
    );
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Connected wallet ${identity.shortAddress}. Open wallet menu`}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-full border border-line bg-parchment py-1.5 pl-1.5 pr-2.5 transition-colors hover:border-forest/40"
      >
        <span
          aria-hidden
          className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-cream text-forest"
        >
          {identity.walletIcon ? (
            <WalletIcon
              icon={identity.walletIcon}
              name={identity.walletName ?? "Wallet"}
              className="size-4"
            />
          ) : (
            <Wallet className="size-3.5" strokeWidth={1.9} />
          )}
        </span>
        <span className="font-mono text-[0.75rem] tracking-tight text-ink">
          {identity.shortAddress}
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            "size-3.5 text-subtle transition-transform duration-150",
            open && "rotate-180",
          )}
          strokeWidth={2}
        />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Wallet actions"
          className="absolute right-0 top-full z-50 mt-2 w-[16.5rem] overflow-hidden rounded-2xl border border-line bg-parchment p-1.5 shadow-[0_18px_40px_-20px_rgba(16,42,32,0.5)] animate-fade-in"
        >
          <div className="flex items-center gap-2.5 px-2.5 pb-2.5 pt-2">
            <span
              aria-hidden
              className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-cream"
            >
              {identity.walletIcon ? (
                <WalletIcon
                  icon={identity.walletIcon}
                  name={identity.walletName ?? "Wallet"}
                  className="size-4"
                />
              ) : (
                <Wallet aria-hidden className="size-4 text-forest" strokeWidth={1.9} />
              )}
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-xs font-semibold text-ink">
                {identity.walletName ?? "Wallet"}
              </span>
              <span className="block truncate font-mono text-[0.6875rem] text-muted">
                {identity.shortAddress}
              </span>
            </span>
          </div>

          <button
            type="button"
            role="menuitem"
            onClick={handleCopy}
            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left text-sm text-ink transition-colors hover:bg-sand"
          >
            <CopyState copied={copied} />
            {copied ? "Address copied" : "Copy address"}
          </button>

          <a
            href={explorerAddressUrl(identity.address ?? "")}
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left text-sm text-ink transition-colors hover:bg-sand"
          >
            <ExternalLink aria-hidden className="size-4" strokeWidth={1.9} />
            View on Explorer
            <span className="ml-auto text-[0.6875rem] text-subtle">
              {explorerClusterLabel()}
            </span>
          </a>

          <div className="my-1 h-px bg-line-soft" />

          {authStatus === "authenticated" ? (
            <>
              <p className="flex items-center gap-2.5 px-2.5 py-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-protected">
                <Check aria-hidden className="size-3.5" strokeWidth={2.5} />
                Wallet verified for this session
              </p>
              <button
                type="button"
                role="menuitem"
                onClick={handleSignOut}
                disabled={signing}
                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left text-sm text-ink transition-colors hover:bg-sand disabled:opacity-60"
              >
                <LogOut aria-hidden className="size-4" strokeWidth={1.9} />
                Sign out
              </button>
            </>
          ) : null}

          {authStatus === "unauthenticated" && solanaWallet ? (
            <>
              <p className="px-2.5 py-1.5 text-[0.6875rem] text-muted">
                This wallet has not been verified yet.
              </p>
              <button
                type="button"
                role="menuitem"
                onClick={handleVerify}
                disabled={signing}
                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left text-sm font-medium text-forest transition-colors hover:bg-sand disabled:opacity-60"
              >
                <ShieldCheck aria-hidden className="size-4" strokeWidth={1.9} />
                {signing ? "Check your wallet…" : "Verify wallet"}
              </button>
            </>
          ) : null}

          <div className="my-1 h-px bg-line-soft" />

          <button
            type="button"
            role="menuitem"
            onClick={handleDisconnect}
            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left text-sm text-dispute transition-colors hover:bg-dispute-soft"
          >
            <Unplug aria-hidden className="size-4" strokeWidth={1.9} />
            Disconnect
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Avatar / identity link for the header. Mirrors the three states the
 * product needs: no wallet, wallet without profile, wallet with profile.
 */
export function HeaderIdentity({
  profileName,
  walletConnected,
}: {
  profileName: string | null;
  walletConnected: boolean;
}) {
  const initials = profileName
    ? profileName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("")
    : null;

  if (walletConnected && !profileName) {
    return (
      <Link
        href="/app/profile"
        className="inline-flex h-9 items-center gap-2 rounded-full bg-forest px-3.5 text-xs font-semibold text-cream transition-colors hover:bg-forest-deep"
      >
        <UserRound aria-hidden className="size-3.5" strokeWidth={2} />
        Complete Profile
      </Link>
    );
  }

  return (
    <Link
      href="/app/profile"
      aria-label={
        profileName ? `Open profile for ${profileName}` : "Open profile"
      }
      className="flex items-center gap-2.5 rounded-full border border-transparent py-1 pl-1 pr-1.5 transition-colors hover:border-line hover:bg-cream-raised sm:pr-2"
    >
      <span
        aria-hidden
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-full text-[0.6875rem] font-semibold",
          initials ? "bg-forest text-cream" : "border border-line bg-sand text-muted",
        )}
      >
        {initials ?? <UserRound aria-hidden className="size-4" strokeWidth={1.8} />}
      </span>
      {profileName ? (
        <span className="hidden leading-tight sm:block">
          <span className="block max-w-[9rem] truncate text-[0.8125rem] font-semibold text-ink">
            {profileName}
          </span>
        </span>
      ) : (
        <span className="hidden text-[0.8125rem] font-medium text-muted sm:block">
          Profile
        </span>
      )}
    </Link>
  );
}
