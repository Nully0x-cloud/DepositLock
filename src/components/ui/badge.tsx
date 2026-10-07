import type { ReactNode } from "react";
import { AlertTriangle, Archive, ClipboardCheck, Clock3, CircleX, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { tenancyStatusPresentation } from "@/lib/tenancy/status-presentation";

export type BadgeTone =
  | "protected"
  | "active"
  | "pending"
  | "closed"
  | "dispute"
  | "neutral"
  | "onDark";

const tones: Record<BadgeTone, string> = {
  protected: "bg-protected-soft text-protected",
  active: "bg-protected-soft text-protected",
  pending: "bg-pending-soft text-pending",
  closed: "bg-closed-soft text-closed",
  dispute: "bg-dispute-soft text-dispute",
  neutral: "bg-sand text-muted border border-line",
  onDark: "bg-cream/12 text-cream border border-cream/25",
};

const statusIcons = {
  shield: ShieldCheck,
  clock: Clock3,
  review: ClipboardCheck,
  alert: AlertTriangle,
  archive: Archive,
  cancel: CircleX,
};

type BadgeProps = {
  tone?: BadgeTone;
  className?: string;
  title?: string;
  children: ReactNode;
};

export function Badge({ tone = "neutral", className, title, children }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] leading-none",
        tones[tone],
        className,
      )}
      title={title}
    >
      {children}
    </span>
  );
}

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const presentation = tenancyStatusPresentation(status);
  const Icon = statusIcons[presentation.icon];
  return (
    <Badge tone={presentation.tone as BadgeTone} className={className} title={presentation.description}>
      <Icon aria-hidden className="size-3.5" strokeWidth={1.9} />
      {presentation.label}
    </Badge>
  );
}
