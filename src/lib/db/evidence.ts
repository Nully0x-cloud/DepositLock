import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Evidence } from "@/types/database";
import type { RepositoryResult } from "./errors";
import { fromResult } from "./from-result";
import type { EvidenceRecord } from "./models";

type Client = SupabaseClient<Database>;

export function toEvidenceRecord(row: Evidence): EvidenceRecord {
  return {
    id: row.id,
    tenancyId: row.tenancy_id,
    uploadedByProfileId: row.uploaded_by_profile_id,
    evidenceContext: row.evidence_context as EvidenceRecord["evidenceContext"],
    deductionId: row.deduction_id,
    category: row.category,
    fileUrl: row.file_url,
    caption: row.caption,
    createdAt: row.created_at,
  };
}

/** Evidence for a tenancy. RLS limits this to participants. */
export async function listEvidenceByTenancy(
  client: Client,
  tenancyId: string,
): Promise<RepositoryResult<EvidenceRecord[]>> {
  const result = await fromResult<Evidence[]>(
    client
      .from("evidence")
      .select("*")
      .eq("tenancy_id", tenancyId)
      .order("created_at", { ascending: false }),
  );
  if (!result.ok) return result;
  return { ok: true, data: result.data.map(toEvidenceRecord) };
}

export type CreateEvidenceInput = {
  tenancyId: string;
  uploadedByProfileId: string;
  evidenceContext: EvidenceRecord["evidenceContext"];
  category: string;
  caption: string;
  fileUrl?: string | null;
  deductionId?: string | null;
};

export async function createEvidence(
  client: Client,
  input: CreateEvidenceInput,
): Promise<RepositoryResult<EvidenceRecord>> {
  const result = await fromResult<Evidence[]>(
    client
      .from("evidence")
      .insert({
        tenancy_id: input.tenancyId,
        uploaded_by_profile_id: input.uploadedByProfileId,
        evidence_context: input.evidenceContext,
        deduction_id: input.deductionId ?? null,
        category: input.category,
        file_url: input.fileUrl ?? null,
        caption: input.caption.trim(),
      })
      .select("*"),
  );
  if (!result.ok) return result;
  const row = result.data[0];
  if (!row) return { ok: false, error: { code: "unknown", message: "The evidence was not recorded." } };
  return { ok: true, data: toEvidenceRecord(row) };
}
