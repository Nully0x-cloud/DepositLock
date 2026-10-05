import { describe, expect, it } from "vitest";
import type {
  ActivityEventRecord,
  EvidenceRecord,
  PropertyRecord,
  SharedProfileRecord,
  TenancyParticipantRecord,
  TenancyRecord,
} from "@/lib/db/models";
import {
  activityKind,
  evidenceRoom,
  statusView,
  toPartyDirectory,
  toTenancy,
} from "./view-model";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const LANDLORD_ID = "22222222-2222-4222-8222-222222222222";

function tenancy(overrides: Partial<TenancyRecord> = {}): TenancyRecord {
  return {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    propertyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    landlordProfileId: LANDLORD_ID,
    tenantProfileId: TENANT_ID,
    startDate: "2026-09-01",
    endDate: "2027-08-31",
    monthlyRentAmount: 2100,
    depositAmount: 1800,
    displayCurrency: "EUR",
    settlementToken: "USDC",
    status: "protected",
    blockchainReference: null,
    vaultAddress: null,
    createdAt: "2026-08-17T15:10:00.000Z",
    activatedAt: null,
    closedAt: null,
    updatedAt: "2026-09-01T09:00:00.000Z",
    ...overrides,
  };
}

function property(overrides: Partial<PropertyRecord> = {}): PropertyRecord {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    createdByProfileId: LANDLORD_ID,
    addressLine1: "18 Camden Street",
    addressLine2: null,
    city: "Dublin",
    county: "Dublin",
    postalCode: "D02 XY34",
    country: "IE",
    propertyType: "apartment",
    bedrooms: 2,
    coverImageUrl: "/properties/camden-street.jpg",
    createdAt: "2026-08-17T15:00:00.000Z",
    updatedAt: "2026-08-17T15:00:00.000Z",
    ...overrides,
  };
}

function participants(): TenancyParticipantRecord[] {
  return [
    {
      id: "p1",
      tenancyId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      profileId: TENANT_ID,
      role: "tenant",
      joinedAt: "2026-08-18",
      acceptedAt: "2026-08-24",
      status: "accepted",
    },
    {
      id: "p2",
      tenancyId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      profileId: LANDLORD_ID,
      role: "landlord",
      joinedAt: "2026-08-17",
      acceptedAt: "2026-08-24",
      status: "accepted",
    },
  ];
}

function directory(): ReadonlyMap<string, SharedProfileRecord> {
  return toPartyDirectory([
    {
      id: TENANT_ID,
      fullName: "Sarah Byrne",
      avatarUrl: null,
      walletAddress: "DEVWALLET-00000000000000000000SARAH00001",
      createdAt: "2026-08-17",
    },
    {
      id: LANDLORD_ID,
      fullName: "Michael O'Connor",
      avatarUrl: null,
      walletAddress: "DEVWALLET-00000000000000000000MICHAEL01",
      createdAt: "2026-08-17",
    },
  ]);
}

describe("statusView", () => {
  it("maps draft/awaiting states onto pending at the agreement stage", () => {
    for (const status of ["draft", "awaiting_tenant", "awaiting_deposit"]) {
      expect(statusView(status, null)).toEqual({
        status: "pending",
        filterGroup: "pending",
        lifecycleStage: "agreement",
      });
    }
  });

  it("separates a funded-but-not-moved-in deposit from a running tenancy", () => {
    expect(statusView("protected", null)).toEqual({
      status: "protected",
      filterGroup: "active",
      lifecycleStage: "protected",
    });
    expect(statusView("protected", "2026-09-01T09:00:00Z")).toEqual({
      status: "active",
      filterGroup: "active",
      lifecycleStage: "active",
    });
  });

  it("keeps every move-out flavour in the active group at the move-out stage", () => {
    for (const status of [
      "move_out_review",
      "deduction_proposed",
      "disputed",
      "settlement_pending",
    ]) {
      expect(statusView(status, null)).toEqual({
        status: "active",
        filterGroup: "active",
        lifecycleStage: "move-out",
      });
    }
  });

  it("archives closed records and treats cancelled as an aborted agreement", () => {
    expect(statusView("closed", null)).toEqual({
      status: "closed",
      filterGroup: "closed",
      lifecycleStage: "released",
    });
    expect(statusView("cancelled", null)).toEqual({
      status: "closed",
      filterGroup: "closed",
      lifecycleStage: "agreement",
    });
  });

  it("fails closed on an unknown status instead of throwing", () => {
    expect(statusView("something_new", null).filterGroup).toBe("closed");
  });
});

describe("activityKind / evidenceRoom", () => {
  it("groups events into the five visible families", () => {
    expect(activityKind("deposit_protected")).toBe("deposit");
    expect(activityKind("deposit_funded")).toBe("deposit");
    expect(activityKind("evidence_added")).toBe("evidence");
    expect(activityKind("tenant_accepted")).toBe("agreement");
    expect(activityKind("deduction_proposed")).toBe("deduction");
    expect(activityKind("dispute_opened")).toBe("deduction");
    expect(activityKind("settlement_completed")).toBe("settlement");
    expect(activityKind("tenancy_closed")).toBe("settlement");
    expect(activityKind("tenancy_created")).toBe("system");
    expect(activityKind("brand_new_event")).toBe("system");
  });

  it("labels evidence categories the way the UI does", () => {
    expect(evidenceRoom("living_room")).toBe("Living room");
    expect(evidenceRoom("kitchen")).toBe("Kitchen");
    expect(evidenceRoom("unknown_category")).toBe("Other");
  });
});

describe("toTenancy", () => {
  const base = () => ({
    tenancy: tenancy(),
    property: property(),
    participants: participants(),
    directory: directory(),
    viewer: { id: TENANT_ID, email: "sarah.byrne@example.ie" },
  });

  it("builds the card the components already render", () => {
    const mapped = toTenancy(base());

    expect(mapped).toMatchObject({
      address: "18 Camden Street",
      locality: "Dublin 2",
      eircode: "D02 XY34",
      propertyType: "Apartment",
      bedrooms: 2,
      imageUrl: "/properties/camden-street.jpg",
      rentMonthly: 2100,
      depositAmount: 1800,
      status: "protected",
      filterGroup: "active",
      lifecycleStage: "protected",
      endDate: "2027-08-31",
    });
    expect(mapped.tenant).toMatchObject({ name: "Sarah Byrne", role: "tenant" });
    expect(mapped.landlord).toMatchObject({
      name: "Michael O'Connor",
      role: "landlord",
    });
    expect(mapped.imageAlt).toBe("18 Camden Street, Dublin 2");
  });

  it("shows only the viewer's own e-mail (§29 identity minimisation)", () => {
    const asTenant = toTenancy(base());
    expect(asTenant.tenant.email).toBe("sarah.byrne@example.ie");
    expect(asTenant.landlord.email).toBe("");

    const asLandlord = toTenancy({
      ...base(),
      viewer: { id: LANDLORD_ID, email: "m.oconnor@example.ie" },
    });
    expect(asTenant).not.toBe(asLandlord);
    expect(asLandlord.landlord.email).toBe("m.oconnor@example.ie");
    expect(asLandlord.tenant.email).toBe("");
  });

  it("sorts the timeline newest first and names the DepositLock system actor", () => {
    const activity: ActivityEventRecord[] = [
      {
        id: "a1",
        tenancyId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        actorProfileId: LANDLORD_ID,
        eventType: "tenancy_created",
        title: "Tenancy created",
        description: "Record opened.",
        metadata: {},
        blockchainReference: null,
        createdAt: "2026-08-17T15:10:00.000Z",
      },
      {
        id: "a2",
        tenancyId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        actorProfileId: null,
        eventType: "deposit_protected",
        title: "Deposit protected",
        description: null,
        metadata: {},
        blockchainReference: null,
        createdAt: "2026-08-26T13:00:00.000Z",
      },
    ];

    const mapped = toTenancy({ ...base(), activity });

    expect(mapped.activity.map((event) => event.id)).toEqual(["a2", "a1"]);
    expect(mapped.activity[0]).toMatchObject({
      actor: "DepositLock",
      kind: "deposit",
      detail: "",
    });
    expect(mapped.fundedAt).toBe("2026-08-26T13:00:00.000Z");
  });

  it("maps evidence with room labels and keeps items without a file URL renderable", () => {
    const evidence: EvidenceRecord[] = [
      {
        id: "e1",
        tenancyId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        uploadedByProfileId: TENANT_ID,
        evidenceContext: "move_in",
        deductionId: null,
        category: "kitchen",
        fileUrl: "/evidence/move-in-kitchen.jpg",
        caption: "Worktops at move-in",
        createdAt: "2026-09-01T10:12:00.000Z",
      },
      {
        id: "e2",
        tenancyId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        uploadedByProfileId: TENANT_ID,
        evidenceContext: "move_in",
        deductionId: null,
        category: "general",
        fileUrl: null,
        caption: "Hallway",
        createdAt: "2026-09-01T10:15:00.000Z",
      },
    ];

    const mapped = toTenancy({ ...base(), evidence });

    expect(mapped.evidence.map((item) => item.id)).toEqual(["e2", "e1"]);
    expect(mapped.evidence[1]).toMatchObject({
      room: "Kitchen",
      capturedBy: "Sarah Byrne",
      imageUrl: "/evidence/move-in-kitchen.jpg",
    });
    expect(mapped.evidence[0].imageUrl).toBe("");
  });

  it("degrades safely when the property or participants are missing", () => {
    const mapped = toTenancy({
      tenancy: tenancy({ endDate: null, status: "draft" }),
      property: null,
      participants: [],
      directory: new Map(),
      viewer: null,
    });

    expect(mapped.address).toBe("Tenancy record");
    expect(mapped.bedrooms).toBe(0);
    expect(mapped.endDate).toBeNull();
    expect(mapped.status).toBe("pending");
    expect(mapped.tenant.email).toBe("");
    expect(mapped.landlord.name).toBe("DepositLock member");
    expect(mapped.fundedAt).toBeNull();
  });

  it("falls back to the county when the eircode does not encode a Dublin area", () => {
    const mapped = toTenancy({
      ...base(),
      property: property({ postalCode: "CO. KERRY", county: "Kerry" }),
    });
    expect(mapped.locality).toBe("Kerry");
  });
});
