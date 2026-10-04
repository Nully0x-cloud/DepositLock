"use client";

import { TENANCY_FILTERS } from "@/data/tenancies";
import { cn } from "@/lib/utils";
import type { TenancyFilter } from "@/types/tenancy";

type FilterTabsProps = {
  value: TenancyFilter;
  onChange: (value: TenancyFilter) => void;
  counts: Record<TenancyFilter, number>;
};

export function FilterTabs({ value, onChange, counts }: FilterTabsProps) {
  return (
    <div
      role="group"
      aria-label="Filter tenancies"
      className="inline-flex flex-wrap items-center gap-1 rounded-full border border-line bg-parchment p-1"
    >
      {TENANCY_FILTERS.map((filter) => {
        const active = filter.value === value;
        const count = counts[filter.value];

        return (
          <button
            key={filter.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(filter.value)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors duration-150",
              active
                ? "bg-forest text-cream"
                : "text-muted hover:bg-sand hover:text-ink",
            )}
          >
            {filter.label}
            <span
              aria-hidden
              className={cn(
                "grid min-w-5 place-items-center rounded-full px-1 text-[0.6875rem] font-semibold tabular-nums",
                active ? "bg-cream/15 text-cream" : "bg-sand text-subtle",
              )}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
