"use client";

import { WalletReadyState, type WalletName } from "@solana/wallet-adapter-base";
import { useWallet } from "@solana/wallet-adapter-react";
import { ArrowUpRight, Check, Loader2, ShieldCheck, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { WalletIcon } from "@/components/wallet/wallet-icon";
import { explorerClusterLabel } from "@/lib/solana/explorer";
import { useWalletSession } from "@/providers/wallet-session-context";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

type WalletOption = {
  name: WalletName;
  url: string;
  icon: string;
  readyState: WalletReadyState;
};

function readinessRank(state: WalletReadyState): number {
  switch (state) {
    case WalletReadyState.Installed:
      return 0;
    case WalletReadyState.Loadable:
      return 1;
    default:
      return 2;
  }
}

function readinessLabel(state: WalletReadyState): string {
  switch (state) {
    case WalletReadyState.Installed:
      return "Ready";
    case WalletReadyState.Loadable:
      return "Available";
    default:
      return "Not installed";
  }
}

function WalletGlyph({ icon, name }: { icon: string; name: string }) {
  return (
    <WalletIcon
      icon={icon}
      name={name}
      glyphClassName="text-[0.8125rem] font-semibold text-forest"
    />
  );
}

export function WalletModal() {
  const { open, closeModal, error, dismissError } = useWalletSession();
  const { wallets, select, wallet, connecting } = useWallet();

  const dialogRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<string | null>(null);

  // A successful connection always closes the dialog.
  useEffect(() => {
    if (!open) return;
    const adapters = wallets.map((entry) => entry.adapter);
    const handleConnect = () => {
      setPending(null);
      closeModal();
    };
    adapters.forEach((adapter) => adapter.on("connect", handleConnect));
    return () => {
      adapters.forEach((adapter) => adapter.off("connect", handleConnect));
    };
  }, [open, wallets, closeModal]);

  // Focus trap, escape handling and scroll lock while the dialog is open.
  useEffect(() => {
    if (!open) return;

    const previous = document.activeElement as HTMLElement | null;
    const node = dialogRef.current;
    const focusable = node
      ? Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      : [];
    focusable[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeModal();
        return;
      }
      if (event.key !== "Tab" || !node) return;

      const items = Array.from(
        node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previous?.focus?.();
    };
  }, [open, closeModal]);

  const handleSelect = useCallback(
    (option: WalletOption) => {
      if (option.readyState === WalletReadyState.NotDetected) return;
      dismissError();
      setPending(option.name);
      select(option.name);
    },
    [dismissError, select],
  );

  const handleBackdrop = useCallback(() => {
    closeModal();
  }, [closeModal]);

  if (!open) return null;

  const options: WalletOption[] = wallets
    .map(({ adapter, readyState }) => ({
      name: adapter.name,
      url: adapter.url,
      icon: adapter.icon,
      readyState,
    }))
    .sort((a, b) => readinessRank(a.readyState) - readinessRank(b.readyState));

  const activeName = error ? null : pending ?? wallet?.adapter.name ?? null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close wallet dialog"
        tabIndex={-1}
        onClick={handleBackdrop}
        className="absolute inset-0 h-full w-full cursor-default bg-ink/45 animate-fade-in"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-dialog-title"
        aria-describedby="wallet-dialog-description"
        className="relative max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-line bg-parchment shadow-[0_24px_60px_-24px_rgba(16,42,32,0.45)] animate-slide-up sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line-soft px-6 pb-5 pt-6">
          <div className="min-w-0">
            <p className="eyebrow text-moss">DepositLock</p>
            <h2
              id="wallet-dialog-title"
              className="mt-2 font-serif text-[1.625rem] leading-tight tracking-[-0.02em] text-ink"
            >
              Connect your wallet
            </h2>
          </div>
          <button
            type="button"
            onClick={closeModal}
            aria-label="Close"
            className="grid size-9 shrink-0 place-items-center rounded-full border border-line bg-cream-raised text-muted transition-colors hover:text-ink"
          >
            <X aria-hidden className="size-4" strokeWidth={2} />
          </button>
        </div>

        <div className="px-6 pb-6 pt-5">
          <p
            id="wallet-dialog-description"
            className="text-[0.9375rem] leading-relaxed text-muted"
          >
            Your wallet is used to verify your identity and approve protected
            deposit transactions.
          </p>

          {error ? (
            <p
              role="alert"
              className="mt-5 rounded-xl border border-pending/30 bg-pending-soft px-4 py-3 text-sm font-medium text-pending"
            >
              {error}
            </p>
          ) : null}

          <ul className="mt-5 grid gap-2.5" aria-label="Available wallets">
            {options.map((option) => {
              const isPending = activeName === option.name && connecting;
              const isDone =
                activeName === option.name &&
                !connecting &&
                Boolean(wallet) &&
                !error;
              const detected =
                option.readyState === WalletReadyState.Installed ||
                option.readyState === WalletReadyState.Loadable;

              const body = (
                <>
                  <span
                    aria-hidden
                    className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-cream text-forest"
                  >
                    <WalletGlyph icon={option.icon} name={option.name} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">
                      {option.name}
                    </span>
                    <span
                      className={
                        detected
                          ? "block text-xs text-muted"
                          : "block text-xs text-subtle"
                      }
                    >
                      {readinessLabel(option.readyState)}
                    </span>
                  </span>
                  {isPending ? (
                    <Loader2
                      aria-hidden
                      className="size-4 shrink-0 animate-spin text-forest"
                      strokeWidth={2}
                    />
                  ) : isDone ? (
                    <Check
                      aria-hidden
                      className="size-4 shrink-0 text-protected"
                      strokeWidth={2.5}
                    />
                  ) : detected ? (
                    <ArrowUpRight
                      aria-hidden
                      className="size-4 shrink-0 text-subtle transition-colors group-hover:text-forest"
                      strokeWidth={2}
                    />
                  ) : (
                    <ArrowUpRight
                      aria-hidden
                      className="size-4 shrink-0 text-subtle"
                      strokeWidth={2}
                    />
                  )}
                </>
              );

              return (
                <li key={option.name}>
                  {detected ? (
                    <button
                      type="button"
                      onClick={() => handleSelect(option)}
                      className="group flex w-full items-center gap-3 rounded-2xl border border-line bg-cream-raised px-4 py-3.5 text-left transition-colors hover:border-forest/40 focus-visible:border-forest/40"
                    >
                      {body}
                    </button>
                  ) : (
                    <a
                      href={option.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex w-full items-center gap-3 rounded-2xl border border-dashed border-line bg-transparent px-4 py-3.5 text-left transition-colors hover:border-forest/40"
                    >
                      {body}
                      <span className="sr-only">
                        {`Install ${option.name} (opens in a new tab)`}
                      </span>
                    </a>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-line bg-cream-raised px-4 py-3.5">
            <ShieldCheck
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-moss"
              strokeWidth={1.9}
            />
            <p className="text-xs leading-relaxed text-muted">
              We never ask for your recovery phrase and we never store your
              keys. Your wallet only approves actions you confirm. Currently
              connected to Solana {explorerClusterLabel()}.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
