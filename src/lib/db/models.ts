/**
 * Repository-layer records: camelCase, money as JS numbers exactly as
 * PostgREST decodes `numeric`, timestamps as ISO strings.
 *
 * These are *not* the raw rows (see `src/types/database.ts`) and *not* the UI
 * view models components render — they are the stable shape the application
 * logic consumes, so swapping in a different transport never ripples outward.
 */

export type ProfileRecord = {
  id: string;
  walletAddress: string | null;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PropertyRecord = {
  id: string;
  createdByProfileId: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  county: string | null;
  postalCode: string | null;
  country: string;
  propertyType: string;
  bedrooms: number | null;
  coverImageUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TenancyRecord = {
  id: string;
  propertyId: string;
  landlordProfileId: string;
  tenantProfileId: string;
  startDate: string;
  endDate: string | null;
  monthlyRentAmount: number;
  depositAmount: number;
  displayCurrency: string;
  settlementToken: string | null;
  status: string;
  blockchainReference: string | null;
  vaultAddress: string | null;
  createdAt: string;
  activatedAt: string | null;
  closedAt: string | null;
  updatedAt: string;
};

export type TenancySummaryRecord = TenancyRecord & {
  property: PropertyRecord | null;
};

export type TenancyParticipantRecord = {
  id: string;
  tenancyId: string;
  profileId: string;
  role: "landlord" | "tenant";
  joinedAt: string;
  acceptedAt: string | null;
  status: "invited" | "accepted" | "declined";
};

export type EvidenceRecord = {
  id: string;
  tenancyId: string;
  uploadedByProfileId: string;
  evidenceContext: "move_in" | "move_out" | "deduction" | "dispute";
  deductionId: string | null;
  category: string;
  fileUrl: string | null;
  caption: string;
  createdAt: string;
};

export type DeductionRecord = {
  id: string;
  tenancyId: string;
  proposedByProfileId: string;
  amount: number;
  reasonCategory: string;
  description: string;
  status: "proposed" | "accepted" | "challenged" | "withdrawn" | "resolved";
  createdAt: string;
  respondedAt: string | null;
  updatedAt: string;
};

export type DisputeRecord = {
  id: string;
  tenancyId: string;
  deductionId: string;
  openedByProfileId: string;
  reason: string;
  status: "open" | "under_review" | "resolved" | "cancelled";
  resolutionNotes: string | null;
  resolvedByProfileId: string | null;
  openedAt: string;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SettlementRecord = {
  id: string;
  tenancyId: string;
  originalDepositAmount: number;
  tenantAmount: number;
  landlordAmount: number;
  settlementType: "full_return" | "partial_deduction" | "disputed_resolution";
  tenantApproved: boolean;
  landlordApproved: boolean;
  blockchainTransaction: string | null;
  settledAt: string | null;
  createdAt: string;
};

export type ActivityEventRecord = {
  id: string;
  tenancyId: string;
  actorProfileId: string | null;
  eventType: string;
  title: string;
  description: string | null;
  metadata: Record<string, unknown>;
  blockchainReference: string | null;
  createdAt: string;
};

export type NotificationRecord = {
  id: string;
  profileId: string;
  tenancyId: string | null;
  type: string;
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
};

export type SharedProfileRecord = {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  walletAddress: string | null;
  createdAt: string;
};
