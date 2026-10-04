import type { Metadata } from "next";
import { Info, Lock, Wallet } from "lucide-react";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CURRENT_USER } from "@/data/tenancies";
import { initialsOf } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Profile",
};

const IDENTITY_FIELDS = [
  { id: "profile-name", label: "Full name", value: CURRENT_USER.name },
  { id: "profile-email", label: "Email address", value: CURRENT_USER.email },
  { id: "profile-phone", label: "Phone", value: "+353 87 000 0000" },
  { id: "profile-address", label: "Home address", value: "18 Camden Street, Dublin 2" },
];

export default function ProfilePage() {
  return (
    <Container className="space-y-8 py-10 sm:py-12">
      <PageHeader
        title="Profile"
        description="Your identity as it appears on every tenancy record you take part in."
      />

      <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <Card padding="lg">
          <div className="flex items-center gap-4 border-b border-line-soft pb-6">
            <span
              aria-hidden
              className="grid size-14 shrink-0 place-items-center rounded-full bg-forest text-lg font-semibold text-cream"
            >
              {initialsOf(CURRENT_USER.name)}
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-ink">
                {CURRENT_USER.name}
              </h2>
              <p className="text-sm text-muted">{CURRENT_USER.email}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge tone="neutral">{CURRENT_USER.role}</Badge>
                <Badge tone="protected">Verified record</Badge>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {IDENTITY_FIELDS.map((field) => (
              <div key={field.id} className={field.id === "profile-address" ? "sm:col-span-2" : undefined}>
                <label
                  htmlFor={field.id}
                  className="block text-xs font-semibold uppercase tracking-[0.1em] text-subtle"
                >
                  {field.label}
                </label>
                <input
                  id={field.id}
                  type="text"
                  defaultValue={field.value}
                  disabled
                  className="mt-2 h-11 w-full rounded-xl border border-line bg-cream-raised px-3.5 text-sm text-ink disabled:cursor-not-allowed disabled:opacity-75"
                />
              </div>
            ))}
          </div>

          <p className="mt-6 flex items-start gap-2 border-t border-line-soft pt-5 text-xs leading-relaxed text-muted">
            <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            Editing is disabled in Phase 1. Profile writes arrive with the data
            layer.
          </p>
        </Card>

        <div className="space-y-5">
          <Card padding="lg">
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="grid size-9 place-items-center rounded-lg bg-cream text-forest"
              >
                <Wallet className="size-[18px]" strokeWidth={1.75} />
              </span>
              <div>
                <h2 className="text-base font-semibold text-ink">Wallet</h2>
                <p className="text-xs text-muted">Not connected</p>
              </div>
              <span
                aria-hidden
                className="ml-auto size-2 rounded-full bg-pending"
              />
            </div>

            <p className="mt-5 text-sm leading-relaxed text-muted">
              A wallet will be linked to this profile when on-chain tenancy
              records go live. Nothing is required to browse your records.
            </p>

            <button
              type="button"
              disabled
              aria-disabled="true"
              className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-line bg-cream-raised text-sm font-medium text-subtle disabled:cursor-not-allowed"
            >
              <Lock aria-hidden className="size-4" strokeWidth={2} />
              Connect wallet
            </button>
            <p className="mt-3 text-center text-xs text-subtle">
              Available in a later phase
            </p>
          </Card>

          <Card padding="lg">
            <h2 className="text-base font-semibold text-ink">Record history</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted">Member since</dt>
                <dd className="font-medium text-ink">November 2025</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted">Tenancies</dt>
                <dd className="font-medium text-ink">3</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted">Disputes</dt>
                <dd className="font-medium text-ink">None</dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </Container>
  );
}
