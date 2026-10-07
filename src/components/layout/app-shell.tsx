"use client";

import { Menu, UserRound, Wallet, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Brand } from "@/components/layout/brand";
import { Container } from "@/components/layout/container";
import { AppNavList, AppSidebar } from "@/components/layout/app-sidebar";
import { NotificationBell } from "@/components/app/notification-bell";
import { HeaderIdentity, WalletControl } from "@/components/wallet/wallet-control";
import { VerifyWalletButton } from "@/components/wallet/verify-wallet-button";
import { useProfile } from "@/hooks/use-profile";
import { useWalletIdentity } from "@/hooks/use-wallet-identity";
import { sectionForPath } from "@/lib/navigation";
import { cn, initialsOf } from "@/lib/utils";

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const section = sectionForPath(pathname);
  const { profile } = useProfile();
  const wallet = useWalletIdentity();

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div className="min-h-screen bg-cream">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-forest focus:px-4 focus:py-2 focus:text-sm focus:text-cream"
      >
        Skip to content
      </a>

      <div className="flex">
        <AppSidebar />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 border-b border-line bg-cream/95 backdrop-blur supports-[backdrop-filter]:bg-cream/85">
            <Container className="flex h-16 items-center justify-between gap-4 py-0 sm:h-[4.5rem]">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => setOpen(true)}
                  aria-expanded={open}
                  aria-controls="app-mobile-nav"
                  aria-label="Open navigation menu"
                  className="grid size-9 place-items-center rounded-lg border border-line bg-parchment text-ink transition-colors hover:bg-sand lg:hidden"
                >
                  <Menu aria-hidden className="size-4" strokeWidth={2} />
                </button>

                <span className="lg:hidden">
                  <Brand href="/app" size="sm" />
                </span>

                <p className="hidden truncate lg:block">
                  <span className="eyebrow text-subtle">DepositLock</span>
                  <span aria-hidden className="mx-2 text-line">
                    /
                  </span>
                  <span className="eyebrow text-ink">{section}</span>
                </p>
              </div>

              <div className="flex items-center gap-2 sm:gap-3">
                <NotificationBell />
                <VerifyWalletButton />
                <WalletControl />
                <HeaderIdentity
                  profileName={profile?.fullName ?? null}
                  walletConnected={wallet.connected}
                />
              </div>
            </Container>
          </header>

          <main id="main-content" className="flex-1">
            {children}
          </main>
        </div>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-ink/40 animate-fade-in"
          />
          <div
            id="app-mobile-nav"
            role="dialog"
            aria-modal="true"
            aria-label="Application navigation"
            className={cn(
              "absolute inset-y-0 left-0 flex w-[17rem] max-w-[85vw] flex-col border-r border-line bg-sand animate-slide-in",
            )}
          >
            <div className="flex items-center justify-between px-5 pb-5 pt-6">
              <Brand
                href="/app"
                size="sm"
                onClick={() => setOpen(false)}
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation menu"
                className="grid size-9 place-items-center rounded-lg border border-line bg-parchment text-ink"
              >
                <X aria-hidden className="size-4" strokeWidth={2} />
              </button>
            </div>

            <div className="px-3">
              <AppNavList variant="drawer" onNavigate={() => setOpen(false)} />
            </div>

            <div className="mt-auto space-y-3 border-t border-line px-5 py-5">
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-forest text-xs font-semibold text-cream"
                >
                  {profile ? (
                    initialsOf(profile.fullName)
                  ) : (
                    <UserRound className="size-4" strokeWidth={1.8} />
                  )}
                </span>
                <span className="min-w-0 leading-tight">
                  <span className="block truncate text-sm font-semibold text-ink">
                    {profile ? profile.fullName : "No profile yet"}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {profile
                      ? profile.email
                      : "Create one from the profile page"}
                  </span>
                </span>
              </div>
              <p
                className={cn(
                  "flex items-center gap-2 rounded-full border border-line px-3 py-2 text-xs",
                  wallet.connected
                    ? "bg-cream-raised text-ink"
                    : "bg-parchment text-muted",
                )}
              >
                <Wallet aria-hidden className="size-3.5" strokeWidth={1.8} />
                {wallet.connected ? (
                  <span className="font-mono">{wallet.shortAddress}</span>
                ) : (
                  "Wallet not connected"
                )}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
