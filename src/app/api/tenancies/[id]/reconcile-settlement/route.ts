import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, SettlementProposal } from "@/types/database";
import { depositAmountToBaseUnits } from "@/lib/solana/amounts";
import { SOLANA_CLUSTER } from "@/lib/solana/config";
import { getSolanaConnection } from "@/lib/solana/connection";
import { fetchDepositAgreement, fetchDepositConfig, fetchTokenBalance } from "@/lib/solana/deposit";
import {
  DEPOSIT_LOCK_MINT_ADDRESS,
  DEPOSIT_LOCK_MINT_DECIMALS,
} from "@/lib/solana/deployment";
import {
  findDepositAgreementPda,
  findSettlementProposalPda,
  getAssociatedTokenAddressSync,
  tenancyIdToBytes,
} from "@/lib/solana/program";
import { authorizeSettlementRequest } from "@/lib/tenancy/settlement-route.server";
import { fetchSettlementProposal } from "@/lib/solana/settlement";
import { hashSettlementTerms, settlementTermsHashHex } from "@/lib/solana/settlement-terms";
import { isTransactableCluster } from "@/lib/solana/transactions";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASON_CATEGORIES = new Set([
  "damage",
  "missing_items",
  "cleaning",
  "unpaid_rent",
  "utilities",
  "other",
]);

type SettlementIntent = "proposal" | "withdrawal" | "challenge" | "refresh";
type RequestBody = {
  intent?: SettlementIntent;
  settlementType?: "full_return" | "partial_deduction";
  reasonCategory?: string;
  description?: string;
  evidenceIds?: string[];
  challengeReason?: string;
  challengeEvidenceIds?: string[];
};

function response(status: number, body: Record<string, unknown>): NextResponse {
  return NextResponse.json(body, { status });
}

async function verifyRecordedProposalTerms(
  service: SupabaseClient<Database>,
  tenancyId: string,
  agreement: NonNullable<Awaited<ReturnType<typeof fetchDepositAgreement>>>,
  proposal: NonNullable<Awaited<ReturnType<typeof fetchSettlementProposal>>>,
  recorded: SettlementProposal,
  landlordProfileId: string,
): Promise<boolean> {
  if (
    recorded.agreement_address !== agreement.address.toBase58() ||
    recorded.proposal_address !== proposal.address.toBase58() ||
    recorded.proposal_version !== Number(proposal.proposalVersion) ||
    recorded.settlement_type !== proposal.proposalType ||
    BigInt(String(recorded.original_deposit_amount)) !== agreement.depositedAmount ||
    BigInt(String(recorded.landlord_amount)) !== proposal.landlordAmount ||
    BigInt(String(recorded.tenant_amount)) !== proposal.tenantAmount ||
    recorded.terms_hash !== proposal.termsHash ||
    recorded.proposed_by_profile_id !== landlordProfileId
  ) {
    return false;
  }

  if (!recorded.metadata_verified) {
    return recorded.status === "challenged" &&
      recorded.challenge_signature !== null &&
      recorded.dispute_id !== null;
  }

  let reasonCategory: string | null = null;
  let description: string | null = null;
  if (recorded.deduction_id) {
    const { data, error } = await service
      .from("deductions")
      .select("reason_category,description")
      .eq("id", recorded.deduction_id)
      .eq("tenancy_id", tenancyId)
      .maybeSingle();
    if (error || !data) return false;
    reasonCategory = data.reason_category;
    description = data.description;
  }
  if (recorded.evidence_ids.length > 0) {
    const { data, error } = await service
      .from("evidence")
      .select("id")
      .eq("tenancy_id", tenancyId)
      .in("id", recorded.evidence_ids);
    if (error || (data?.length ?? 0) !== recorded.evidence_ids.length) return false;
  }
  const hash = await hashSettlementTerms({
    tenancyId,
    settlementType: proposal.proposalType,
    landlordAmount: proposal.landlordAmount,
    reasonCategory,
    description,
    evidenceIds: recorded.evidence_ids,
  });
  return settlementTermsHashHex(hash) === proposal.termsHash;
}

async function readBody(request: Request): Promise<RequestBody> {
  try {
    const value = (await request.json()) as RequestBody;
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return response(400, { error: "Invalid tenancy id." });
  if (!isTransactableCluster(SOLANA_CLUSTER) || !DEPOSIT_LOCK_MINT_ADDRESS) {
    return response(409, { error: "Settlement is available only for the configured Devnet deployment." });
  }

  const authorized = await authorizeSettlementRequest(request, id);
  if (!authorized.ok) return response(authorized.status, { error: authorized.message });
  const { context } = authorized;
  const body = await readBody(request);
  const intent = body.intent ?? "refresh";

  if (![
    "proposal",
    "withdrawal",
    "challenge",
    "refresh",
  ].includes(intent)) {
    return response(400, { error: "Unknown settlement reconciliation intent." });
  }

  const tenancyBytes = tenancyIdToBytes(id);
  const connection = getSolanaConnection();
  let agreement;
  let config;
  let proposal;
  let vaultBalance;
  try {
    [agreement, config, proposal] = await Promise.all([
      fetchDepositAgreement(connection, tenancyBytes),
      fetchDepositConfig(connection),
      fetchSettlementProposal(connection, tenancyBytes),
    ]);
    if (agreement) {
      vaultBalance = await fetchTokenBalance(
        connection,
        agreement.address,
        agreement.mint,
      );
    }
  } catch {
    return response(502, { tenancy_id: id, error: "The chain is unreachable right now." });
  }

  if (!agreement || !proposal) {
    return response(409, {
      tenancy_id: id,
      error: "No on-chain settlement proposal exists for this agreement.",
    });
  }

  const [expectedAgreement] = findDepositAgreementPda(tenancyBytes);
  const [expectedProposal] = findSettlementProposalPda(agreement.address);
  const expectedVault = getAssociatedTokenAddressSync(agreement.mint, agreement.address);
  let expectedDeposit: bigint;
  try {
    expectedDeposit = depositAmountToBaseUnits(
      context.tenancy.deposit_amount,
      DEPOSIT_LOCK_MINT_DECIMALS,
    );
  } catch {
    return response(409, { tenancy_id: id, error: "The tenancy deposit amount is invalid." });
  }
  if (
    !agreement.address.equals(expectedAgreement) ||
    !agreement.vault.equals(expectedVault) ||
    !proposal.address.equals(expectedProposal) ||
    agreement.tenancyId.toLowerCase() !== id.toLowerCase() ||
    agreement.landlord.toBase58() !== context.landlordWallet ||
    agreement.tenant.toBase58() !== context.tenantWallet ||
    agreement.mint.toBase58() !== DEPOSIT_LOCK_MINT_ADDRESS ||
    agreement.requiredAmount !== expectedDeposit ||
    agreement.depositedAmount !== expectedDeposit ||
    !config ||
    config.allowedMint.toBase58() !== DEPOSIT_LOCK_MINT_ADDRESS ||
    config.allowedDecimals !== DEPOSIT_LOCK_MINT_DECIMALS ||
    !proposal.agreement.equals(agreement.address) ||
    proposal.tenancyId.toLowerCase() !== id.toLowerCase() ||
    !proposal.landlord.equals(agreement.landlord) ||
    !proposal.tenant.equals(agreement.tenant) ||
    !proposal.proposer.equals(agreement.landlord) ||
    proposal.landlordAmount + proposal.tenantAmount !== agreement.depositedAmount
  ) {
    return response(409, { tenancy_id: id, error: "On-chain settlement does not match this tenancy." });
  }

  const terminal = agreement.status === "closed" && proposal.status === "executed";
  if (terminal) {
    if (!vaultBalance || vaultBalance.amount !== BigInt(0)) {
      return response(409, { tenancy_id: id, error: "Closed agreement still has a non-zero vault balance." });
    }
    if (
      proposal.settledLandlordAmount !== proposal.landlordAmount ||
      proposal.settledTenantAmount < proposal.tenantAmount ||
      proposal.settledTenantAmount + proposal.settledLandlordAmount < agreement.depositedAmount
    ) {
      return response(409, { tenancy_id: id, error: "Final payouts differ from the approved settlement." });
    }
  } else if (!vaultBalance || vaultBalance.amount < agreement.depositedAmount) {
    return response(409, { tenancy_id: id, error: "Vault balance is below the protected deposit." });
  }

  let signatures;
  try {
    signatures = await connection.getSignaturesForAddress(proposal.address, { limit: 128 });
  } catch {
    return response(502, { tenancy_id: id, error: "Could not read settlement transactions." });
  }
  const successfulSignatures = signatures.filter((entry) => entry.err === null);
  const latestSignature = successfulSignatures[0]?.signature;
  if (!latestSignature) {
    return response(502, { tenancy_id: id, error: "Settlement transaction history is missing." });
  }

  const service = context.service;
  const { data: recorded, error: queryError } = await service
    .from("settlement_proposals")
    .select("*")
    .eq("tenancy_id", id)
    .eq("proposal_version", Number(proposal.proposalVersion))
    .maybeSingle();
  if (queryError) return response(500, { tenancy_id: id, error: "Could not read settlement metadata." });
  const recordedMatches = recorded
    ? await verifyRecordedProposalTerms(
        service,
        id,
        agreement,
        proposal,
        recorded,
        context.tenancy.landlord_profile_id,
      )
    : false;

  if (agreement.status === "settlement_proposed" && proposal.status === "active") {
    const chainType = proposal.proposalType;
    if (recorded) {
      if (!recordedMatches || recorded.status !== "proposed") {
        return response(409, { tenancy_id: id, error: "Recorded terms differ from the active on-chain proposal." });
      }
      return response(200, {
        tenancy_id: id,
        state: "settlement_proposed",
        proposal: recorded,
        agreement_address: agreement.address.toBase58(),
        proposal_address: proposal.address.toBase58(),
      });
    }

    const fullReturnRefresh = chainType === "full_return" && intent === "refresh";
    if ((!fullReturnRefresh && intent !== "proposal") ||
        (!fullReturnRefresh && context.userId !== context.tenancy.landlord_profile_id)) {
      return response(409, {
        tenancy_id: id,
        error: "Settlement proposal metadata must be verified by the landlord who submitted it.",
      });
    }
    if (body.settlementType && body.settlementType !== chainType) {
      return response(409, { tenancy_id: id, error: "Submitted settlement type differs from the on-chain terms." });
    }
    if (!body.settlementType && !fullReturnRefresh) {
      return response(400, { tenancy_id: id, error: "Settlement type is required for proposal reconciliation." });
    }

    let evidenceIds = body.evidenceIds ?? [];
    let reasonCategory: string | null = null;
    let description: string | null = null;
    if (chainType === "partial_deduction") {
      reasonCategory = body.reasonCategory?.trim() ?? "";
      description = body.description?.trim() ?? "";
      if (!REASON_CATEGORIES.has(reasonCategory) || description.length < 3 || description.length > 1000) {
        return response(400, { tenancy_id: id, error: "Provide a valid deduction reason and description." });
      }
      if (!Array.isArray(evidenceIds) || evidenceIds.some((value) => !UUID_PATTERN.test(value))) {
        return response(400, { tenancy_id: id, error: "Evidence references must be valid tenancy evidence IDs." });
      }
    } else {
      evidenceIds = [];
      if (body.reasonCategory || body.description || (body.evidenceIds?.length ?? 0) > 0) {
        return response(400, { tenancy_id: id, error: "Full return proposals do not include a deduction." });
      }
    }

    let termsHash: string;
    try {
      termsHash = settlementTermsHashHex(await hashSettlementTerms({
        tenancyId: id,
        settlementType: chainType,
        landlordAmount: proposal.landlordAmount,
        reasonCategory,
        description,
        evidenceIds,
      }));
    } catch {
      return response(500, { tenancy_id: id, error: "Could not verify the proposal metadata." });
    }
    if (termsHash !== proposal.termsHash) {
      return response(409, { tenancy_id: id, error: "Proposal metadata does not match the on-chain terms commitment." });
    }

    const { data, error: rpcError } = await service.rpc("record_settlement_proposal", {
      p_tenancy_id: id,
      p_landlord_profile_id: context.tenancy.landlord_profile_id,
      p_agreement_address: agreement.address.toBase58(),
      p_proposal_address: proposal.address.toBase58(),
      p_proposal_version: Number(proposal.proposalVersion),
      p_settlement_type: chainType,
      p_original_amount: agreement.depositedAmount.toString() as unknown as number,
      p_landlord_amount: proposal.landlordAmount.toString() as unknown as number,
      p_tenant_amount: proposal.tenantAmount.toString() as unknown as number,
      p_decimals: DEPOSIT_LOCK_MINT_DECIMALS,
      p_terms_hash: termsHash,
      p_proposal_signature: latestSignature,
      p_reason_category: reasonCategory ?? undefined,
      p_description: description ?? undefined,
      p_evidence_ids: evidenceIds,
    });
    if (rpcError) {
      const status = rpcError.code === "P0001" || rpcError.code === "23514" ? 409 : 500;
      return response(status, { tenancy_id: id, error: rpcError.message });
    }
    return response(200, {
      tenancy_id: id,
      state: "settlement_proposed",
      proposal: data,
      agreement_address: agreement.address.toBase58(),
      proposal_address: proposal.address.toBase58(),
    });
  }

  if (agreement.status === "funded" && proposal.status === "withdrawn") {
    if (!recorded || !recordedMatches) {
      return response(409, { tenancy_id: id, error: "Withdrawn on-chain proposal has no verified proposal record." });
    }
    const { error: rpcError } = await service.rpc("record_settlement_withdrawal", {
      p_tenancy_id: id,
      p_landlord_profile_id: context.tenancy.landlord_profile_id,
      p_proposal_version: Number(proposal.proposalVersion),
      p_withdrawal_signature: latestSignature,
    });
    if (rpcError) return response(409, { tenancy_id: id, error: rpcError.message });
    return response(200, { tenancy_id: id, state: "proposal_withdrawn", proposal_version: Number(proposal.proposalVersion) });
  }

  if (agreement.status === "disputed" && proposal.status === "challenged") {
    if (recorded && !recordedMatches) {
      return response(409, { tenancy_id: id, error: "Recorded terms differ from the challenged on-chain proposal." });
    }
    if (recorded?.status === "challenged") {
      return response(200, { tenancy_id: id, state: "disputed", proposal: recorded });
    }
    if (intent !== "challenge" || context.userId !== context.tenancy.tenant_profile_id) {
      return response(409, {
        tenancy_id: id,
        error: "The tenant must provide the challenge explanation to reconcile this on-chain freeze.",
      });
    }
    const reason = body.challengeReason?.trim() ?? "";
    const evidenceIds = body.challengeEvidenceIds ?? [];
    if (reason.length < 3 || reason.length > 1000 || !Array.isArray(evidenceIds) || evidenceIds.some((value) => !UUID_PATTERN.test(value))) {
      return response(400, { tenancy_id: id, error: "Provide a challenge explanation and valid evidence references." });
    }
    const proposalSignature = recorded?.proposal_signature ?? successfulSignatures[1]?.signature;
    if (!proposalSignature) {
      return response(502, { tenancy_id: id, error: "The proposal transaction could not be recovered from chain history." });
    }
    const { data, error: rpcError } = await service.rpc("record_settlement_dispute", {
      p_tenancy_id: id,
      p_tenant_profile_id: context.tenancy.tenant_profile_id,
      p_agreement_address: agreement.address.toBase58(),
      p_proposal_address: proposal.address.toBase58(),
      p_proposal_version: Number(proposal.proposalVersion),
      p_settlement_type: proposal.proposalType,
      p_original_amount: agreement.depositedAmount.toString() as unknown as number,
      p_landlord_amount: proposal.landlordAmount.toString() as unknown as number,
      p_tenant_amount: proposal.tenantAmount.toString() as unknown as number,
      p_decimals: DEPOSIT_LOCK_MINT_DECIMALS,
      p_terms_hash: proposal.termsHash,
      p_proposal_signature: proposalSignature,
      p_challenge_signature: latestSignature,
      p_reason: reason,
      p_evidence_ids: evidenceIds,
    });
    if (rpcError) return response(409, { tenancy_id: id, error: rpcError.message });
    return response(200, { tenancy_id: id, state: "disputed", dispute: data });
  }

  if (agreement.status === "closed" && proposal.status === "executed") {
    if (!recorded || !recordedMatches) {
      return response(409, { tenancy_id: id, error: "Closed on-chain settlement has no verified proposal record." });
    }
    const { data, error: rpcError } = await service.rpc("mark_settlement_executed", {
      p_tenancy_id: id,
      p_tenant_profile_id: context.tenancy.tenant_profile_id,
      p_proposal_version: Number(proposal.proposalVersion),
      p_original_amount: agreement.depositedAmount.toString() as unknown as number,
      p_landlord_amount: proposal.settledLandlordAmount.toString() as unknown as number,
      p_tenant_amount: proposal.settledTenantAmount.toString() as unknown as number,
      p_decimals: DEPOSIT_LOCK_MINT_DECIMALS,
      p_execution_signature: latestSignature,
      p_onchain_executed_at: new Date(proposal.respondedAt * 1000).toISOString(),
    });
    if (rpcError) {
      const status = rpcError.code === "P0001" || rpcError.code === "23514" ? 409 : 500;
      return response(status, { tenancy_id: id, error: rpcError.message });
    }
    return response(200, {
      tenancy_id: id,
      state: "settlement_completed",
      settlement: data,
      execution_signature: latestSignature,
    });
  }

  if (agreement.status === "funded" && proposal.status === "draft") {
    return response(200, { tenancy_id: id, state: "funded", proposal });
  }
  return response(409, {
    tenancy_id: id,
    error: `Agreement/proposal states are inconsistent (${agreement.status}/${proposal.status}).`,
  });
}
