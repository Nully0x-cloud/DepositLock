import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Deduction } from "@/types/database";
import type { RepositoryResult } from "./errors";
import { fromResult } from "./from-result";
import type { DeductionRecord } from "./models";

type Client = SupabaseClient<Database>;

export function toDeductionRecord(row: Deduction): DeductionRecord {
  return {
    id: row.id,
    tenancyId: row.tenancy_id,
    proposedByProfileId: row.proposed_by_profile_id,
    amount: row.amount,
    reasonCategory: row.reason_category,
    description: row.description,
    status: row.status as DeductionRecord["status"],
    createdAt: row.created_at,
    respondedAt: row.responded_at,
    updatedAt: row.updated_at,
  };
}

export async function listDeductionsByTenancy(
  client: Client,
  tenancyId: string,
): Promise<RepositoryResult<DeductionRecord[]>> {
  const result = await fromResult<Deduction[]>(
    client
      .from("deductions")
      .select("*")
      .eq("tenancy_id", tenancyId)
      .order("created_at", { ascending: false }),
  );
  if (!result.ok) return result;
  return { ok: true, data: result.data.map(toDeductionRecord) };
}

/** No browser-side write API: proposals and responses are mirrored only by
 * the settlement reconcile server after the chain is independently checked. */
