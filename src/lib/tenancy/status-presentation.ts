export type TenancyStatusTone = "protected" | "pending" | "dispute" | "closed" | "neutral";
export type TenancyStatusIcon = "shield" | "clock" | "review" | "alert" | "archive" | "cancel";

export type TenancyStatusPresentation = {
  label: string;
  description: string;
  tone: TenancyStatusTone;
  icon: TenancyStatusIcon;
};

const STATUS_PRESENTATION: Record<string, TenancyStatusPresentation> = {
  draft: { label: "Draft", description: "The landlord is preparing the tenancy record.", tone: "neutral", icon: "clock" },
  awaiting_tenant: { label: "Awaiting tenant", description: "The invited tenant has not accepted the tenancy yet.", tone: "pending", icon: "clock" },
  awaiting_deposit: { label: "Awaiting deposit", description: "The tenant must fund the agreed test token amount before the deposit is protected.", tone: "pending", icon: "clock" },
  protected: { label: "Protected", description: "Neither party can withdraw the deposit alone.", tone: "protected", icon: "shield" },
  move_out_review: { label: "Move-out review", description: "The parties are reviewing condition evidence before a settlement proposal.", tone: "protected", icon: "review" },
  deduction_proposed: { label: "Deduction proposed", description: "The tenant can approve or challenge the landlord's proposed split.", tone: "pending", icon: "review" },
  settlement_pending: { label: "Settlement pending", description: "The tenant must approve the exact on-chain payout split.", tone: "pending", icon: "clock" },
  disputed: { label: "Under dispute", description: "The full deposit remains locked while the challenge is unresolved.", tone: "dispute", icon: "alert" },
  closed: { label: "Closed", description: "The agreed settlement is complete and this tenancy is archived.", tone: "closed", icon: "archive" },
  cancelled: { label: "Cancelled", description: "This tenancy did not proceed.", tone: "neutral", icon: "cancel" },
  // The compact list/landing view model retains these semantic group values.
  active: { label: "Protected", description: "Neither party can withdraw the deposit alone.", tone: "protected", icon: "shield" },
  pending: { label: "Pending", description: "This tenancy is waiting for its next step.", tone: "pending", icon: "clock" },
};

export function tenancyStatusPresentation(status: string): TenancyStatusPresentation {
  return STATUS_PRESENTATION[status] ?? {
    label: "Status unavailable",
    description: "Refresh this tenancy record to check its latest status.",
    tone: "neutral",
    icon: "clock",
  };
}
