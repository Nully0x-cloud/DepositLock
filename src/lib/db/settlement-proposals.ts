import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, SettlementProposal } from "@/types/database";
import type { RepositoryResult } from "./errors";
import { fromResult } from "./from-result";
import type { SettlementProposalRecord } from "./models";

type Client = SupabaseClient<Database>;

export function toSettlementProposalRecord(
  row: SettlementProposal,
): SettlementProposalRecord {
  return {
    id: row.id,
    tenancyId: row.tenancy_id,
    agreementAddress: row.agreement_address,
    proposalAddress: row.proposal_address,
    proposalVersion: row.proposal_version,
    settlementType: row.settlement_type as SettlementProposalRecord["settlementType"],
    originalDepositAmount: row.original_deposit_amount,
    tenantAmount: row.tenant_amount,
    landlordAmount: row.landlord_amount,
    settledTenantAmount: row.settled_tenant_amount,
    settledLandlordAmount: row.settled_landlord_amount,
    termsHash: row.terms_hash,
    evidenceIds: row.evidence_ids,
    metadataVerified: row.metadata_verified,
    proposedByProfileId: row.proposed_by_profile_id,
    deductionId: row.deduction_id,
    status: row.status as SettlementProposalRecord["status"],
    proposalSignature: row.proposal_signature,
    withdrawalSignature: row.withdrawal_signature,
    challengeSignature: row.challenge_signature,
    executionSignature: row.execution_signature,
    challengeReason: row.challenge_reason,
    disputeId: row.dispute_id,
    proposedAt: row.proposed_at,
    respondedAt: row.responded_at,
    executedAt: row.executed_at,
    verifiedAt: row.verified_at,
  };
}

/** Participant-readable proposal history; no client write helpers exist. */
export async function listSettlementProposalsByTenancy(
  client: Client,
  tenancyId: string,
): Promise<RepositoryResult<SettlementProposalRecord[]>> {
  const result = await fromResult<SettlementProposal[]>(
    client
      .from("settlement_proposals")
      .select("*")
      .eq("tenancy_id", tenancyId)
      .order("proposal_version", { ascending: false }),
  );
  if (!result.ok) return result;
  return { ok: true, data: result.data.map(toSettlementProposalRecord) };
}
