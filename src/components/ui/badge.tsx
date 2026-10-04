import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { TenancyStatus } from "@/types/tenancy";

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

const statusTone: Record<TenancyStatus, BadgeTone> = {
  protected: "protected",
  active: "active",
  pending: "pending",
  closed: "closed",
};

const statusLabel: Record<TenancyStatus, string> = {
  protected: "Protected",
  active: "Active",
  pending: "Pending",
  closed: "Closed",
};

type BadgeProps = {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
};

export function Badge({ tone = "neutral", className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] leading-none",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({
  status,
  className,
}: {
  status: TenancyStatus;
  className?: string;
}) {
  return (
    <Badge tone={statusTone[status]} className={className}>
      <StatusDot status={status} />
      {statusLabel[status]}
    </Badge>
  );
}

export function StatusDot({ status }: { status: TenancyStatus }) {
  const color =
    status === "protected" || status === "active"
      ? "bg-protected"
      : status === "pending"
        ? "bg-pending"
        : "bg-closed";

  return (
    <span aria-hidden className={cn("size-1.5 rounded-full", color)} />
  );
}
