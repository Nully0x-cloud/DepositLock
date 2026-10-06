import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  Json,
  Property,
  Tenancy,
  TenancyParticipant,
} from "@/types/database";
import type { RepositoryResult } from "./errors";
import { fromResult } from "./from-result";
import { toPropertyRecord } from "./properties";
import type {
  TenancyParticipantRecord,
  TenancyRecord,
  TenancySummaryRecord,
} from "./models";

type Client = SupabaseClient<Database>;

export function toTenancyRecord(row: Tenancy): TenancyRecord {
  return {
    id: row.id,
    propertyId: row.property_id,
    landlordProfileId: row.landlord_profile_id,
    tenantProfileId: row.tenant_profile_id,
    startDate: row.start_date,
    endDate: row.end_date,
    monthlyRentAmount: row.monthly_rent_amount,
    depositAmount: row.deposit_amount,
    displayCurrency: row.display_currency,
    settlementToken: row.settlement_token,
    status: row.status,
    blockchainReference: row.blockchain_reference,
    vaultAddress: row.vault_address,
    createdAt: row.created_at,
    activatedAt: row.activated_at,
    closedAt: row.closed_at,
    updatedAt: row.updated_at,
  };
}

function toParticipantRecord(row: TenancyParticipant): TenancyParticipantRecord {
  return {
    id: row.id,
    tenancyId: row.tenancy_id,
    profileId: row.profile_id,
    role: row.role as TenancyParticipantRecord["role"],
    joinedAt: row.joined_at,
    acceptedAt: row.accepted_at,
    status: row.status as TenancyParticipantRecord["status"],
  };
}

/**
 * Tenancies visible to the caller. RLS decides visibility — the repository
 * never filters by profile id itself.
 */
export async function listTenanciesForViewer(
  client: Client,
): Promise<RepositoryResult<TenancyRecord[]>> {
  const result = await fromResult<Tenancy[]>(
    client.from("tenancies").select("*").order("created_at", { ascending: false }),
  );
  if (!result.ok) return result;
  return { ok: true, data: result.data.map(toTenancyRecord) };
}

/**
 * Tenancies with their property attached, assembled from two queries so the
 * raw database types stay free of embedded-relationship assumptions.
 */
export async function listTenancySummaries(
  client: Client,
): Promise<RepositoryResult<TenancySummaryRecord[]>> {
  const tenancies = await listTenanciesForViewer(client);
  if (!tenancies.ok) return tenancies;

  const propertyIds = [...new Set(tenancies.data.map((row) => row.propertyId))];
  const properties = propertyIds.length
    ? await fromResult<Property[]>(
        client.from("properties").select("*").in("id", propertyIds),
      )
    : { ok: true as const, data: [] as Property[] };

  if (!properties.ok) return properties;

  const byId = new Map(
    properties.data.map((row) => [row.id, toPropertyRecord(row)]),
  );

  return {
    ok: true,
    data: tenancies.data.map((row) => ({
      ...row,
      property: byId.get(row.propertyId) ?? null,
    })),
  };
}

export async function getTenancyById(
  client: Client,
  id: string,
): Promise<RepositoryResult<TenancyRecord>> {
  const result = await fromResult<Tenancy>(
    client.from("tenancies").select("*").eq("id", id).single(),
  );
  if (!result.ok) return result;
  return { ok: true, data: toTenancyRecord(result.data) };
}

/** Who takes part in the tenancy, and in which role. */
export async function listTenancyParticipants(
  client: Client,
  tenancyId: string,
): Promise<RepositoryResult<TenancyParticipantRecord[]>> {
  const result = await fromResult<TenancyParticipant[]>(
    client
      .from("tenancy_participants")
      .select("*")
      .eq("tenancy_id", tenancyId)
      .order("role"),
  );
  if (!result.ok) return result;
  return { ok: true, data: result.data.map(toParticipantRecord) };
}

/**
 * Participant rows for every tenancy the caller can see — one query instead
 * of N per list item. RLS narrows the table to the caller's tenancies, so
 * this can never leak other people's participant lists.
 */
export async function listVisibleParticipants(
  client: Client,
): Promise<RepositoryResult<TenancyParticipantRecord[]>> {
  const result = await fromResult<TenancyParticipant[]>(
    client.from("tenancy_participants").select("*").order("tenancy_id"),
  );
  if (!result.ok) return result;
  return { ok: true, data: result.data.map(toParticipantRecord) };
}

export type CreateTenancyWithInvitationInput = {
  startDate: string;
  endDate?: string | null;
  monthlyRent: number;
  deposit: number;
  tenantEmail: string;
  tenantWallet?: string | null;
  /** Use an existing property the caller created… */
  propertyId?: string | null;
  /** …or describe a new one, created in the same transaction. */
  property?: {
    addressLine1: string;
    addressLine2?: string | null;
    city: string;
    county?: string | null;
    postalCode?: string | null;
    country?: string;
    propertyType: string;
    bedrooms?: number | null;
  };
  currency?: string;
};

export type CreatedTenancy = {
  tenancyId: string;
  propertyId: string;
  /** Raw bearer token of the invitation link, shown once to the landlord. */
  invitationToken: string;
};

function asRecord(data: Json): Record<string, Json> | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return null;
  }
  return data as Record<string, Json>;
}

/**
 * Creates the tenancy and its first invitation in one transaction (Phase 4).
 *
 * The tenancy enters the world as `awaiting_tenant` with no tenant — only
 * `accept_tenancy_invitation` ever assigns one. Returns the ids plus the raw
 * invitation token so the review screen can hand the link to the landlord.
 */
export async function createTenancyWithInvitation(
  client: Client,
  input: CreateTenancyWithInvitationInput,
): Promise<RepositoryResult<CreatedTenancy>> {
  const property = input.property;

  const result = await fromResult<Json>(
    client.rpc("create_tenancy_with_invitation", {
      p_start_date: input.startDate,
      ...(input.endDate ? { p_end_date: input.endDate } : {}),
      p_monthly_rent: input.monthlyRent,
      p_deposit: input.deposit,
      p_tenant_email: input.tenantEmail,
      ...(input.tenantWallet ? { p_tenant_wallet: input.tenantWallet } : {}),
      ...(input.propertyId ? { p_property_id: input.propertyId } : {}),
      ...(property
        ? {
            p_property: {
              address_line_1: property.addressLine1,
              address_line_2: property.addressLine2 ?? null,
              city: property.city,
              county: property.county ?? null,
              postal_code: property.postalCode ?? null,
              country: property.country ?? "IE",
              property_type: property.propertyType,
              bedrooms: property.bedrooms ?? null,
            },
          }
        : {}),
      p_currency: input.currency ?? "EUR",
    }),
  );
  if (!result.ok) return result;

  const raw = asRecord(result.data);
  const tenancyId = raw && typeof raw.tenancy_id === "string" ? raw.tenancy_id : "";
  const propertyId =
    raw && typeof raw.property_id === "string" ? raw.property_id : "";
  const invitationToken =
    raw && typeof raw.invitation_token === "string" ? raw.invitation_token : "";

  if (!tenancyId || !propertyId || !invitationToken) {
    return {
      ok: false,
      error: { code: "unknown", message: "The tenancy was not created." },
    };
  }

  return { ok: true, data: { tenancyId, propertyId, invitationToken } };
}

/**
 * Moves a tenancy through its lifecycle. Contract fields are frozen by a
 * database trigger once the tenancy leaves `draft`/`awaiting_tenant`.
 */
export async function updateTenancyStatus(
  client: Client,
  id: string,
  status: string,
): Promise<RepositoryResult<TenancyRecord>> {
  const result = await fromResult<Tenancy[]>(
    client.from("tenancies").update({ status }).eq("id", id).select("*"),
    { emptyAsMissing: true },
  );
  if (!result.ok) return result;
  return { ok: true, data: toTenancyRecord(result.data[0]) };
}
