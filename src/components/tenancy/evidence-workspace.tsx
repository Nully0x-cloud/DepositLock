"use client";

import { Archive, Camera, ShieldCheck } from "lucide-react";
import { EvidenceComparison, EvidencePreview } from "@/components/tenancy/evidence-preview";
import { EvidenceUploader } from "@/components/tenancy/evidence-uploader";
import type { EvidenceItem, Tenancy } from "@/types/tenancy";

type EvidenceWorkspaceProps = {
  tenancy: Tenancy;
  viewerId: string | null;
  onRefresh(): void;
};

export function EvidenceWorkspace({ tenancy, viewerId, onRefresh }: EvidenceWorkspaceProps) {
  const role = viewerId === tenancy.landlord.id
    ? "landlord"
    : viewerId === tenancy.tenant.id
      ? "tenant"
      : null;
  const moveIn = tenancy.evidence.filter((item) => item.evidenceContext === "move_in");
  const moveOut = tenancy.evidence.filter((item) => item.evidenceContext !== "move_in");
  const moveInUploadAllowed = ["awaiting_deposit", "protected"].includes(tenancy.recordStatus);
  const moveOutUploadAllowed = ["move_out_review", "deduction_proposed", "settlement_pending"].includes(tenancy.recordStatus);
  const closed = tenancy.recordStatus === "closed";
  const disputed = tenancy.recordStatus === "disputed";

  return (
    <section id="evidence" aria-labelledby="evidence-heading" className="space-y-5 rounded-3xl border border-line bg-parchment p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow text-subtle">Shared condition record</p>
          <h2 id="evidence-heading" className="mt-1 text-lg font-semibold text-ink">Property evidence</h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
            Photos and captions are visible to both tenancy participants. Uploaded records are kept with their original timestamps.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-cream-raised px-3 py-1.5 text-xs font-medium text-muted">
          <ShieldCheck aria-hidden className="size-3.5 text-forest" /> Private tenancy files
        </span>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section aria-labelledby="move-in-evidence-heading" className="min-w-0 rounded-2xl border border-line-soft bg-cream-raised p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <Camera aria-hidden className="size-4 text-forest" />
            <h3 id="move-in-evidence-heading" className="text-sm font-semibold text-ink">Move-in condition</h3>
            <span className="ml-auto text-xs tabular-nums text-subtle">{moveIn.length} {moveIn.length === 1 ? "photo" : "photos"}</span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted">Record the property&apos;s starting condition by room and item.</p>
          <div className="mt-4">
            <EvidencePreview items={moveIn} emptyCopy="No move-in photos yet. Add a few now so both parties have a shared record of the property's starting condition." />
          </div>
          {role && moveInUploadAllowed ? (
            <EvidenceUploader tenancyId={tenancy.id} context="move_in" role={role} onUploaded={onRefresh} />
          ) : null}
        </section>

        <section aria-labelledby="move-out-evidence-heading" className="min-w-0 rounded-2xl border border-line-soft bg-cream-raised p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <Camera aria-hidden className="size-4 text-forest" />
            <h3 id="move-out-evidence-heading" className="text-sm font-semibold text-ink">Move-out condition</h3>
            <span className="ml-auto text-xs tabular-nums text-subtle">{moveOut.length} {moveOut.length === 1 ? "photo" : "photos"}</span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted">Compare current condition with the move-in record before discussing a deduction.</p>
          <div className="mt-4">
            <EvidencePreview
              items={moveOut}
              emptyCopy={disputed
                ? "The challenge is recorded. Existing evidence remains available below; no new settlement action can release the deposit."
                : "No move-out photos yet. Add relevant condition photos during move-out review."}
            />
          </div>
          {role && moveOutUploadAllowed ? (
            <EvidenceUploader tenancyId={tenancy.id} context="move_out" role={role} onUploaded={onRefresh} />
          ) : null}
          {disputed ? (
            <p className="mt-3 rounded-xl border border-dispute/20 bg-dispute-soft px-3 py-2 text-xs leading-relaxed text-dispute">
              The deposit remains locked while this dispute is unresolved. Evidence history cannot be edited or deleted.
            </p>
          ) : null}
        </section>
      </div>

      {moveIn.length > 0 && moveOut.length > 0 ? (
        <section aria-labelledby="evidence-comparison-heading" className="space-y-3">
          <div>
            <p className="eyebrow text-subtle">Condition by category</p>
            <h3 id="evidence-comparison-heading" className="mt-1 text-base font-semibold text-ink">Move-in and move-out comparison</h3>
          </div>
          <EvidenceComparison moveIn={moveIn} moveOut={moveOut} />
        </section>
      ) : null}

      {closed ? (
        <p className="flex items-start gap-2 rounded-xl border border-line bg-cream-raised px-3 py-3 text-xs leading-relaxed text-muted">
          <Archive aria-hidden className="mt-0.5 size-4 shrink-0 text-forest" />
          This tenancy is closed. Evidence is preserved as a read-only historical record.
        </p>
      ) : null}

      {role === null ? <p className="sr-only">Evidence uploads are available only to tenancy participants.</p> : null}
    </section>
  );
}

export function evidenceItemsForDeduction(items: EvidenceItem[]): EvidenceItem[] {
  return items.filter((item) => item.evidenceContext === "move_out" && item.deductionId === null);
}
