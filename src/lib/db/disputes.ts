import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Dispute } from "@/types/database";
import type { RepositoryResult } from "./errors";
import { fromResult } from "./from-result";
import type { DisputeRecord } from "./models";

type Client = SupabaseClient<Database>;

export function toDisputeRecord(row: Dispute): DisputeRecord {
  return {
    id: row.id,
    tenancyId: row.tenancy_id,
    deductionId: row.deduction_id,
    openedByProfileId: row.opened_by_profile_id,
    reason: row.reason,
    status: row.status as DisputeRecord["status"],
    resolutionNotes: row.resolution_notes,
    resolvedByProfileId: row.resolved_by_profile_id,
    openedAt: row.opened_at,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listDisputesByTenancy(
  client: Client,
  tenancyId: string,
): Promise<RepositoryResult<DisputeRecord[]>> {
  const result = await fromResult<Dispute[]>(
    client
      .from("disputes")
      .select("*")
      .eq("tenancy_id", tenancyId)
      .order("opened_at", { ascending: false }),
  );
  if (!result.ok) return result;
  return { ok: true, data: result.data.map(toDisputeRecord) };
}

/** No browser-side write API: a dispute is recorded only after the program
 * has placed the agreement into its non-executable Disputed state. */
