import type {
  ActivityEventRecord,
  EvidenceRecord,
  PropertyRecord,
  SharedProfileRecord,
  TenancyParticipantRecord,
  TenancyRecord,
} from "@/lib/db/models";
import type {
  ActivityEvent,
  ActivityKind,
  EvidenceItem,
  LifecycleStage,
  Party,
  PartyRole,
  Tenancy,
  TenancyFilter,
  TenancyStatus,
} from "@/types/tenancy";

/**
 * Database → UI view model.
 *
 * Pure and unit-tested: repository records go in, the `Tenancy` shape the
 * existing components render comes out. No queries, no React, no state.
 *
 * Vocabulary split:
 *   - database status   `draft | awaiting_tenant | awaiting_deposit | …`
 *   - UI status         `pending | protected | active | closed` (+ filter
 *                       group and 6-stage lifecycle for the tracker)
 */

/** id → shared profile (name/avatar), the only identity data RLS exposes. */
export type PartyDirectory = ReadonlyMap<string, SharedProfileRecord>;

/** The signed-in viewer, used to decide whose e-mail may be shown. */
export type ViewerInfo = { id: string; email: string | null } | null;

type StatusView = {
  status: TenancyStatus;
  filterGroup: Exclude<TenancyFilter, "all">;
  lifecycleStage: LifecycleStage;
};

/**
 * Maps a database status (plus move-in state) onto the four UI statuses,
 * the list filter groups and the six lifecycle stages.
 */
export function statusView(
  status: string,
  activatedAt: string | null,
): StatusView {
  switch (status) {
    case "draft":
    case "awaiting_tenant":
    case "awaiting_deposit":
      return { status: "pending", filterGroup: "pending", lifecycleStage: "agreement" };
    case "protected":
      return activatedAt
        ? { status: "active", filterGroup: "active", lifecycleStage: "active" }
        : { status: "protected", filterGroup: "active", lifecycleStage: "protected" };
    case "move_out_review":
    case "deduction_proposed":
    case "disputed":
    case "settlement_pending":
      return { status: "active", filterGroup: "active", lifecycleStage: "move-out" };
    case "closed":
      return { status: "closed", filterGroup: "closed", lifecycleStage: "released" };
    case "cancelled":
    default:
      return { status: "closed", filterGroup: "closed", lifecycleStage: "agreement" };
  }
}

/** Activity event type → the timeline icon family the UI understands. */
export function activityKind(eventType: string): ActivityKind {
  switch (eventType) {
    case "deposit_funded":
    case "deposit_protected":
    case "deposit_vault_initialized":
      return "deposit";
    case "evidence_added":
      return "evidence";
    case "tenant_invited":
    case "tenant_accepted":
    case "tenant_declined":
      return "agreement";
    case "deduction_proposed":
    case "deduction_accepted":
    case "deduction_challenged":
    case "dispute_opened":
    case "dispute_resolved":
      return "deduction";
    case "settlement_approved":
    case "settlement_completed":
    case "tenancy_closed":
      return "settlement";
    case "tenancy_created":
    case "move_out_started":
    default:
      return "system";
  }
}

const ROOM_LABELS: Record<string, string> = {
  living_room: "Living room",
  kitchen: "Kitchen",
  bedroom: "Bedroom",
  bathroom: "Bathroom",
  furniture: "Furniture",
  appliances: "Appliances",
  general: "General",
  other: "Other",
};

/** Evidence category → the human label rendered on the card. */
export function evidenceRoom(category: string): string {
  return ROOM_LABELS[category] ?? "Other";
}

function titleCase(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/**
 * "D02 XY34" → "Dublin 2", otherwise county, otherwise city.
 * Keeps the locality line looking like the rest of the product without
 * storing a denormalised copy of it.
 */
function localityOf(property: PropertyRecord): string {
  const eircode = (property.postalCode ?? "").toUpperCase();
  const match = /^D(\d{2})/.exec(eircode);
  if (match) return `Dublin ${Number(match[1])}`;
  return property.county ?? property.city;
}

function actorName(
  actorProfileId: string | null,
  directory: PartyDirectory,
): string {
  if (!actorProfileId) return "DepositLock";
  return directory.get(actorProfileId)?.fullName ?? "DepositLock";
}

function toParty(
  role: PartyRole,
  participant: TenancyParticipantRecord | undefined,
  tenancy: TenancyRecord,
  directory: PartyDirectory,
  viewer: ViewerInfo,
): Party {
  const id = participant?.profileId ?? "";
  const shared = id ? directory.get(id) : undefined;

  // Only the viewer's own e-mail exists locally — RLS deliberately hides
  // other people's e-mail addresses from `v_shared_profiles`.
  const email = viewer && id === viewer.id ? (viewer.email ?? "") : "";

  return {
    id: id || `${role}-unknown`,
    name: shared?.fullName ?? "DepositLock member",
    role,
    email,
    joinedAt: participant?.joinedAt ?? tenancy.createdAt,
    wallet: shared?.walletAddress ?? null,
  };
}

export type TenancyMappingInput = {
  tenancy: TenancyRecord;
  property: PropertyRecord | null;
  participants: TenancyParticipantRecord[];
  directory: PartyDirectory;
  viewer: ViewerInfo;
  /** Newest-first straight from the repository; reversed for display. */
  activity?: ActivityEventRecord[];
  evidence?: EvidenceRecord[];
};

/** Assembles the `Tenancy` view model. Empty lists for summary views. */
export function toTenancy(input: TenancyMappingInput): Tenancy {
  const { tenancy, property, participants, directory, viewer } = input;

  const view = statusView(tenancy.status, tenancy.activatedAt);
  const tenantParticipant = participants.find((row) => row.role === "tenant");
  const landlordParticipant = participants.find((row) => row.role === "landlord");

  const activity = (input.activity ?? []).map((event): ActivityEvent => ({
    id: event.id,
    title: event.title,
    detail: event.description ?? "",
    timestamp: event.createdAt,
    actor: actorName(event.actorProfileId, directory),
    kind: activityKind(event.eventType),
  }));
  activity.reverse();

  const evidence = (input.evidence ?? []).map((item): EvidenceItem => ({
    id: item.id,
    room: evidenceRoom(item.category),
    caption: item.caption,
    capturedAt: item.createdAt,
    capturedBy: actorName(item.uploadedByProfileId, directory),
    imageUrl: item.fileUrl ?? "",
  }));
  evidence.reverse();

  const fundedEvent = (input.activity ?? []).find(
    (event) =>
      event.eventType === "deposit_protected" ||
      event.eventType === "deposit_funded",
  );

  return {
    id: tenancy.id,
    address: property?.addressLine1 ?? "Tenancy record",
    locality: property ? localityOf(property) : "",
    eircode: property?.postalCode ?? "",
    propertyType: property ? titleCase(property.propertyType) : "",
    bedrooms: property?.bedrooms ?? 0,
    imageUrl: property?.coverImageUrl ?? "",
    imageAlt: property
      ? `${property.addressLine1}, ${localityOf(property)}`
      : "Tenancy property",
    startDate: tenancy.startDate,
    endDate: tenancy.endDate,
    rentMonthly: tenancy.monthlyRentAmount,
    depositAmount: tenancy.depositAmount,
    status: view.status,
    recordStatus: tenancy.status,
    filterGroup: view.filterGroup,
    lifecycleStage: view.lifecycleStage,
    fundedAt: fundedEvent?.createdAt ?? null,
    vaultAddress: tenancy.vaultAddress,
    tenant: tenantParticipant
      ? toParty("tenant", tenantParticipant, tenancy, directory, viewer)
      : {
          // Phase 4: the tenant is unknown until the invitation is accepted.
          id: "tenant-pending",
          name: "Waiting for tenant",
          role: "tenant",
          email: "",
          joinedAt: tenancy.createdAt,
          wallet: null,
        },
    landlord: toParty("landlord", landlordParticipant, tenancy, directory, viewer),
    evidence,
    activity,
  };
}

/** `filterTenancies` over an in-memory list (used by the explorer). */
export function toPartyDirectory(
  profiles: readonly SharedProfileRecord[],
): PartyDirectory {
  return new Map(profiles.map((profile) => [profile.id, profile]));
}
