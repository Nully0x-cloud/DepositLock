"use client";

import { Inbox } from "lucide-react";
import { useMemo, useState } from "react";
import { FilterTabs } from "@/components/app/filter-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { TenancyCard } from "@/components/tenancy/tenancy-card";
import { TENANCIES, filterTenancies } from "@/data/tenancies";
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

export function TenancyExplorer() {
  const [filter, setFilter] = useState<TenancyFilter>("all");

  const counts = useMemo(() => {
    const base = { all: TENANCIES.length, active: 0, pending: 0, closed: 0 };
    for (const tenancy of TENANCIES) {
      base[tenancy.filterGroup] += 1;
    }
    return base;
  }, []);

  const filtered = useMemo(
    () => filterTenancies(TENANCIES, filter),
    [filter],
  );

  const empty = filter === "all" ? null : EMPTY_COPY[filter];

  return (
    <div className="space-y-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <FilterTabs value={filter} onChange={setFilter} counts={counts} />
        <p className="text-sm text-muted" aria-live="polite">
          Showing {filtered.length} of {TENANCIES.length} tenancies
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
          title={empty?.title ?? "No tenancies found"}
          description={
            empty?.description ?? "Try a different filter to see more records."
          }
        />
      )}
    </div>
  );
}
