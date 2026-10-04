import { ArrowRight, FilePlus2, ScrollText } from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/app/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { IdentityRow } from "@/components/tenancy/identity-row";
import { LifecycleTrack } from "@/components/tenancy/lifecycle-track";
import { TENANCIES, CURRENT_USER } from "@/data/tenancies";
import {
  formatCurrency,
  formatDateRange,
} from "@/lib/utils";

const activeTenancy = TENANCIES[0];

export default function OverviewPage() {
  const pending = TENANCIES.filter((t) => t.filterGroup === "pending").length;
  const protectedTotal = TENANCIES.reduce(
    (sum, tenancy) =>
      tenancy.filterGroup === "active" ? sum + tenancy.depositAmount : sum,
    0,
  );

  return (
    <Container className="space-y-10 py-10 sm:py-12">
      <PageHeader
        title={`Welcome back, ${CURRENT_USER.name.split(" ")[0]}.`}
        description="Your protected tenancies, the money behind them and what happens next."
        actions={
          <>
            <ButtonLink href="/app/tenancies">
              My Tenancies
              <ArrowRight aria-hidden className="size-4" strokeWidth={2} />
            </ButtonLink>
            <ButtonLink href="/app/create" variant="outline">
              <FilePlus2 aria-hidden className="size-4" strokeWidth={1.9} />
              Create Tenancy
            </ButtonLink>
          </>
        }
      />

      <section aria-label="Tenancy summary" className="grid gap-4 sm:grid-cols-3">
        {[
          {
            label: "Tenancies",
            value: String(TENANCIES.length),
            note: "Across Dublin",
          },
          {
            label: "Protected value",
            value: formatCurrency(protectedTotal),
            note: "Held in neutral records",
          },
          {
            label: "Awaiting funding",
            value: String(pending),
            note: "Move-in scheduled soon",
          },
        ].map((stat) => (
          <Card key={stat.label} className="bg-parchment">
            <p className="eyebrow text-subtle">{stat.label}</p>
            <p className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-ink tabular-nums">
              {stat.value}
            </p>
            <p className="mt-1 text-sm text-muted">{stat.note}</p>
          </Card>
        ))}
      </section>

      <section
        aria-labelledby="overview-active"
        className="overflow-hidden rounded-3xl border border-line bg-parchment"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft px-6 py-4 sm:px-7">
          <h2 id="overview-active" className="text-sm font-semibold text-ink">
            Current tenancy record
          </h2>
          <StatusBadge status={activeTenancy.status} />
        </div>

        <div className="grid gap-7 p-6 sm:p-7 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10">
          <div>
            <p className="eyebrow text-subtle">Property</p>
            <h3 className="mt-3 font-serif text-[1.75rem] leading-tight tracking-[-0.02em] text-ink">
              {activeTenancy.address}, {activeTenancy.locality}
            </h3>
            <p className="mt-2 text-sm text-muted">
              {activeTenancy.propertyType} · {activeTenancy.bedrooms} bed ·{" "}
              {activeTenancy.eircode}
            </p>

            <dl className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl bg-cream-raised p-4">
                <dt className="eyebrow text-subtle">Protected deposit</dt>
                <dd className="mt-2 text-xl font-semibold text-ink tabular-nums">
                  {formatCurrency(activeTenancy.depositAmount)}
                </dd>
              </div>
              <div className="rounded-xl bg-cream-raised p-4">
                <dt className="eyebrow text-subtle">Tenancy term</dt>
                <dd className="mt-2 text-[0.9375rem] font-medium text-ink">
                  {formatDateRange(
                    activeTenancy.startDate,
                    activeTenancy.endDate,
                  )}
                </dd>
              </div>
            </dl>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <IdentityRow party={activeTenancy.tenant} size="sm" showMeta={false} />
              </div>
              <div className="min-w-0 flex-1">
                <IdentityRow party={activeTenancy.landlord} size="sm" showMeta={false} />
              </div>
            </div>

            <Link
              href={`/app/tenancies/${activeTenancy.id}`}
              className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-forest hover:underline"
            >
              Open full record
              <ArrowRight aria-hidden className="size-4" strokeWidth={2} />
            </Link>
          </div>

          <div className="rounded-2xl border border-line bg-cream-raised p-5">
            <p className="eyebrow mb-5 text-subtle">Lifecycle</p>
            <LifecycleTrack stage={activeTenancy.lifecycleStage} showDescription={false} />
          </div>
        </div>
      </section>

      <section aria-labelledby="overview-next" className="grid gap-5 lg:grid-cols-2">
        <Card>
          <div className="flex items-center gap-3">
            <span aria-hidden className="grid size-9 place-items-center rounded-lg bg-cream text-forest">
              <ScrollText className="size-[18px]" strokeWidth={1.75} />
            </span>
            <h2 id="overview-next" className="text-base font-semibold text-ink">
              Recent activity
            </h2>
          </div>

          <ul className="mt-5 divide-y divide-line-soft">
            {activeTenancy.activity.slice(0, 3).map((event) => (
              <li key={event.id} className="flex items-start gap-3 py-3.5 first:pt-0">
                <span
                  aria-hidden
                  className="mt-1.5 size-1.5 shrink-0 rounded-full bg-moss"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{event.title}</p>
                  <p className="mt-0.5 text-xs text-muted">{event.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <span aria-hidden className="grid size-9 place-items-center rounded-lg bg-cream text-forest">
              <FilePlus2 className="size-[18px]" strokeWidth={1.75} />
            </span>
            <h2 className="text-base font-semibold text-ink">Quick actions</h2>
          </div>

          <div className="mt-5 grid gap-3">
            <Link
              href="/app/create"
              className="group flex items-center justify-between rounded-xl border border-line bg-cream-raised px-4 py-3.5 text-sm font-medium text-ink transition-colors hover:border-forest/35"
            >
              Create a new tenancy record
              <ArrowRight
                aria-hidden
                className="size-4 text-forest transition-transform group-hover:translate-x-1"
                strokeWidth={2}
              />
            </Link>
            <Link
              href="/app/tenancies"
              className="group flex items-center justify-between rounded-xl border border-line bg-cream-raised px-4 py-3.5 text-sm font-medium text-ink transition-colors hover:border-forest/35"
            >
              Review all tenancy records
              <ArrowRight
                aria-hidden
                className="size-4 text-forest transition-transform group-hover:translate-x-1"
                strokeWidth={2}
              />
            </Link>
            <Link
              href="/app/profile"
              className="group flex items-center justify-between rounded-xl border border-line bg-cream-raised px-4 py-3.5 text-sm font-medium text-ink transition-colors hover:border-forest/35"
            >
              Manage your profile
              <ArrowRight
                aria-hidden
                className="size-4 text-forest transition-transform group-hover:translate-x-1"
                strokeWidth={2}
              />
            </Link>
          </div>
        </Card>
      </section>
    </Container>
  );
}
