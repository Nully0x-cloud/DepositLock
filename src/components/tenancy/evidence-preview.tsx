import { useState } from "react";
import { Camera, ImageOff } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { EvidenceItem } from "@/types/tenancy";

type EvidencePreviewProps = {
  items: EvidenceItem[];
  emptyCopy?: string;
  compact?: boolean;
  onRefresh?(): void;
};

function EvidencePhoto({ item, onRefresh }: { item: EvidenceItem; onRefresh?: () => void }) {
  const [failed, setFailed] = useState(false);

  if (item.imageUrl && !failed) {
    return (
      <>
        {/* Private signed URLs are rendered directly to avoid shared optimizer caches. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.imageUrl}
          alt={`${item.room}: ${item.caption}`}
          loading="lazy"
          decoding="async"
          className="size-full object-contain"
          onError={() => setFailed(true)}
        />
        <a href={item.imageUrl} target="_blank" rel="noreferrer" className="absolute bottom-2 right-2 rounded-full border border-line bg-parchment/95 px-3 py-2 text-xs font-semibold text-forest shadow-sm hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest" aria-label={`Open original image: ${item.room}, ${item.caption}`}>
          Open image
        </a>
      </>
    );
  }

  return (
    <div role="img" aria-label={`Image preview unavailable: ${item.room}`} className="absolute inset-0 grid place-items-center bg-sand text-subtle">
      <div className="grid justify-items-center gap-2 text-xs">
        <ImageOff aria-hidden className="size-6" />
        Preview unavailable
        {onRefresh ? <button type="button" onClick={onRefresh} className="min-h-10 font-semibold text-forest underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-forest">Refresh preview</button> : null}
      </div>
    </div>
  );
}

export function EvidencePreview({
  items,
  emptyCopy = "No evidence added yet. Add photos so both parties can refer to the same condition record.",
  compact = false,
  onRefresh,
}: EvidencePreviewProps) {
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line bg-cream-raised px-4 py-6 text-center text-sm leading-relaxed text-muted">
        {emptyCopy}
      </p>
    );
  }

  return (
    <ul className={`grid gap-3 ${compact ? "sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-3"}`}>
      {items.map((item) => (
        <li key={item.id} className="overflow-hidden rounded-xl border border-line bg-cream-raised">
          <div className="relative aspect-[4/3] bg-sand">
            <EvidencePhoto key={`${item.id}:${item.imageUrl}`} item={item} onRefresh={onRefresh} />
          </div>
          <div className="p-3.5">
            <p className="text-sm font-semibold text-ink">{item.room}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{item.caption}</p>
            <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-subtle">
              <Camera aria-hidden className="size-3.5" strokeWidth={1.8} />
              <time dateTime={item.capturedAt}>{formatDate(item.capturedAt)}</time>
              <span aria-hidden>·</span>
              <span>{item.capturedBy}</span>
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function EvidenceComparison({
  moveIn,
  moveOut,
  onRefresh,
}: {
  moveIn: EvidenceItem[];
  moveOut: EvidenceItem[];
  onRefresh?(): void;
}) {
  const categories = [...new Set([...moveIn, ...moveOut].map((item) => item.category))]
    .sort((a, b) => a.localeCompare(b));
  if (categories.length === 0) return null;

  return (
    <div className="space-y-5">
      {categories.map((category) => {
        const left = moveIn.filter((item) => item.category === category);
        const right = moveOut.filter((item) => item.category === category);
        return (
          <section key={category} aria-label={`${left[0]?.room ?? right[0]?.room ?? "Other"} condition comparison`} className="rounded-2xl border border-line bg-parchment p-4 sm:p-5">
            <h3 className="text-sm font-semibold text-ink">{left[0]?.room ?? right[0]?.room ?? "Other"}</h3>
            <div className="mt-3 grid gap-4 lg:grid-cols-2">
              <div className="min-w-0">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-subtle">Move-in condition</p>
                <EvidencePreview items={left} compact emptyCopy="No move-in photos in this category." onRefresh={onRefresh} />
              </div>
              <div className="min-w-0">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-subtle">Move-out condition</p>
                <EvidencePreview items={right} compact emptyCopy="No move-out photos in this category." onRefresh={onRefresh} />
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
