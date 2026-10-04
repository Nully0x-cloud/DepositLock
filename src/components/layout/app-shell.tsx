"use client";

import { Menu, Wallet, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Brand } from "@/components/layout/brand";
import { Container } from "@/components/layout/container";
import { AppNavList, AppSidebar } from "@/components/layout/app-sidebar";
import { CURRENT_USER } from "@/data/tenancies";
import { sectionForPath } from "@/lib/navigation";
import { cn, initialsOf } from "@/lib/utils";

function WalletPlaceholder() {
  return (
    <div
      className="hidden items-center gap-2 rounded-full border border-line bg-cream-raised px-3 py-2 sm:flex"
      title="Wallet integration arrives in a later phase"
    >
      <Wallet aria-hidden className="size-4 text-subtle" strokeWidth={1.8} />
      <span className="text-xs font-medium text-muted">Not connected</span>
      <span aria-hidden className="size-1.5 rounded-full bg-pending" />
      <span className="sr-only">Wallet not connected yet</span>
    </div>
  );
}

function UserIdentity() {
  return (
    <Link
      href="/app/profile"
      className="flex items-center gap-2.5 rounded-full border border-transparent py-1 pl-1 pr-2 transition-colors hover:border-line hover:bg-cream-raised"
    >
      <span
        aria-hidden
        className="grid size-8 shrink-0 place-items-center rounded-full bg-forest text-[0.6875rem] font-semibold text-cream"
      >
        {initialsOf(CURRENT_USER.name)}
      </span>
      <span className="hidden text-left leading-tight sm:block">
        <span className="block text-[0.8125rem] font-semibold text-ink">
          {CURRENT_USER.name}
        </span>
        <span className="block text-[0.6875rem] text-subtle">
          {CURRENT_USER.role}
        </span>
      </span>
      <span className="sr-only">Open profile</span>
    </Link>
  );
}

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const section = sectionForPath(pathname);

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
                <WalletPlaceholder />
                <UserIdentity />
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
                  className="grid size-9 place-items-center rounded-full bg-forest text-xs font-semibold text-cream"
                >
                  {initialsOf(CURRENT_USER.name)}
                </span>
                <span className="min-w-0 leading-tight">
                  <span className="block truncate text-sm font-semibold text-ink">
                    {CURRENT_USER.name}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {CURRENT_USER.email}
                  </span>
                </span>
              </div>
              <p className="flex items-center gap-2 rounded-full border border-line bg-parchment px-3 py-2 text-xs text-muted">
                <Wallet aria-hidden className="size-3.5" strokeWidth={1.8} />
                Wallet not connected
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
