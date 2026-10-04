import { Camera } from "lucide-react";
import { PropertyImage } from "@/components/tenancy/property-image";
import { formatShortDate } from "@/lib/utils";
import type { EvidenceItem } from "@/types/tenancy";

type EvidencePreviewProps = {
  items: EvidenceItem[];
  limit?: number;
};

export function EvidencePreview({ items, limit = 3 }: EvidencePreviewProps) {
  const visible = items.slice(0, limit);

  if (visible.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line bg-cream-raised px-4 py-8 text-center text-sm text-muted">
        Move-in evidence has not been recorded yet.
      </p>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-3">
      {visible.map((item) => (
        <li key={item.id} className="overflow-hidden rounded-xl border border-line bg-cream-raised">
          <PropertyImage
            src={item.imageUrl}
            alt={`${item.room} — ${item.caption}`}
            sizes="(max-width: 640px) 100vw, 20vw"
            className="aspect-[4/3] w-full"
          />
          <div className="p-3">
            <p className="text-[0.8125rem] font-semibold text-ink">
              {item.room}
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
              <Camera aria-hidden className="size-3" strokeWidth={1.8} />
              {formatShortDate(item.capturedAt)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
