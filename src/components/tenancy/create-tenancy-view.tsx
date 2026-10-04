"use client";

import { Check, Info, Lock, UserRound, Wallet } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Container } from "@/components/layout/container";
import { Button, ButtonLink } from "@/components/ui/button";
import { useProfile } from "@/hooks/use-profile";
import { useWalletIdentity } from "@/hooks/use-wallet-identity";
import { explorerClusterLabel } from "@/lib/solana/explorer";
import { cn, initialsOf } from "@/lib/utils";

const STAGES = [
  {
    key: "property",
    label: "Property",
    summary: "Address, property type and photographs",
  },
  {
    key: "tenancy",
    label: "Tenancy",
    summary: "Dates, rent and deposit amount",
  },
  {
    key: "tenant",
    label: "Tenant",
    summary: "People, contact details and roles",
  },
  {
    key: "review",
    label: "Review",
    summary: "Confirm the terms and create the record",
  },
];

const PROPERTY_FIELDS = [
  { id: "property-address", label: "Property address", placeholder: "e.g. 18 Camden Street, Dublin 2" },
  { id: "property-eircode", label: "Eircode", placeholder: "e.g. D02 XY34" },
  { id: "property-type", label: "Property type", placeholder: "e.g. Period apartment" },
  { id: "property-bedrooms", label: "Bedrooms", placeholder: "e.g. 2" },
];

function PanelShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-3xl border px-5 py-5 sm:px-6 sm:py-6 lg:flex-row lg:items-center lg:justify-between lg:gap-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * The identity requirement block that sits ahead of the creation flow.
 * Three states: no wallet, wallet without profile, ready to create.
 */
function IdentityRequirement() {
  const { profile } = useProfile();
  const wallet = useWalletIdentity();

  if (!wallet.connected) {
    return (
      <PanelShell className="border-dashed border-line bg-cream-raised">
        <div className="flex items-start gap-4">
          <span
            aria-hidden
            className="grid size-11 shrink-0 place-items-center rounded-full bg-sand text-forest"
          >
            <Wallet className="size-5" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">
              Connect your wallet to continue
            </h2>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted">
              Your wallet verifies your identity and approves protected deposit
              transactions. Nothing is required to browse your tenancies.
            </p>
          </div>
        </div>
        <div className="shrink-0">
          <Button onClick={wallet.connect} disabled={wallet.connecting}>
            <Wallet aria-hidden className="size-4" strokeWidth={1.9} />
            {wallet.connecting ? "Connecting…" : "Connect Wallet"}
          </Button>
        </div>
      </PanelShell>
    );
  }

  if (!profile) {
    return (
      <PanelShell className="border-line bg-cream-raised">
        <div className="flex items-start gap-4">
          <span
            aria-hidden
            className="grid size-11 shrink-0 place-items-center rounded-full bg-sand text-forest"
          >
            <UserRound className="size-5" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">
              Complete your profile to continue
            </h2>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted">
              Your name is what appears on the tenancy record. It takes a
              moment and only needs to be done once.
            </p>
          </div>
        </div>
        <div className="shrink-0">
          <ButtonLink href="/app/profile">Complete Profile</ButtonLink>
        </div>
      </PanelShell>
    );
  }

  return (
    <PanelShell className="border-protected/30 bg-protected-soft">
      <div className="flex items-center gap-4">
        <span
          aria-hidden
          className="grid size-11 shrink-0 place-items-center rounded-full bg-forest text-sm font-semibold text-cream"
        >
          {initialsOf(profile.fullName)}
        </span>
        <div className="min-w-0">
          <p className="eyebrow text-moss">Creating as</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="text-base font-semibold text-ink">
              {profile.fullName}
            </span>
            <span className="font-mono text-[0.8125rem] text-muted">
              {wallet.shortAddress}
            </span>
          </p>
          <p className="mt-1 text-xs text-muted">
            {wallet.walletName} on {explorerClusterLabel()}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 rounded-full border border-protected/30 bg-cream px-3 py-2 text-xs font-medium text-protected">
        <Check aria-hidden className="size-3.5" strokeWidth={2.5} />
        Ready to create
      </div>
    </PanelShell>
  );
}

export function CreateTenancyView() {
  const activeIndex = 0;

  return (
    <Container className="space-y-8 py-10 sm:py-12">
      <PageHeader
        title="Create Tenancy"
        description="A four-step flow that turns a property, two people and a deposit into one protected record."
      />

      <IdentityRequirement />

      <section
        aria-label="Tenancy creation progress"
        className="overflow-hidden rounded-3xl border border-line bg-parchment"
      >
        <ol className="grid gap-px border-b border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {STAGES.map((stage, index) => {
            const isComplete = index < activeIndex;
            const isActive = index === activeIndex;

            return (
              <li
                key={stage.key}
                aria-current={isActive ? "step" : undefined}
                className="flex items-start gap-3 bg-parchment px-5 py-5"
              >
                <span
                  aria-hidden
                  className={
                    isComplete
                      ? "grid size-7 shrink-0 place-items-center rounded-full bg-forest text-cream"
                      : isActive
                        ? "grid size-7 shrink-0 place-items-center rounded-full bg-forest text-[0.75rem] font-semibold text-cream"
                        : "grid size-7 shrink-0 place-items-center rounded-full border border-line bg-cream text-[0.75rem] font-semibold text-subtle"
                  }
                >
                  {isComplete ? (
                    <Check className="size-3.5" strokeWidth={3} />
                  ) : (
                    index + 1
                  )}
                </span>
                <span className="min-w-0">
                  <span
                    className={
                      isActive || isComplete
                        ? "block text-sm font-semibold text-ink"
                        : "block text-sm font-medium text-subtle"
                    }
                  >
                    {stage.label}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                    {stage.summary}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>

        <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12">
          <div>
            <p className="eyebrow text-moss">Step 1 of 4</p>
            <h2 className="mt-3 font-serif text-[1.75rem] leading-tight tracking-[-0.02em] text-ink">
              Property
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Start with where the tenancy lives. These fields are shown for
              structure only — persistence and validation arrive in a later
              phase.
            </p>

            <div className="mt-7 grid gap-4 sm:grid-cols-2">
              {PROPERTY_FIELDS.map((field, index) => (
                <div
                  key={field.id}
                  className={index === 0 ? "sm:col-span-2" : undefined}
                >
                  <label
                    htmlFor={field.id}
                    className="block text-xs font-semibold uppercase tracking-[0.1em] text-subtle"
                  >
                    {field.label}
                  </label>
                  <input
                    id={field.id}
                    type="text"
                    placeholder={field.placeholder}
                    disabled
                    className="mt-2 h-11 w-full rounded-xl border border-line bg-cream-raised px-3.5 text-sm text-ink placeholder:text-subtle/80 disabled:cursor-not-allowed disabled:opacity-70"
                  />
                </div>
              ))}
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-line pt-6">
              <Button disabled aria-disabled="true">
                Continue
                <Lock aria-hidden className="size-3.5" strokeWidth={2} />
              </Button>
              <ButtonLink href="/app/tenancies" variant="ghost">
                Cancel
              </ButtonLink>
            </div>
          </div>

          <aside className="rounded-2xl border border-line bg-cream-raised p-6">
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className="grid size-9 shrink-0 place-items-center rounded-lg bg-sand text-moss"
              >
                <Info className="size-[18px]" strokeWidth={1.85} />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-ink">
                  Creation shell only
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                  Submission, validation and persistence are intentionally not
                  wired up yet. Tenancy creation lands alongside the data layer
                  in a later phase.
                </p>
              </div>
            </div>

            <ul className="mt-6 space-y-3 border-t border-line pt-5">
              {STAGES.map((stage, index) => (
                <li key={stage.key} className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="mt-1 size-1.5 shrink-0 rounded-full bg-line"
                  />
                  <span
                    className={
                      index === activeIndex
                        ? "text-sm font-medium text-ink"
                        : "text-sm text-muted"
                    }
                  >
                    {stage.label}
                    <span className="block text-xs text-subtle">
                      {stage.summary}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </section>
    </Container>
  );
}
