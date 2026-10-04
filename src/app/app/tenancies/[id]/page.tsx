import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Clock3, ReceiptText } from "lucide-react";
import { Container } from "@/components/layout/container";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { DepositStatusBlock } from "@/components/tenancy/deposit-status-block";
import { EvidencePreview } from "@/components/tenancy/evidence-preview";
import { IdentityRow } from "@/components/tenancy/identity-row";
import { LifecycleTrack } from "@/components/tenancy/lifecycle-track";
import { PropertyImage } from "@/components/tenancy/property-image";
import { TENANCIES, getTenancyById } from "@/data/tenancies";
import {
  cn,
  formatCurrency,
  formatDate,
  formatDateRange,
} from "@/lib/utils";
import type { ActivityKind } from "@/types/tenancy";

type Params = { params: Promise<{ id: string }> };

export function generateStaticParams() {
  return TENANCIES.map((tenancy) => ({ id: tenancy.id }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const tenancy = getTenancyById(id);

  if (!tenancy) return { title: "Tenancy not found" };

  return {
    title: `${tenancy.address}, ${tenancy.locality}`,
    description: `Protected tenancy record for ${tenancy.address}, ${tenancy.locality}.`,
  };
}

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
  }[];
}) {
  return (
    <ol className="mt-5 space-y-0">
      {items.map((event, index) => (
        <li key={event.id} className="relative flex gap-4 pb-5 last:pb-0">
          {index < items.length - 1 ? (
            <span
              aria-hidden
              className="absolute left-[5px] top-4 h-[calc(100%-0.5rem)] w-px bg-line-soft"
            />
          ) : null}
          <span
            aria-hidden
            className={cn(
              "relative z-10 mt-1.5 size-2.5 shrink-0 rounded-full ring-4 ring-parchment",
              activityDot[event.kind],
            )}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="text-sm font-semibold text-ink">{event.title}</p>
              <time
                dateTime={event.timestamp}
                className="text-xs text-subtle tabular-nums"
              >
                {formatDate(event.timestamp)}
              </time>
            </div>
            <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">
              {event.detail}
            </p>
            <p className="mt-1.5 text-xs text-subtle">{event.actor}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default async function TenancyRecordPage({ params }: Params) {
  const { id } = await params;
  const tenancy = getTenancyById(id);

  if (!tenancy) notFound();

  return (
    <Container className="space-y-6 py-8 sm:py-10">
      <Link
        href="/app/tenancies"
        className="inline-flex items-center gap-2 text-sm font-medium text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" strokeWidth={2} />
        My Tenancies
      </Link>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="eyebrow text-subtle">Tenancy record</p>
          <h1 className="mt-3 font-serif text-[2rem] leading-[1.1] tracking-[-0.02em] text-ink sm:text-[2.625rem]">
            {tenancy.address}
          </h1>
          <p className="mt-2 text-base text-muted">
            {tenancy.locality} · {tenancy.eircode} · {tenancy.propertyType} ·{" "}
            {tenancy.bedrooms} bed
          </p>
        </div>
        <StatusBadge status={tenancy.status} className="shrink-0 self-start" />
      </header>

      <PropertyImage
        src={tenancy.imageUrl}
        alt={tenancy.imageAlt}
        sizes="(max-width: 1024px) 100vw, 1100px"
        className="aspect-[16/8] w-full rounded-3xl border border-line sm:aspect-[16/7]"
      />

      <DepositStatusBlock
        amount={tenancy.depositAmount}
        status={tenancy.status}
        fundedAt={tenancy.fundedAt}
      />

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

      <div className="grid gap-5 lg:grid-cols-2">
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

        <Card padding="lg">
          <div>
            <p className="eyebrow text-subtle">Evidence</p>
            <h2 className="mt-2 text-base font-semibold text-ink">
              Move-in evidence
            </h2>
            <p className="mt-1.5 text-sm text-muted">
              Recorded at handover and attached to this record.
            </p>
          </div>
          <div className="mt-5">
            <EvidencePreview items={tenancy.evidence} />
          </div>
          {tenancy.evidence.length > 0 ? (
            <p className="mt-4 text-xs text-subtle">
              {tenancy.evidence.length} of 14 items shown · captured by{" "}
              {tenancy.evidence[0]?.capturedBy}
            </p>
          ) : null}
        </Card>
      </div>

      <Card padding="lg" className="border-dashed bg-cream-raised">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow text-subtle">Deductions</p>
            <h2 className="mt-2 text-base font-semibold text-ink">
              Proposed deductions
            </h2>
          </div>
          <Badge tone="pending">Move-out review not started</Badge>
        </div>

        <EmptyState
          icon={ReceiptText}
          title="No deductions on this record"
          description="Nothing has been proposed against this deposit. At move-out, any deduction will appear here with its supporting evidence and the other party’s response."
          className="mt-5 bg-transparent"
        />
      </Card>
    </Container>
  );
}
