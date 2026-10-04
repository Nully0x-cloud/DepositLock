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

export type CreateDeductionInput = {
  tenancyId: string;
  proposedByProfileId: string;
  amount: number;
  reasonCategory: string;
  description: string;
};

/**
 * Landlord-only. The database rejects an amount above the deposit and a
 * proposer who is not the tenancy landlord — this maps that failure to
 * `validation` rather than leaking the constraint name.
 */
export async function createDeduction(
  client: Client,
  input: CreateDeductionInput,
): Promise<RepositoryResult<DeductionRecord>> {
  const result = await fromResult<Deduction[]>(
    client
      .from("deductions")
      .insert({
        tenancy_id: input.tenancyId,
        proposed_by_profile_id: input.proposedByProfileId,
        amount: input.amount,
        reason_category: input.reasonCategory,
        description: input.description.trim(),
      })
      .select("*"),
  );
  if (!result.ok) return result;
  const row = result.data[0];
  if (!row) return { ok: false, error: { code: "unknown", message: "The deduction was not recorded." } };
  return { ok: true, data: toDeductionRecord(row) };
}

/**
 * Accept / challenge (tenant) or amend / withdraw (landlord). Which of those
 * is permitted is decided by the `guard_deduction` trigger; this repository
 * only reports the outcome.
 */
export async function updateDeductionStatus(
  client: Client,
  id: string,
  status: DeductionRecord["status"],
): Promise<RepositoryResult<DeductionRecord>> {
  const result = await fromResult<Deduction[]>(
    client.from("deductions").update({ status }).eq("id", id).select("*"),
    { emptyAsMissing: true },
  );
  if (!result.ok) return result;
  return { ok: true, data: toDeductionRecord(result.data[0]) };
}
