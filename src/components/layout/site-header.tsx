"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Brand } from "@/components/layout/brand";
import { Container } from "@/components/layout/container";

const NAV_LINKS = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#tenants", label: "For Tenants" },
  { href: "/#landlords", label: "For Landlords" },
  { href: "/#why", label: "Why DepositLock" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-cream">
      <Container>
        <div className="flex h-[4.5rem] items-center justify-between gap-6">
          <Brand />

          <nav aria-label="Primary" className="hidden lg:block">
            <ul className="flex items-center gap-1">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="rounded-full px-3.5 py-2 text-sm text-muted transition-colors hover:bg-sand/70 hover:text-ink"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="hidden items-center gap-2 lg:flex">
            <ButtonLink href="/app" variant="ghost" size="sm">
              Sign In
            </ButtonLink>
            <ButtonLink href="/app/create" size="sm">
              Create a Tenancy
            </ButtonLink>
          </div>

          <div className="flex items-center gap-2 lg:hidden">
            <ButtonLink href="/app" variant="ghost" size="sm" className="px-3">
              Sign In
            </ButtonLink>
            <Button
              variant="secondary"
              size="sm"
              className="px-3"
              aria-expanded={open}
              aria-controls="site-mobile-menu"
              aria-label={open ? "Close menu" : "Open menu"}
              onClick={() => setOpen((value) => !value)}
            >
              {open ? (
                <X aria-hidden className="size-4" />
              ) : (
                <Menu aria-hidden className="size-4" />
              )}
            </Button>
          </div>
        </div>
      </Container>

      <div
        id="site-mobile-menu"
        hidden={!open}
        className="border-t border-line bg-cream lg:hidden"
      >
        <Container className="py-5">
          <nav aria-label="Mobile">
            <ul className="grid gap-1">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-xl px-3 py-3 text-[0.9375rem] text-ink transition-colors hover:bg-sand/70"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
            <ButtonLink
              href="/app/create"
              onClick={() => setOpen(false)}
              className="w-full"
            >
              Create a Tenancy
            </ButtonLink>
            <ButtonLink
              href="/app"
              variant="outline"
              className="w-full"
              onClick={() => setOpen(false)}
            >
              Sign In
            </ButtonLink>
          </div>
        </Container>
      </div>
    </header>
  );
}
