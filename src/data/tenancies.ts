import type {
  ActivityEvent,
  LifecycleDefinition,
  Party,
  ProtectionRule,
  Tenancy,
  TenancyFilter,
} from "@/types/tenancy";

export const PROTECTION_RULES: ProtectionRule[] = [
  {
    id: "no-tenant-withdrawal",
    label: "Tenant cannot withdraw alone",
    detail: "A single party request can never move the protected funds.",
  },
  {
    id: "no-landlord-withdrawal",
    label: "Landlord cannot withdraw alone",
    detail: "Proposed deductions require the record, not just a claim.",
  },
  {
    id: "agreement-settlement",
    label: "Settlement requires agreement",
    detail: "Release happens against an agreed, evidenced outcome.",
  },
];

export const LIFECYCLE: LifecycleDefinition[] = [
  {
    key: "agreement",
    label: "Agreement Created",
    description: "Terms, people and property are recorded.",
  },
  {
    key: "protected",
    label: "Deposit Protected",
    description: "Funds sit in a neutral, jointly controlled record.",
  },
  {
    key: "move-in",
    label: "Move-In Recorded",
    description: "Condition evidence is captured and timestamped.",
  },
  {
    key: "active",
    label: "Tenancy Active",
    description: "The record stays live for the length of the tenancy.",
  },
  {
    key: "move-out",
    label: "Move-Out Review",
    description: "Deductions are proposed, reviewed and agreed.",
  },
  {
    key: "released",
    label: "Deposit Released",
    description: "Settlement is executed and archived.",
  },
];

export const LIFECYCLE_ORDER: LifecycleDefinition["key"][] = LIFECYCLE.map(
  (step) => step.key,
);

const sarahByrne: Party = {
  id: "party-sarah-byrne",
  name: "Sarah Byrne",
  role: "tenant",
  email: "sarah.byrne@example.ie",
  joinedAt: "2026-08-18",
  wallet: null,
};

const michaelOconnor: Party = {
  id: "party-michael-oconnor",
  name: "Michael O'Connor",
  role: "landlord",
  email: "m.oconnor@example.ie",
  joinedAt: "2026-08-17",
  wallet: null,
};

const aoifeKelly: Party = {
  id: "party-aoife-kelly",
  name: "Aoife Kelly",
  role: "tenant",
  email: "aoife.kelly@example.ie",
  joinedAt: "2026-03-02",
  wallet: null,
};

const declanMoore: Party = {
  id: "party-declan-moore",
  name: "Declan Moore",
  role: "landlord",
  email: "declan.moore@example.ie",
  joinedAt: "2026-03-01",
  wallet: null,
};

const liamDoherty: Party = {
  id: "party-liam-doherty",
  name: "Liam Doherty",
  role: "tenant",
  email: "liam.doherty@example.ie",
  joinedAt: "2026-09-24",
  wallet: null,
};

const niamhFitzgerald: Party = {
  id: "party-niamh-fitzgerald",
  name: "Niamh Fitzgerald",
  role: "landlord",
  email: "niamh.f@example.ie",
  joinedAt: "2026-09-22",
  wallet: null,
};

const camdenActivity: ActivityEvent[] = [
  {
    id: "act-camden-1",
    title: "Move-in condition recorded",
    detail: "14 photos across kitchen, living room and main bedroom.",
    timestamp: "2026-09-01T10:24:00Z",
    actor: "Sarah Byrne",
    kind: "evidence",
  },
  {
    id: "act-camden-2",
    title: "Deposit protected",
    detail: "€1,800 confirmed in the neutral tenancy record.",
    timestamp: "2026-08-26T14:02:00Z",
    actor: "DepositLock",
    kind: "deposit",
  },
  {
    id: "act-camden-3",
    title: "Tenancy agreement countersigned",
    detail: "Both parties accepted the deposit protection terms.",
    timestamp: "2026-08-24T09:41:00Z",
    actor: "Michael O'Connor",
    kind: "agreement",
  },
  {
    id: "act-camden-4",
    title: "Tenancy created",
    detail: "18 Camden Street, Dublin 2 added to the record.",
    timestamp: "2026-08-17T16:10:00Z",
    actor: "Michael O'Connor",
    kind: "system",
  },
];

const rathminesActivity: ActivityEvent[] = [
  {
    id: "act-rathmines-1",
    title: "Rent review confirmed",
    detail: "No change to the protected deposit amount.",
    timestamp: "2026-07-02T11:15:00Z",
    actor: "Declan Moore",
    kind: "system",
  },
  {
    id: "act-rathmines-2",
    title: "Move-in condition recorded",
    detail: "11 photos and one walkthrough video captured.",
    timestamp: "2026-03-15T09:05:00Z",
    actor: "Aoife Kelly",
    kind: "evidence",
  },
  {
    id: "act-rathmines-3",
    title: "Deposit protected",
    detail: "€2,400 confirmed in the neutral tenancy record.",
    timestamp: "2026-03-10T13:30:00Z",
    actor: "DepositLock",
    kind: "deposit",
  },
  {
    id: "act-rathmines-4",
    title: "Tenancy agreement countersigned",
    detail: "Both parties accepted the deposit protection terms.",
    timestamp: "2026-03-03T15:47:00Z",
    actor: "Aoife Kelly",
    kind: "agreement",
  },
];

const stoneybatterActivity: ActivityEvent[] = [
  {
    id: "act-stoneybatter-1",
    title: "Deposit funding requested",
    detail: "Tenant has been asked to fund €1,500 before move-in.",
    timestamp: "2026-09-28T08:55:00Z",
    actor: "DepositLock",
    kind: "deposit",
  },
  {
    id: "act-stoneybatter-2",
    title: "Tenancy agreement countersigned",
    detail: "Both parties accepted the deposit protection terms.",
    timestamp: "2026-09-25T17:20:00Z",
    actor: "Liam Doherty",
    kind: "agreement",
  },
  {
    id: "act-stoneybatter-3",
    title: "Tenancy created",
    detail: "7 Stoneybatter Lane, Dublin 7 added to the record.",
    timestamp: "2026-09-22T10:02:00Z",
    actor: "Niamh Fitzgerald",
    kind: "system",
  },
];

export const TENANCIES: Tenancy[] = [
  {
    id: "camden-street-dublin-2",
    address: "18 Camden Street",
    locality: "Dublin 2",
    eircode: "D02 XY34",
    propertyType: "Period apartment",
    bedrooms: 2,
    imageUrl: "/properties/camden-street.jpg",
    imageAlt: "Bright living room at 18 Camden Street, Dublin 2",
    startDate: "2026-09-01",
    endDate: "2027-08-31",
    rentMonthly: 2100,
    depositAmount: 1800,
    status: "protected",
    recordStatus: "protected",
    filterGroup: "active",
    lifecycleStage: "active",
    fundedAt: "2026-08-26",
    vaultAddress: null,
    tenant: sarahByrne,
    landlord: michaelOconnor,
    evidence: [
      {
        id: "ev-camden-1",
        room: "Kitchen",
        caption: "Worktops, appliances and tiling at move-in",
        capturedAt: "2026-09-01T10:12:00Z",
        capturedBy: "Sarah Byrne",
        imageUrl: "/evidence/move-in-kitchen.jpg",
      },
      {
        id: "ev-camden-2",
        room: "Living room",
        caption: "Walls, flooring and window seals",
        capturedAt: "2026-09-01T10:18:00Z",
        capturedBy: "Sarah Byrne",
        imageUrl: "/evidence/move-in-living.jpg",
      },
      {
        id: "ev-camden-3",
        room: "Main bedroom",
        caption: "Wardrobes, sockets and radiator",
        capturedAt: "2026-09-01T10:24:00Z",
        capturedBy: "Sarah Byrne",
        imageUrl: "/evidence/move-in-bedroom.jpg",
      },
    ],
    activity: camdenActivity,
  },
  {
    id: "rathmines-road-dublin-6",
    address: "42 Rathmines Road Lower",
    locality: "Dublin 6",
    eircode: "D06 F2K9",
    propertyType: "Garden flat",
    bedrooms: 1,
    imageUrl: "/properties/rathmines-road.jpg",
    imageAlt: "Red-brick terraced property on Rathmines Road Lower, Dublin 6",
    startDate: "2026-03-15",
    endDate: "2027-03-14",
    rentMonthly: 2650,
    depositAmount: 2400,
    status: "active",
    recordStatus: "protected",
    filterGroup: "active",
    lifecycleStage: "active",
    fundedAt: "2026-03-10",
    vaultAddress: null,
    tenant: aoifeKelly,
    landlord: declanMoore,
    evidence: [
      {
        id: "ev-rathmines-1",
        room: "Living room",
        caption: "Original cornicing and floorboards",
        capturedAt: "2026-03-15T09:05:00Z",
        capturedBy: "Aoife Kelly",
        imageUrl: "/evidence/move-in-living.jpg",
      },
      {
        id: "ev-rathmines-2",
        room: "Kitchen",
        caption: "Units, hob and extractor at move-in",
        capturedAt: "2026-03-15T09:11:00Z",
        capturedBy: "Aoife Kelly",
        imageUrl: "/evidence/move-in-kitchen.jpg",
      },
    ],
    activity: rathminesActivity,
  },
  {
    id: "stoneybatter-lane-dublin-7",
    address: "7 Stoneybatter Lane",
    locality: "Dublin 7",
    eircode: "D07 K8P1",
    propertyType: "Coach house",
    bedrooms: 2,
    imageUrl: "/properties/stoneybatter-lane.jpg",
    imageAlt: "Interior of 7 Stoneybatter Lane, Dublin 7",
    startDate: "2026-11-01",
    endDate: "2027-10-31",
    rentMonthly: 1750,
    depositAmount: 1500,
    status: "pending",
    recordStatus: "awaiting_deposit",
    filterGroup: "pending",
    lifecycleStage: "agreement",
    fundedAt: null,
    vaultAddress: null,
    tenant: liamDoherty,
    landlord: niamhFitzgerald,
    evidence: [],
    activity: stoneybatterActivity,
  },
];

export const CURRENT_USER = {
  name: "Sarah Byrne",
  email: "sarah.byrne@example.ie",
  initials: "SB",
  role: "Tenant & Landlord",
  memberSince: "2025-11-04",
};

export const TENANCY_FILTERS: { value: TenancyFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "pending", label: "Pending" },
  { value: "closed", label: "Closed" },
];

export function getTenancyById(id: string): Tenancy | undefined {
  return TENANCIES.find((tenancy) => tenancy.id === id);
}

export function filterTenancies(
  tenancies: Tenancy[],
  filter: TenancyFilter,
): Tenancy[] {
  if (filter === "all") return tenancies;
  return tenancies.filter((tenancy) => tenancy.filterGroup === filter);
}
