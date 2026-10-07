"use client";

import { ArrowRight, FilePlus2, Inbox, RefreshCw, ScrollText, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/app/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/badge";
import { IdentityRow } from "@/components/tenancy/identity-row";
import { LifecycleTrack } from "@/components/tenancy/lifecycle-track";
import { SignInPrompt } from "@/components/wallet/sign-in-prompt";
import { useTenancies } from "@/hooks/use-tenancies";
import { formatCurrency, formatDateRange } from "@/lib/utils";
import { useProfileContext } from "@/providers/profile-provider";
import type { Tenancy } from "@/types/tenancy";

function OverviewSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-10 py-10 sm:py-12">
      <p className="text-sm text-muted">Loading your overview…</p>
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((slot) => (
          <div
            key={slot}
            className="animate-pulse rounded-3xl border border-line bg-parchment p-6"
          >
            <div className="h-4 w-24 rounded bg-sand" />
            <div className="mt-4 h-8 w-32 rounded bg-sand" />
            <div className="mt-3 h-4 w-40 rounded bg-sand" />
          </div>
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-3xl border border-line bg-parchment" />
    </div>
  );
}

function primaryTenancy(tenancies: Tenancy[]): Tenancy | null {
  return (
    tenancies.find((tenancy) => tenancy.lifecycleStage === "active") ??
    tenancies[0] ??
    null
  );
}

/**
 * The authenticated overview (§28 home). Rows come from Supabase behind RLS
 * through `useTenancies`, so everything here is what *this* wallet may see.
 */
export function OverviewView() {
  const result = useTenancies();
  const { profile } = useProfileContext();

  const firstName =
    profile?.fullName?.trim().split(/\s+/)[0] ?? null;
  const title = firstName ? `Welcome back, ${firstName}.` : "Welcome back.";

  if (result.status === "loading") {
    return (
      <Container>
        <OverviewSkeleton />
      </Container>
    );
  }

  if (result.status === "unauthenticated") {
    return (
      <Container className="py-10 sm:py-12">
        <SignInPrompt
          title="Your DepositLock overview"
          description="Sign in with your wallet to see your tenancies, protected deposits and what happens next."
        />
      </Container>
    );
  }

  if (result.status === "error") {
    return (
      <Container className="py-10 sm:py-12">
        <EmptyState
          icon={TriangleAlert}
          title="We couldn't load your overview"
          description={result.message}
          action={
            <Button variant="outline" onClick={result.retry}>
              <RefreshCw aria-hidden className="size-4" strokeWidth={1.9} />
              Try again
            </Button>
          }
        />
      </Container>
    );
  }

  const { tenancies } = result;
  const pending = tenancies.filter((t) => t.filterGroup === "pending").length;
  const protectedTotal = tenancies.reduce(
    (sum, tenancy) =>
      tenancy.filterGroup === "active" ? sum + tenancy.depositAmount : sum,
    0,
  );
  const active = primaryTenancy(tenancies);

  return (
    <Container className="space-y-10 py-10 sm:py-12">
      <PageHeader
        title={title}
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
            value: String(tenancies.length),
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

      {active ? (
        <section
          aria-labelledby="overview-active"
          className="overflow-hidden rounded-3xl border border-line bg-parchment"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft px-6 py-4 sm:px-7">
            <h2 id="overview-active" className="text-sm font-semibold text-ink">
              Current tenancy record
            </h2>
            <StatusBadge status={active.recordStatus} />
          </div>

          <div className="grid gap-7 p-6 sm:p-7 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10">
            <div>
              <p className="eyebrow text-subtle">Property</p>
              <h3 className="mt-3 font-serif text-[1.75rem] leading-tight tracking-[-0.02em] text-ink">
                {active.address}, {active.locality}
              </h3>
              <p className="mt-2 text-sm text-muted">
                {active.propertyType} · {active.bedrooms} bed · {active.eircode}
              </p>

              <dl className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl bg-cream-raised p-4">
                  <dt className="eyebrow text-subtle">Protected deposit</dt>
                  <dd className="mt-2 text-xl font-semibold text-ink tabular-nums">
                    {formatCurrency(active.depositAmount)}
                  </dd>
                </div>
                <div className="rounded-xl bg-cream-raised p-4">
                  <dt className="eyebrow text-subtle">Tenancy term</dt>
                  <dd className="mt-2 text-[0.9375rem] font-medium text-ink">
                    {formatDateRange(active.startDate, active.endDate)}
                  </dd>
                </div>
              </dl>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <IdentityRow party={active.tenant} size="sm" showMeta={false} />
                </div>
                <div className="min-w-0 flex-1">
                  <IdentityRow party={active.landlord} size="sm" showMeta={false} />
                </div>
              </div>

              <Link
                href={`/app/tenancies/${active.id}`}
                className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-forest hover:underline"
              >
                Open full record
                <ArrowRight aria-hidden className="size-4" strokeWidth={2} />
              </Link>
            </div>

            <div className="rounded-2xl border border-line bg-cream-raised p-5">
              <p className="eyebrow mb-5 text-subtle">Lifecycle</p>
              <LifecycleTrack
                stage={active.lifecycleStage}
                showDescription={false}
              />
            </div>
          </div>
        </section>
      ) : (
        <EmptyState
          icon={Inbox}
          title="No tenancies yet"
          description="Create your first tenancy record — or accept an invitation — and it will show up here."
          action={
            <ButtonLink href="/app/create">
              <FilePlus2 aria-hidden className="size-4" strokeWidth={1.9} />
              Create Tenancy
            </ButtonLink>
          }
        />
      )}

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

          {active && active.activity.length > 0 ? (
            <ul className="mt-5 divide-y divide-line-soft">
              {active.activity.slice(0, 3).map((event) => (
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
          ) : (
            <p className="mt-5 text-sm text-muted">
              Activity on your current tenancy — invitations, deposits, evidence
              and settlements — will appear here as it happens.
            </p>
          )}
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
