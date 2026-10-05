"use client";

import { Inbox, RefreshCw, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { FilterTabs } from "@/components/app/filter-tabs";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TenancyCard } from "@/components/tenancy/tenancy-card";
import { SignInPrompt } from "@/components/wallet/sign-in-prompt";
import { filterTenancies } from "@/data/tenancies";
import { useTenancies } from "@/hooks/use-tenancies";
import type { TenancyFilter } from "@/types/tenancy";

const EMPTY_COPY: Record<Exclude<TenancyFilter, "all">, { title: string; description: string }> = {
  active: {
    title: "No active tenancies",
    description: "Tenancies with a protected deposit will appear here.",
  },
  pending: {
    title: "No pending tenancies",
    description:
      "Tenancies waiting on funding or move-in will appear here.",
  },
  closed: {
    title: "No closed tenancies yet",
    description:
      "Once a deposit is settled, the archived tenancy record will appear here.",
  },
};

function SkeletonCard() {
  return (
    <li
      aria-hidden
      className="animate-pulse overflow-hidden rounded-2xl border border-line bg-parchment"
    >
      <div className="aspect-[16/10] w-full bg-sand" />
      <div className="space-y-4 p-6">
        <div className="h-5 w-2/3 rounded bg-sand" />
        <div className="h-4 w-1/2 rounded bg-sand" />
        <div className="h-16 rounded-xl bg-cream-raised" />
        <div className="h-10 rounded-xl bg-cream-raised" />
      </div>
    </li>
  );
}

/**
 * The tenancy list (§28). Data comes from Supabase behind RLS when a backend
 * is configured — with explicit loading, sign-in, error/retry and empty
 * states instead of assuming rows exist.
 */
export function TenancyExplorer() {
  const result = useTenancies();
  const [filter, setFilter] = useState<TenancyFilter>("all");

  const tenancies = useMemo(
    () => (result.status === "ready" ? result.tenancies : []),
    [result],
  );

  const counts = useMemo(() => {
    const base = { all: tenancies.length, active: 0, pending: 0, closed: 0 };
    for (const tenancy of tenancies) {
      base[tenancy.filterGroup] += 1;
    }
    return base;
  }, [tenancies]);

  const filtered = useMemo(
    () => filterTenancies(tenancies, filter),
    [filter, tenancies],
  );

  if (result.status === "loading") {
    return (
      <div aria-busy="true" aria-live="polite" className="space-y-7">
        <p className="text-sm text-muted">Loading your tenancies…</p>
        <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </ul>
      </div>
    );
  }

  if (result.status === "unauthenticated") {
    return (
      <SignInPrompt
        title="Your tenancies, verified by wallet"
        description="Sign in with your wallet to see the tenancy records you take part in. Nothing moves on-chain — the signature only proves it's you."
      />
    );
  }

  if (result.status === "error") {
    return (
      <EmptyState
        icon={TriangleAlert}
        title="We couldn't load your tenancies"
        description={result.message}
        action={
          <Button variant="outline" onClick={result.retry}>
            <RefreshCw aria-hidden className="size-4" strokeWidth={1.9} />
            Try again
          </Button>
        }
      />
    );
  }

  const empty = filter === "all" ? null : EMPTY_COPY[filter];

  return (
    <div className="space-y-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <FilterTabs value={filter} onChange={setFilter} counts={counts} />
        <p className="text-sm text-muted" aria-live="polite">
          Showing {filtered.length} of {tenancies.length} tenancies
        </p>
      </div>

      {filtered.length > 0 ? (
        <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((tenancy) => (
            <li key={tenancy.id}>
              <TenancyCard tenancy={tenancy} className="h-full" />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={Inbox}
          title={empty?.title ?? "No tenancies yet"}
          description={
            empty?.description ??
            "Tenancies you are invited to — or create — will appear here."
          }
        />
      )}
    </div>
  );
}
