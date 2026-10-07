export type TenancyStatus = "protected" | "active" | "pending" | "disputed" | "closed";

export type TenancyFilter = "all" | "active" | "pending" | "closed";

export type PartyRole = "tenant" | "landlord";

export type LifecycleStage =
  | "agreement"
  | "protected"
  | "move-in"
  | "active"
  | "move-out"
  | "released";

export type ActivityKind =
  | "deposit"
  | "evidence"
  | "agreement"
  | "deduction"
  | "settlement"
  | "system";

export interface Party {
  id: string;
  name: string;
  role: PartyRole;
  email: string;
  joinedAt: string;
  /** Verified Solana wallet from SIWS; `null` when not linked yet. */
  wallet: string | null;
}

export interface EvidenceItem {
  id: string;
  room: string;
  caption: string;
  capturedAt: string;
  capturedBy: string;
  imageUrl: string;
}

export interface ActivityEvent {
  id: string;
  title: string;
  detail: string;
  timestamp: string;
  actor: string;
  kind: ActivityKind;
}

export interface ProtectionRule {
  id: string;
  label: string;
  detail: string;
}

export interface Tenancy {
  id: string;
  address: string;
  locality: string;
  eircode: string;
  propertyType: string;
  bedrooms: number;
  imageUrl: string;
  imageAlt: string;
  startDate: string;
  endDate: string | null;
  rentMonthly: number;
  depositAmount: number;
  status: TenancyStatus;
  /** Raw database status (`awaiting_tenant`, `awaiting_deposit`, …). */
  recordStatus: string;
  filterGroup: Exclude<TenancyFilter, "all">;
  lifecycleStage: LifecycleStage;
  fundedAt: string | null;
  /** The agreement's deterministic token vault, once created on chain. */
  vaultAddress: string | null;
  tenant: Party;
  landlord: Party;
  evidence: EvidenceItem[];
  activity: ActivityEvent[];
}

export interface LifecycleDefinition {
  key: LifecycleStage;
  label: string;
  description: string;
}
