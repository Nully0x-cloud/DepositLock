"use client";

import { ArrowLeft, Clock3, RefreshCw, TriangleAlert, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { DepositFundingPanel } from "@/components/tenancy/deposit-funding-panel";
import { DepositStatusBlock } from "@/components/tenancy/deposit-status-block";
import { SettlementWorkflowPanel } from "@/components/tenancy/settlement-workflow-panel";
import { EvidenceWorkspace } from "@/components/tenancy/evidence-workspace";
import { IdentityRow } from "@/components/tenancy/identity-row";
import { InvitationPanel } from "@/components/tenancy/invitation-panel";
import { LifecycleTrack } from "@/components/tenancy/lifecycle-track";
import { PropertyImage } from "@/components/tenancy/property-image";
import { SignInPrompt } from "@/components/wallet/sign-in-prompt";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useTenancyRecord } from "@/hooks/use-tenancy-record";
import { explorerTransactionUrl } from "@/lib/solana/explorer";
import { SOLANA_CLUSTER } from "@/lib/solana/config";
import {
  cn,
  formatCurrency,
  formatDate,
  formatDateRange,
} from "@/lib/utils";
import type { ActivityKind } from "@/types/tenancy";

const activityDot: Record<ActivityKind, string> = {
  deposit: "bg-forest",
  evidence: "bg-moss",
  agreement: "bg-sage",
  deduction: "bg-pending",
  settlement: "bg-protected",
  system: "bg-line",
};

function ActivityList({
  items,
}: {
  items: {
    id: string;
    title: string;
    detail: string;
    timestamp: string;
    actor: string;
    kind: ActivityKind;
    blockchainReference: string | null;
  }[];
}) {
  if (items.length === 0) {
    return (
      <p className="mt-5 rounded-xl border border-dashed border-line bg-cream-raised px-4 py-4 text-xs leading-relaxed text-muted">
        No activity recorded yet. Events appear here as the tenancy moves
        through its lifecycle.
      </p>
    );
  }

  const groups = new Map<string, typeof items>();
  for (const event of items) {
    const date = new Date(event.timestamp);
    const group = Number.isNaN(date.getTime())
      ? "Earlier activity"
      : date.toLocaleDateString("en-IE", { month: "long", year: "numeric" });
    const current = groups.get(group) ?? [];
    current.push(event);
    groups.set(group, current);
  }

  return (
    <ol aria-label="Tenancy activity timeline" className="mt-5 space-y-6">
      {[...groups].map(([group, events]) => (
        <li key={group}>
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.12em] text-subtle">{group}</h3>
          <ol className="space-y-0">
            {events.map((event, index) => (
              <li key={event.id} className="relative flex gap-4 pb-5 last:pb-0">
                {index < events.length - 1 ? (
                  <span aria-hidden className="absolute left-[5px] top-4 h-[calc(100%-0.5rem)] w-px bg-line-soft" />
                ) : null}
                <span aria-hidden className={cn("relative z-10 mt-1.5 size-2.5 shrink-0 rounded-full ring-4 ring-parchment", activityDot[event.kind])} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <p className="text-sm font-semibold text-ink">{event.title}</p>
                    <time dateTime={event.timestamp} className="text-xs text-subtle tabular-nums">{formatDate(event.timestamp)}</time>
                  </div>
                  {event.detail ? <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">{event.detail}</p> : null}
                  <p className="mt-1.5 text-xs text-subtle">{event.actor}</p>
                  {event.blockchainReference ? (
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-[0.6875rem] font-medium text-moss">Verified on Solana</span>
                      <a href={explorerTransactionUrl(event.blockchainReference, SOLANA_CLUSTER)} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center text-xs font-semibold text-forest underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-forest">
                        View transaction
                      </a>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </li>
      ))}
    </ol>
  );
}

function RecordSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-6 animate-pulse">
      <div className="h-4 w-28 rounded bg-sand" />
      <div className="space-y-3">
        <div className="h-10 w-2/3 rounded bg-sand" />
        <div className="h-4 w-1/2 rounded bg-sand" />
      </div>
      <div className="aspect-[16/8] w-full rounded-3xl bg-sand" />
      <div className="h-40 rounded-3xl bg-cream-raised" />
      <div className="h-56 rounded-3xl bg-cream-raised" />
      <p className="sr-only">Loading tenancy record…</p>
    </div>
  );
}

/**
 * The full tenancy record, assembled from Supabase under RLS (§28).
 *
 * Renders loading / sign-in / unavailable / error states explicitly — an
 * invisible record is reported as "not available to you" without confirming
 * whether it exists (§29).
 */
export function TenancyRecord({ id }: { id: string }) {
  const result = useTenancyRecord(id);
  const { userId } = useRequireAuth();

  const tenancy = result.status === "ready" ? result.tenancy : null;

  useEffect(() => {
    if (!tenancy) return;
    document.title = `${tenancy.address}, ${tenancy.locality} · DepositLock`;
  }, [tenancy]);

  if (result.status === "loading") return <RecordSkeleton />;

  if (result.status === "unauthenticated") {
    return (
      <SignInPrompt
        title="This record belongs to a verified wallet"
        description="Sign in with your wallet to open a tenancy record. No funds will move."
      />
    );
  }

  if (result.status === "unavailable") {
    return (
      <div className="space-y-6">
        <BackLink />
        <EmptyState
          icon={ShieldCheck}
          title="This tenancy isn't available to you"
          description="Either the record no longer exists, or it isn't shared with your verified wallet."
        />
      </div>
    );
  }

  if (result.status === "error") {
    return (
      <div className="space-y-6">
        <BackLink />
        <EmptyState
          icon={TriangleAlert}
          title="We couldn't load this record"
          description={result.message}
          action={
            <Button variant="outline" onClick={result.retry}>
              <RefreshCw aria-hidden className="size-4" strokeWidth={1.9} />
              Try again
            </Button>
          }
        />
      </div>
    );
  }

  if (!tenancy) return <RecordSkeleton />;

  const bedroomLine = tenancy.bedrooms > 0 ? `${tenancy.bedrooms} bed` : null;

  return (
    <div className="space-y-6">
      <BackLink />

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="eyebrow text-subtle">Tenancy record</p>
          <h1 className="mt-3 font-serif text-[2rem] leading-[1.1] tracking-[-0.02em] text-ink sm:text-[2.625rem]">
            {tenancy.address}
          </h1>
          <p className="mt-2 text-base text-muted">
            {[
              tenancy.locality,
              tenancy.eircode,
              tenancy.propertyType,
              bedroomLine,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
         <StatusBadge status={tenancy.recordStatus} className="shrink-0 self-start" />
      </header>

      <PropertyImage
        src={tenancy.imageUrl}
        alt={tenancy.imageAlt}
        sizes="(max-width: 1024px) 100vw, 1100px"
        className="aspect-[16/8] w-full rounded-3xl border border-line sm:aspect-[16/7]"
      />

      <DepositStatusBlock
        amount={tenancy.depositAmount}
        status={tenancy.recordStatus}
        settlementToken={tenancy.settlementToken}
        fundedAt={tenancy.fundedAt}
      />

      {tenancy.recordStatus === "awaiting_deposit" && userId ? (
        <DepositFundingPanel
          tenancy={tenancy}
          viewerId={userId}
          onReconciled={
            result.status === "ready" ? result.refresh : () => undefined
          }
        />
      ) : null}

      <section aria-label="Tenancy parties" className="overflow-hidden rounded-3xl border border-line bg-parchment">
        <div className="grid divide-y divide-line sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <div className="flex flex-col items-center px-6 py-8 text-center">
            <p className="eyebrow text-subtle">Tenant</p>
            <IdentityRow
              party={tenancy.tenant}
              align="center"
              className="mt-4"
            />
          </div>
          <div className="flex flex-col items-center px-6 py-8 text-center">
            <p className="eyebrow text-subtle">Landlord</p>
            <IdentityRow
              party={tenancy.landlord}
              align="center"
              className="mt-4"
            />
          </div>
        </div>

        <dl className="grid gap-px border-t border-line bg-line sm:grid-cols-3">
          {[
            {
              label: "Tenancy term",
              value: formatDateRange(tenancy.startDate, tenancy.endDate),
            },
            { label: "Monthly rent", value: formatCurrency(tenancy.rentMonthly) },
            {
              label: "Deposit funded",
              value: tenancy.fundedAt ? formatDate(tenancy.fundedAt) : "Awaiting funding",
            },
          ].map((item) => (
            <div key={item.label} className="bg-parchment px-6 py-5">
              <dt className="eyebrow text-subtle">{item.label}</dt>
              <dd className="mt-2 text-[0.9375rem] font-medium text-ink">
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {userId &&
      tenancy.landlord.id === userId &&
      (tenancy.recordStatus === "awaiting_tenant" ||
        tenancy.recordStatus === "draft") ? (
        <InvitationPanel tenancyId={tenancy.id} />
      ) : null}

      <Card padding="lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow text-subtle">Lifecycle</p>
            <h2 className="mt-2 text-base font-semibold text-ink">
              Where this tenancy stands
            </h2>
          </div>
          <Badge tone="neutral">
            Stage {["agreement", "protected", "move-in", "active", "move-out", "released"].indexOf(tenancy.lifecycleStage) + 1} of 6
          </Badge>
        </div>
        <div className="mt-7 rounded-2xl border border-line-soft bg-cream-raised p-6">
          <LifecycleTrack stage={tenancy.lifecycleStage} />
        </div>
      </Card>

      <Card padding="lg">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="eyebrow text-subtle">Activity</p>
            <h2 className="mt-2 text-base font-semibold text-ink">
              Recent activity
            </h2>
          </div>
          <Clock3 aria-hidden className="size-4 text-subtle" strokeWidth={1.8} />
        </div>
        <ActivityList items={tenancy.activity} />
      </Card>

      <EvidenceWorkspace
        tenancy={tenancy}
        viewerId={userId}
        onRefresh={result.status === "ready" ? result.refresh : () => undefined}
      />

      {userId ? (
        <SettlementWorkflowPanel
          tenancy={tenancy}
          viewerId={userId}
          onRefresh={result.status === "ready" ? result.refresh : () => undefined}
        />
      ) : null}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/app/tenancies"
      className="inline-flex items-center gap-2 text-sm font-medium text-muted transition-colors hover:text-ink"
    >
      <ArrowLeft aria-hidden className="size-4" strokeWidth={2} />
      My Tenancies
    </Link>
  );
}
