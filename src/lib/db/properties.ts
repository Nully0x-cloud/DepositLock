import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Property } from "@/types/database";
import type { RepositoryResult } from "./errors";
import { fromResult } from "./from-result";
import type { PropertyRecord } from "./models";

type Client = SupabaseClient<Database>;

export function toPropertyRecord(row: Property): PropertyRecord {
  return {
    id: row.id,
    createdByProfileId: row.created_by_profile_id,
    addressLine1: row.address_line_1,
    addressLine2: row.address_line_2,
    city: row.city,
    county: row.county,
    postalCode: row.postal_code,
    country: row.country,
    propertyType: row.property_type,
    coverImageUrl: row.cover_image_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Properties the caller created plus those tied to their tenancies. */
export async function listPropertiesForViewer(
  client: Client,
): Promise<RepositoryResult<PropertyRecord[]>> {
  const result = await fromResult<Property[]>(
    client.from("properties").select("*").order("created_at", { ascending: false }),
  );
  if (!result.ok) return result;
  return { ok: true, data: result.data.map(toPropertyRecord) };
}

export async function getPropertyById(
  client: Client,
  id: string,
): Promise<RepositoryResult<PropertyRecord>> {
  const result = await fromResult<Property>(
    client.from("properties").select("*").eq("id", id).single(),
  );
  if (!result.ok) return result;
  return { ok: true, data: toPropertyRecord(result.data) };
}

export type CreatePropertyInput = {
  createdByProfileId: string;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  county?: string | null;
  postalCode?: string | null;
  country?: string;
  propertyType: string;
  coverImageUrl?: string | null;
};

export async function createProperty(
  client: Client,
  input: CreatePropertyInput,
): Promise<RepositoryResult<PropertyRecord>> {
  const result = await fromResult<Property[]>(
    client
      .from("properties")
      .insert({
        created_by_profile_id: input.createdByProfileId,
        address_line_1: input.addressLine1.trim(),
        address_line_2: input.addressLine2 ?? null,
        city: input.city.trim(),
        county: input.county ?? null,
        postal_code: input.postalCode ?? null,
        country: input.country ?? "IE",
        property_type: input.propertyType,
        cover_image_url: input.coverImageUrl ?? null,
      })
      .select("*"),
  );
  if (!result.ok) return result;
  const row = result.data[0];
  if (!row) return { ok: false, error: { code: "unknown", message: "The property was not created." } };
  return { ok: true, data: toPropertyRecord(row) };
}
