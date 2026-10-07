import { ArrowRight, CalendarDays } from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/badge";
import { PropertyImage } from "@/components/tenancy/property-image";
import { IdentityRow } from "@/components/tenancy/identity-row";
import {
  cn,
  formatCurrency,
  formatDateRange,
} from "@/lib/utils";
import type { Tenancy } from "@/types/tenancy";

type TenancyCardProps = {
  tenancy: Tenancy;
  className?: string;
};

export function TenancyCard({ tenancy, className }: TenancyCardProps) {
  const href = `/app/tenancies/${tenancy.id}`;

  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-parchment transition-colors duration-200 hover:border-forest/35",
        className,
      )}
    >
      <PropertyImage
        src={tenancy.imageUrl}
        alt={tenancy.imageAlt}
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        className="aspect-[16/10] w-full"
      />

      <div className="flex flex-1 flex-col gap-5 p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-serif text-[1.375rem] leading-tight tracking-[-0.01em] text-ink">
              {tenancy.address}
            </h3>
            <p className="mt-1 text-sm text-muted">
              {tenancy.locality} · {tenancy.eircode}
            </p>
          </div>
          <StatusBadge status={tenancy.recordStatus} className="shrink-0" />
        </div>

        <dl className="grid grid-cols-2 gap-4 border-t border-line-soft pt-4">
          <div>
            <dt className="eyebrow text-subtle">Deposit</dt>
            <dd className="mt-1.5 text-lg font-semibold tracking-[-0.02em] text-ink">
              {formatCurrency(tenancy.depositAmount)}
            </dd>
          </div>
          <div>
            <dt className="eyebrow text-subtle">Tenancy</dt>
            <dd className="mt-1.5 flex items-start gap-1.5 text-[0.8125rem] leading-snug text-muted">
              <CalendarDays
                aria-hidden
                className="mt-0.5 size-3.5 shrink-0 text-subtle"
                strokeWidth={1.8}
              />
              <span>{formatDateRange(tenancy.startDate, tenancy.endDate)}</span>
            </dd>
          </div>
        </dl>

        <div className="flex items-center gap-3 rounded-xl bg-cream-raised p-3">
          <div className="min-w-0 flex-1">
            <IdentityRow party={tenancy.tenant} size="sm" showMeta={false} />
          </div>
          <span aria-hidden className="h-9 w-px shrink-0 bg-line" />
          <div className="min-w-0 flex-1">
            <IdentityRow party={tenancy.landlord} size="sm" showMeta={false} />
          </div>
        </div>

        <Link
          href={href}
          aria-label={`View tenancy at ${tenancy.address}, ${tenancy.locality}`}
          className="mt-auto flex items-center justify-between border-t border-line-soft pt-4 text-sm font-semibold text-forest"
        >
          <span>View Tenancy</span>
          <ArrowRight
            aria-hidden
            className="size-4 transition-transform duration-200 group-hover:translate-x-1"
            strokeWidth={2}
          />
        </Link>
      </div>
    </article>
  );
}
