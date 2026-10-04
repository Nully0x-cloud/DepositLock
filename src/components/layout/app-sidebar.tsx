"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brand } from "@/components/layout/brand";
import { APP_NAV, isActivePath } from "@/lib/navigation";
import { cn } from "@/lib/utils";

type AppNavListProps = {
  onNavigate?: () => void;
  variant?: "rail" | "drawer";
};

export function AppNavList({ onNavigate, variant = "rail" }: AppNavListProps) {
  const pathname = usePathname();

  return (
    <nav aria-label="Application">
      <ul
        className={cn(
          "gap-1",
          variant === "rail" ? "grid" : "grid gap-1.5",
        )}
      >
        {APP_NAV.map((item) => {
          const active = isActivePath(item, pathname);
          const Icon = item.icon;

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors duration-150",
                  active
                    ? "bg-forest text-cream"
                    : "text-muted hover:bg-sand/70 hover:text-ink",
                )}
              >
                <Icon
                  aria-hidden
                  className={cn("size-[18px] shrink-0", active ? "text-cream" : "text-subtle")}
                  strokeWidth={1.85}
                />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function AppSidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen w-[264px] shrink-0 flex-col border-r border-line bg-sand/55 lg:flex">
      <div className="px-6 pb-6 pt-7">
        <Brand href="/app" />
      </div>

      <div className="px-4">
        <AppNavList />
      </div>

      <div className="mt-auto px-6 pb-6 pt-8">
        <div className="rounded-2xl border border-line bg-parchment p-4">
          <p className="eyebrow text-subtle">Settlement</p>
          <p className="mt-2 text-[0.8125rem] leading-relaxed text-muted">
            Rules are enforced without either party holding the funds.
          </p>
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-line bg-cream px-2.5 py-1 text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-moss">
            <span aria-hidden className="size-1.5 rounded-full bg-forest" />
            Powered by Solana
          </p>
        </div>
      </div>
    </aside>
  );
}
