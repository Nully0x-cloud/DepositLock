import type { NotificationRecord } from "@/lib/db/models";

const TENANCY_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FALLBACK_TITLES: Record<string, string> = {
  tenant_invited: "You have a tenancy invitation",
  tenant_invitation_accepted: "Tenancy invitation accepted",
  tenant_invitation_declined: "Tenancy invitation declined",
  deposit_ready_to_fund: "Deposit ready to fund",
  deposit_protected: "Deposit protected",
  evidence_added: "New tenancy evidence added",
  move_out_review_started: "Move-out review started",
  full_return_proposed: "Full deposit return proposed",
  deduction_proposed: "Deduction proposed",
  settlement_proposal_withdrawn: "Settlement proposal withdrawn",
  settlement_approved: "Settlement approved",
  deduction_challenged: "Deduction challenged",
  settlement_completed: "Settlement completed",
  tenancy_closed: "Tenancy closed",
  system: "Tenancy updated",
};

const ANCHORS: Record<string, string> = {
  deposit_ready_to_fund: "deposit",
  deposit_protected: "deposit",
  evidence_added: "evidence",
  move_out_review_started: "evidence",
  full_return_proposed: "settlement",
  deduction_proposed: "settlement",
  settlement_proposal_withdrawn: "settlement",
  settlement_approved: "settlement",
  deduction_challenged: "settlement",
  settlement_completed: "settlement",
  tenancy_closed: "settlement",
};

export function notificationTitle(notification: NotificationRecord): string {
  return FALLBACK_TITLES[notification.type] ?? notification.title;
}

export function notificationHref(notification: NotificationRecord): string {
  if (!notification.tenancyId || !TENANCY_UUID.test(notification.tenancyId)) return "/app/tenancies";
  const base = `/app/tenancies/${encodeURIComponent(notification.tenancyId)}`;
  const anchor = ANCHORS[notification.type];
  return anchor ? `${base}#${anchor}` : base;
}

export function notificationTimeLabel(value: string, now = Date.now()): string {
  const created = Date.parse(value);
  if (!Number.isFinite(created)) return "Recently";
  const minutes = Math.max(0, Math.floor((now - created) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(value).toLocaleDateString("en-IE", { day: "numeric", month: "short" });
}
