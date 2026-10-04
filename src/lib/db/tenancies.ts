import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Property, Tenancy, TenancyParticipant } from "@/types/database";
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

export type CreateTenancyInput = {
  propertyId: string;
  landlordProfileId: string;
  tenantProfileId: string;
  startDate: string;
  endDate?: string | null;
  monthlyRentAmount: number;
  depositAmount: number;
  displayCurrency?: string;
  settlementToken?: string | null;
  status?: string;
};

/**
 * Creates the tenancy. The `sync_tenancy_participants` trigger derives the
 * participant rows, so callers only ever state the contract once.
 */
export async function createTenancy(
  client: Client,
  input: CreateTenancyInput,
): Promise<RepositoryResult<TenancyRecord>> {
  const result = await fromResult<Tenancy[]>(
    client
      .from("tenancies")
      .insert({
        property_id: input.propertyId,
        landlord_profile_id: input.landlordProfileId,
        tenant_profile_id: input.tenantProfileId,
        start_date: input.startDate,
        end_date: input.endDate ?? null,
        monthly_rent_amount: input.monthlyRentAmount,
        deposit_amount: input.depositAmount,
        display_currency: input.displayCurrency ?? "EUR",
        settlement_token: input.settlementToken ?? null,
        status: input.status ?? "draft",
      })
      .select("*"),
  );
  if (!result.ok) return result;
  const row = result.data[0];
  if (!row) return { ok: false, error: { code: "unknown", message: "The tenancy was not created." } };
  return { ok: true, data: toTenancyRecord(row) };
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
