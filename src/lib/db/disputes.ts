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

export type CreateDisputeInput = {
  tenancyId: string;
  deductionId: string;
  openedByProfileId: string;
  reason: string;
};

/**
 * Only participants may open one, and only against a `challenged` deduction —
 * both enforced by the `guard_dispute` trigger. A second active dispute for
 * the same deduction is rejected by a partial unique index.
 */
export async function createDispute(
  client: Client,
  input: CreateDisputeInput,
): Promise<RepositoryResult<DisputeRecord>> {
  const result = await fromResult<Dispute[]>(
    client
      .from("disputes")
      .insert({
        tenancy_id: input.tenancyId,
        deduction_id: input.deductionId,
        opened_by_profile_id: input.openedByProfileId,
        reason: input.reason.trim(),
      })
      .select("*"),
  );
  if (!result.ok) return result;
  const row = result.data[0];
  if (!row) return { ok: false, error: { code: "unknown", message: "The dispute was not opened." } };
  return { ok: true, data: toDisputeRecord(row) };
}

export async function updateDisputeStatus(
  client: Client,
  id: string,
  patch: {
    status: DisputeRecord["status"];
    resolutionNotes?: string | null;
    resolvedByProfileId?: string | null;
  },
): Promise<RepositoryResult<DisputeRecord>> {
  const payload: Partial<Dispute> = { status: patch.status };
  if (patch.resolutionNotes !== undefined) payload.resolution_notes = patch.resolutionNotes;
  if (patch.resolvedByProfileId !== undefined) {
    payload.resolved_by_profile_id = patch.resolvedByProfileId;
  }

  const result = await fromResult<Dispute[]>(
    client.from("disputes").update(payload).eq("id", id).select("*"),
    { emptyAsMissing: true },
  );
  if (!result.ok) return result;
  return { ok: true, data: toDisputeRecord(result.data[0]) };
}
