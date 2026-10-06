import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json, TenancyInvitation } from "@/types/database";
import { repositoryError, type RepositoryResult } from "./errors";
import { fromResult } from "./from-result";
import type { InvitationRecord } from "./models";

type Client = SupabaseClient<Database>;

export function toInvitationRecord(row: TenancyInvitation): InvitationRecord {
  return {
    id: row.id,
    tenancyId: row.tenancy_id,
    invitedByProfileId: row.invited_by_profile_id,
    email: row.email,
    walletAddress: row.wallet_address,
    token: row.token,
    status: row.status as InvitationRecord["status"],
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    acceptedByProfileId: row.accepted_by_profile_id,
  };
}

/** What the public /invite/<token> page may see before anyone signs in. */
export type InvitationPreview = {
  invitationStatus: string;
  expiresAt: string;
  landlordName: string;
  property: {
    addressLine1: string;
    city: string;
    county: string | null;
    postalCode: string | null;
    propertyType: string;
    bedrooms: number | null;
  };
  terms: {
    startDate: string;
    endDate: string | null;
    monthlyRent: number;
    deposit: number;
    currency: string;
  };
};

/** The outcome of issuing (or re-issuing) an invitation. */
export type IssuedInvitation = {
  invitationId: string;
  invitationToken: string;
};

export type InvitationOutcome = {
  invitationId: string;
  status: string;
};

function asObject(data: Json): Record<string, Json> | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return null;
  }
  return data as Record<string, Json>;
}

function asString(value: Json | undefined, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: Json | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: Json | undefined, fallback = 0): number {
  return typeof value === "number" ? value : fallback;
}

function asNullableNumber(value: Json | undefined): number | null {
  return typeof value === "number" ? value : null;
}

function issuedFrom(data: Json): RepositoryResult<IssuedInvitation> {
  const raw = asObject(data);
  const invitationId = raw ? asString(raw.invitation_id) : "";
  if (!invitationId) {
    return { ok: false, error: repositoryError("unknown") };
  }
  return {
    ok: true,
    data: { invitationId, invitationToken: asString(raw?.invitation_token) },
  };
}

function outcomeFrom(data: Json): RepositoryResult<InvitationOutcome> {
  const raw = asObject(data);
  const invitationId = raw ? asString(raw.invitation_id) : "";
  if (!invitationId) {
    return { ok: false, error: repositoryError("unknown") };
  }
  return {
    ok: true,
    data: { invitationId, status: asString(raw?.status) },
  };
}

/**
 * Invitations of a tenancy. RLS narrows the table to invitations of tenancies
 * the caller landlords — everyone else simply gets an empty list.
 */
export async function listInvitationsForTenancy(
  client: Client,
  tenancyId: string,
): Promise<RepositoryResult<InvitationRecord[]>> {
  const result = await fromResult<TenancyInvitation[]>(
    client
      .from("tenancy_invitations")
      .select("*")
      .eq("tenancy_id", tenancyId)
      .order("created_at", { ascending: false }),
  );
  if (!result.ok) return result;
  return { ok: true, data: result.data.map(toInvitationRecord) };
}

/**
 * Public preview for the invite page: no session required, no e-mail
 * addresses and no tenancy id — only what the invitee needs to recognise
 * the tenancy they are being asked to accept.
 */
export async function resolveInvitation(
  client: Client,
  token: string,
): Promise<RepositoryResult<InvitationPreview>> {
  const result = await fromResult<Json>(
    client.rpc("resolve_tenancy_invitation", { p_token: token }),
  );
  if (!result.ok) return result;

  const raw = asObject(result.data);
  const property = raw ? asObject(raw.property) : null;
  const terms = raw ? asObject(raw.terms) : null;
  if (!raw || typeof raw.invitation_status !== "string" || !property || !terms) {
    return { ok: false, error: repositoryError("not_found") };
  }

  return {
    ok: true,
    data: {
      invitationStatus: raw.invitation_status,
      expiresAt: asString(raw.expires_at),
      landlordName: asString(raw.landlord_name, "Your landlord"),
      property: {
        addressLine1: asString(property.address_line_1),
        city: asString(property.city),
        county: asNullableString(property.county),
        postalCode: asNullableString(property.postal_code),
        propertyType: asString(property.property_type),
        bedrooms: asNullableNumber(property.bedrooms),
      },
      terms: {
        startDate: asString(terms.start_date),
        endDate: asNullableString(terms.end_date),
        monthlyRent: asNumber(terms.monthly_rent),
        deposit: asNumber(terms.deposit),
        currency: asString(terms.currency, "EUR"),
      },
    },
  };
}

/** Accepts the invitation and assigns the tenant (see the RPC). */
export async function acceptInvitation(
  client: Client,
  token: string,
): Promise<RepositoryResult<{ tenancyId: string }>> {
  const result = await fromResult<Json>(
    client.rpc("accept_tenancy_invitation", { p_token: token }),
  );
  if (!result.ok) return result;

  const raw = asObject(result.data);
  const tenancyId = raw ? asString(raw.tenancy_id) : "";
  if (!tenancyId) return { ok: false, error: repositoryError("unknown") };
  return { ok: true, data: { tenancyId } };
}

/** Declines the invitation; the tenancy itself is left untouched. */
export async function declineInvitation(
  client: Client,
  token: string,
): Promise<RepositoryResult<InvitationOutcome>> {
  const result = await fromResult<Json>(
    client.rpc("decline_tenancy_invitation", { p_token: token }),
  );
  if (!result.ok) return result;
  return outcomeFrom(result.data);
}

/** Landlord-only: withdraws a pending invitation. */
export async function cancelTenancyInvitation(
  client: Client,
  invitationId: string,
): Promise<RepositoryResult<InvitationOutcome>> {
  const result = await fromResult<Json>(
    client.rpc("cancel_tenancy_invitation", { p_invitation_id: invitationId }),
  );
  if (!result.ok) return result;
  return outcomeFrom(result.data);
}

/** Landlord-only: issues a fresh token while the tenancy waits for a tenant. */
export async function createTenancyInvitation(
  client: Client,
  input: { tenancyId: string; email?: string | null; wallet?: string | null },
): Promise<RepositoryResult<IssuedInvitation>> {
  const result = await fromResult<Json>(
    client.rpc("create_tenancy_invitation", {
      p_tenancy_id: input.tenancyId,
      ...(input.email ? { p_tenant_email: input.email } : {}),
      ...(input.wallet ? { p_tenant_wallet: input.wallet } : {}),
    }),
  );
  if (!result.ok) return result;
  return issuedFrom(result.data);
}
