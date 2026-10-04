import { ShieldCheck } from "lucide-react";
import { Container } from "@/components/layout/container";
import { ButtonLink } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { IdentityRow } from "@/components/tenancy/identity-row";
import { PropertyImage } from "@/components/tenancy/property-image";
import { ProtectionRules } from "@/components/tenancy/protection-rules";
import { TENANCIES } from "@/data/tenancies";
import { formatCurrency, formatDateRange } from "@/lib/utils";

const preview = TENANCIES[0];

function TenancyPreviewCard() {
  return (
    <article
      aria-label="Example protected tenancy record"
      className="relative overflow-hidden rounded-3xl border border-line bg-parchment shadow-[0_1px_2px_rgba(30,33,31,0.05),0_28px_60px_-32px_rgba(23,61,45,0.45)]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-line-soft px-6 py-4">
        <p className="eyebrow text-subtle">Tenancy record</p>
        <StatusBadge status={preview.status} />
      </div>

      <PropertyImage
        src={preview.imageUrl}
        alt={preview.imageAlt}
        sizes="(max-width: 1024px) 92vw, 44vw"
        className="aspect-[16/9] w-full"
      />

      <div className="space-y-5 p-6 sm:p-7">
        <div>
          <h3 className="font-serif text-[1.5rem] leading-tight tracking-[-0.015em] text-ink">
            {preview.address}, {preview.locality}
          </h3>
          <p className="mt-1.5 text-sm text-muted">
            {formatDateRange(preview.startDate, preview.endDate)}
          </p>
        </div>

        <div className="rounded-2xl bg-forest px-5 py-5 text-cream">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="eyebrow text-sage">Protected deposit</p>
              <p className="mt-2 font-serif text-[2.5rem] leading-none tracking-[-0.03em]">
                {formatCurrency(preview.depositAmount)}
              </p>
            </div>
            <p className="inline-flex items-center gap-1.5 rounded-full border border-cream/25 bg-cream/10 px-3 py-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.18em]">
              <ShieldCheck aria-hidden className="size-3.5" strokeWidth={2.2} />
              Protected
            </p>
          </div>
          <p className="mt-4 border-t border-cream/15 pt-3 text-[0.8125rem] leading-relaxed text-cream/70">
            Neither party can move these funds independently.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <IdentityRow party={preview.tenant} size="sm" showMeta={false} />
          </div>
          <span aria-hidden className="h-9 w-px shrink-0 bg-line" />
          <div className="min-w-0 flex-1">
            <IdentityRow party={preview.landlord} size="sm" showMeta={false} />
          </div>
        </div>

        <ProtectionRules />
      </div>
    </article>
  );
}

export function Hero() {
  return (
    <section className="relative border-b border-line bg-cream">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(70%_60%_at_20%_0%,rgba(49,92,70,0.10),transparent_70%)]"
      />

      <Container className="relative py-14 sm:py-20 lg:py-24">
        <div className="grid items-center gap-12 lg:grid-cols-[1.02fr_0.98fr] lg:gap-16">
          <div>
            <p className="eyebrow text-moss">Rental deposit protection</p>

            <h1 className="mt-6 font-serif text-[2.5rem] leading-[1.03] tracking-[-0.025em] text-ink sm:text-[3.25rem] lg:text-[3.75rem]">
              Your rental deposit shouldn’t depend on trust.
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted sm:text-[1.125rem]">
              DepositLock protects rental deposits in a neutral account where
              neither tenant nor landlord controls the money alone.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              <ButtonLink href="/app/create" size="lg" className="sm:px-8">
                Create a Tenancy
              </ButtonLink>
              <ButtonLink
                href="/#how-it-works"
                variant="outline"
                size="lg"
                className="sm:px-8"
              >
                See How It Works
              </ButtonLink>
            </div>

            <ul className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line pt-6 text-[0.8125rem] text-muted">
              <li className="flex items-center gap-2">
                <span aria-hidden className="size-1.5 rounded-full bg-forest" />
                Neutral control
              </li>
              <li className="flex items-center gap-2">
                <span aria-hidden className="size-1.5 rounded-full bg-forest" />
                Clear evidence
              </li>
              <li className="flex items-center gap-2">
                <span aria-hidden className="size-1.5 rounded-full bg-forest" />
                Agreed settlement
              </li>
            </ul>
          </div>

          <TenancyPreviewCard />
        </div>
      </Container>
    </section>
  );
}
