"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { AlertTriangle, Check, ExternalLink, Loader2, ShieldCheck, Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/tenancy/create/fields";
import { useWalletIdentity } from "@/hooks/use-wallet-identity";
import {
  getSettlementByTenancy,
  getSupabaseBrowserClient,
  listDeductionsByTenancy,
  listDisputesByTenancy,
  listEvidenceByTenancy,
  listSettlementProposalsByTenancy,
} from "@/lib/db";
import type {
  DeductionRecord,
  DisputeRecord,
  EvidenceRecord,
  SettlementProposalRecord,
  SettlementRecord,
} from "@/lib/db/models";
import { depositAmountToBaseUnits, formatBaseUnits, TEST_TOKEN_DISPLAY_SYMBOL } from "@/lib/solana/amounts";
import { getSolanaConnection } from "@/lib/solana/connection";
import { fetchDepositAgreement, fetchDepositConfig } from "@/lib/solana/deposit";
import {
  DEPOSIT_LOCK_MINT_ADDRESS,
  DEPOSIT_LOCK_MINT_DECIMALS,
} from "@/lib/solana/deployment";
import {
  buildApproveSettlementInstruction,
  buildChallengeSettlementInstruction,
  buildInitializeSettlementProposalInstruction,
  buildProposeSettlementInstruction,
  buildWithdrawSettlementProposalInstruction,
  tenancyIdToBytes,
} from "@/lib/solana/program";
import {
  fetchSettlementProposal,
  type SettlementProposalState,
} from "@/lib/solana/settlement";
import {
  hashSettlementTerms,
  settlementTermsHashBytes,
  settlementTermsHashHex,
} from "@/lib/solana/settlement-terms";
import {
  reconcileSettlement,
  startMoveOutReview,
  type SettlementReconcileInput,
} from "@/lib/solana/settlement-reconcile";
import {
  isTransactableCluster,
  sendProgramTransaction,
  type DepositTxUpdate,
} from "@/lib/solana/transactions";
import { explorerAddressUrl, explorerTransactionUrl } from "@/lib/solana/explorer";
import { SOLANA_CLUSTER } from "@/lib/solana/config";
import { formatCurrency } from "@/lib/utils";
import { parseMoneyAmount } from "@/lib/money";
import type { Tenancy } from "@/types/tenancy";
import { PublicKey, type TransactionInstruction } from "@solana/web3.js";

type WorkflowData =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | {
      phase: "ready";
      agreement: Awaited<ReturnType<typeof fetchAgreement>>;
      proposal: SettlementProposalState | null;
      proposals: SettlementProposalRecord[];
      deductions: DeductionRecord[];
      disputes: DisputeRecord[];
      evidence: EvidenceRecord[];
      settlement: SettlementRecord | null;
      configMatches: boolean;
      proposalTermsMatch: boolean;
    };

async function fetchAgreement(tenancyId: string) {
  return fetchDepositAgreement(getSolanaConnection(), tenancyIdToBytes(tenancyId));
}

const REASON_OPTIONS = [
  ["damage", "Damage"],
  ["missing_items", "Missing items"],
  ["cleaning", "Cleaning"],
  ["unpaid_rent", "Unpaid rent"],
  ["utilities", "Utilities"],
  ["other", "Other"],
] as const;

const TX_COPY: Record<DepositTxUpdate["phase"], string> = {
  preparing: "Preparing settlement transaction…",
  approving: "Approve in your wallet…",
  submitted: "Settlement submitted to Solana…",
  confirming: "Confirming settlement on Solana…",
  confirmed: "Transaction confirmed on Solana",
  failed: "Transaction failed",
};

export function SettlementWorkflowPanel({
  tenancy,
  viewerId,
  onRefresh,
}: {
  tenancy: Tenancy;
  viewerId: string;
  onRefresh: () => void;
}) {
  const { publicKey, signTransaction } = useWallet();
  const walletIdentity = useWalletIdentity();
  const role = viewerId === tenancy.landlord.id
    ? "landlord"
    : viewerId === tenancy.tenant.id
      ? "tenant"
      : null;
  const actor = role === "landlord" ? tenancy.landlord : tenancy.tenant;
  const walletAddress = publicKey?.toBase58() ?? null;
  const walletMatches = Boolean(walletAddress && actor?.wallet === walletAddress);
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<WorkflowData>({ phase: "loading" });
  const [tx, setTx] = useState<DepositTxUpdate | null>(null);
  const [busy, setBusy] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reconcileInput, setReconcileInput] = useState<SettlementReconcileInput | null>(null);
  const [amountText, setAmountText] = useState("");
  const [reasonCategory, setReasonCategory] = useState<string>("damage");
  const [description, setDescription] = useState("");
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  const [challengeReason, setChallengeReason] = useState("");
  const [challengeEvidenceIds, setChallengeEvidenceIds] = useState<string[]>([]);

  const requiredAmount = useMemo(
    () => depositAmountToBaseUnits(tenancy.depositAmount, DEPOSIT_LOCK_MINT_DECIMALS),
    [tenancy.depositAmount],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const client = getSupabaseBrowserClient();
        if (!client) throw new Error("Supabase is not configured.");
        const [agreement, proposal, config, proposalRows, deductionRows, disputeRows, evidenceRows, settlementRow] =
          await Promise.all([
            fetchAgreement(tenancy.id),
            fetchSettlementProposal(getSolanaConnection(), tenancyIdToBytes(tenancy.id)),
            fetchDepositConfig(getSolanaConnection()),
            listSettlementProposalsByTenancy(client, tenancy.id),
            listDeductionsByTenancy(client, tenancy.id),
            listDisputesByTenancy(client, tenancy.id),
            listEvidenceByTenancy(client, tenancy.id),
            getSettlementByTenancy(client, tenancy.id),
          ]);
        if (!proposalRows.ok) throw new Error(proposalRows.error.message);
        if (!deductionRows.ok) throw new Error(deductionRows.error.message);
        if (!disputeRows.ok) throw new Error(disputeRows.error.message);
        if (!evidenceRows.ok) throw new Error(evidenceRows.error.message);
        if (!settlementRow.ok) throw new Error(settlementRow.error.message);
        let proposalTermsMatch = false;
        if (proposal) {
          const recorded = proposalRows.data.find(
            (row) => row.proposalVersion === Number(proposal.proposalVersion),
          );
          if (
            recorded &&
            recorded.agreementAddress === agreement?.address.toBase58() &&
            recorded.proposalAddress === proposal.address.toBase58() &&
            recorded.settlementType === proposal.proposalType &&
            recorded.status === ({ active: "proposed", withdrawn: "withdrawn", challenged: "challenged", executed: "executed", draft: "draft" } as const)[proposal.status] &&
            BigInt(String(recorded.originalDepositAmount)) === agreement?.depositedAmount &&
            BigInt(String(recorded.landlordAmount)) === proposal.landlordAmount &&
            BigInt(String(recorded.tenantAmount)) === proposal.tenantAmount
          ) {
            const deduction = recorded.deductionId
              ? deductionRows.data.find((row) => row.id === recorded.deductionId)
              : null;
            const computedHash = await hashSettlementTerms({
              tenancyId: tenancy.id,
              settlementType: proposal.proposalType,
              landlordAmount: proposal.landlordAmount,
              reasonCategory: deduction?.reasonCategory ?? null,
              description: deduction?.description ?? null,
              evidenceIds: recorded.evidenceIds,
            });
            proposalTermsMatch = recorded.termsHash === proposal.termsHash && (
              recorded.metadataVerified
                ? settlementTermsHashHex(computedHash) === proposal.termsHash
                : recorded.status === "challenged" && proposal.status === "challenged"
            );
          }
        }
        if (
          !cancelled &&
          proposal?.status === "active" &&
          proposal.proposalType === "partial_deduction" &&
          !proposalRows.data.some((row) => row.proposalVersion === Number(proposal.proposalVersion))
        ) {
          setAmountText(formatBaseUnits(proposal.landlordAmount, DEPOSIT_LOCK_MINT_DECIMALS));
        }
        if (!cancelled) {
          setData({
            phase: "ready",
            agreement,
            proposal,
            proposals: proposalRows.data,
            deductions: deductionRows.data,
            disputes: disputeRows.data,
            evidence: evidenceRows.data,
            settlement: settlementRow.data,
            configMatches: Boolean(
              config &&
                config.allowedMint.toBase58() === DEPOSIT_LOCK_MINT_ADDRESS &&
                config.allowedDecimals === DEPOSIT_LOCK_MINT_DECIMALS,
            ),
            proposalTermsMatch,
          });
        }
      } catch (cause) {
        if (!cancelled) {
          setData({
            phase: "error",
            message: cause instanceof Error ? cause.message : "Could not load settlement state.",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reload, tenancy.id]);

  const refresh = useCallback(() => setReload((value) => value + 1), []);

  async function reconcileAfterTransaction(input: SettlementReconcileInput) {
    setReconcileInput(input);
    setReconciling(true);
    try {
      const result = await reconcileSettlement(tenancy.id, input);
      if (!result.ok) {
        setActionError(`The Solana transaction is confirmed, but reconciliation failed: ${result.message}`);
        return false;
      }
      setReconcileInput(null);
      setActionError(null);
      setTx((current) => current ? { ...current, phase: "confirmed" } : current);
      onRefresh();
      refresh();
      return true;
    } catch {
      setActionError("The Solana transaction is confirmed, but reconciliation could not be reached.");
      return false;
    } finally {
      setReconciling(false);
    }
  }

  async function runTransaction(
    instructions: TransactionInstruction[],
    input: SettlementReconcileInput,
  ) {
    if (!publicKey || !signTransaction) {
      setActionError("Connect the wallet recorded for your role before signing.");
      return;
    }
    setBusy(true);
    setTx(null);
    setActionError(null);
    try {
      await sendProgramTransaction({
        connection: getSolanaConnection(),
        wallet: { publicKey, signTransaction },
        instructions,
        onPhase: setTx,
      });
      await reconcileAfterTransaction(input);
    } catch {
      // The transaction helper has already published the failed phase/message.
    } finally {
      setBusy(false);
    }
  }

  async function handleStartReview() {
    if (!walletMatches) {
      setActionError("Connect the landlord wallet recorded for this tenancy.");
      return;
    }
    setBusy(true);
    setActionError(null);
    const result = await startMoveOutReview(tenancy.id);
    if (!result.ok) {
      setActionError(result.message);
    } else {
      onRefresh();
      refresh();
    }
    setBusy(false);
  }

  async function handleProposal(event: FormEvent<HTMLFormElement>, type: "full_return" | "partial_deduction") {
    event.preventDefault();
    if (!dataReady || !publicKey || !signTransaction || !walletMatches) return;
    const agreement = dataReady.agreement;
    if (!agreement || agreement.status !== "funded") {
      setActionError("The on-chain agreement must be funded before settlement can be proposed.");
      return;
    }
    let landlordAmount = BigInt(0);
    if (type === "partial_deduction") {
      const parsed = Number(amountText);
      try {
        landlordAmount = depositAmountToBaseUnits(parsed, DEPOSIT_LOCK_MINT_DECIMALS);
      } catch {
        setActionError("Enter a deduction amount with up to two decimal places.");
        return;
      }
      if (landlordAmount <= BigInt(0) || landlordAmount > requiredAmount) {
        setActionError("Deduction must be greater than zero and no more than the protected deposit.");
        return;
      }
      if (!description.trim() || description.trim().length > 1000) {
        setActionError("Enter a reason description (up to 1,000 characters).");
        return;
      }
    }

    const input: SettlementReconcileInput = type === "full_return"
      ? { intent: "proposal", settlementType: type }
      : {
          intent: "proposal",
          settlementType: type,
          reasonCategory,
          description: description.trim(),
          evidenceIds,
        };
    try {
      const termsHash = await hashSettlementTerms({
        tenancyId: tenancy.id,
        settlementType: type,
        landlordAmount,
        reasonCategory: type === "partial_deduction" ? reasonCategory : null,
        description: type === "partial_deduction" ? description.trim() : null,
        evidenceIds: type === "partial_deduction" ? evidenceIds : [],
      });
      const instructions: TransactionInstruction[] = [];
      if (!dataReady.proposal) {
        instructions.push(
          buildInitializeSettlementProposalInstruction({
            landlord: publicKey,
            tenancyIdBytes: tenancyIdToBytes(tenancy.id),
          }),
        );
      }
      instructions.push(buildProposeSettlementInstruction({
        landlord: publicKey,
        tenancyIdBytes: tenancyIdToBytes(tenancy.id),
        mint: new PublicKey(DEPOSIT_LOCK_MINT_ADDRESS),
        landlordAmount,
        expectedProposalVersion: dataReady.proposal
          ? dataReady.proposal.proposalVersion + BigInt(1)
          : BigInt(1),
        termsHash,
      }));
      await runTransaction(instructions, input);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Could not prepare settlement proposal.");
    }
  }

  async function handleProposalMetadataRecovery(
    event: FormEvent<HTMLFormElement> | undefined,
    type: "full_return" | "partial_deduction",
  ) {
    event?.preventDefault();
    const proposal = dataReady?.proposal;
    if (!proposal || proposal.status !== "active") return;
    if (type === "partial_deduction" && (role !== "landlord" || !walletMatches)) return;
    if ((type === "full_return") !== (proposal.proposalType === "full_return")) {
      setActionError("The settlement type differs from the active on-chain proposal.");
      return;
    }
    let landlordAmount = BigInt(0);
    if (type === "partial_deduction") {
      try {
        landlordAmount = depositAmountToBaseUnits(Number(amountText), DEPOSIT_LOCK_MINT_DECIMALS);
      } catch {
        setActionError("Enter the exact deduction amount from the on-chain proposal.");
        return;
      }
      if (landlordAmount !== proposal.landlordAmount || !description.trim()) {
        setActionError("Re-enter the exact deduction amount and explanation originally proposed.");
        return;
      }
    }
    const input: SettlementReconcileInput = type === "full_return"
      ? { intent: role === "landlord" ? "proposal" : "refresh", settlementType: type }
      : { intent: "proposal", settlementType: type, reasonCategory, description: description.trim(), evidenceIds };
    const termsHash = await hashSettlementTerms({
      tenancyId: tenancy.id,
      settlementType: type,
      landlordAmount,
      reasonCategory: type === "partial_deduction" ? reasonCategory : null,
      description: type === "partial_deduction" ? description.trim() : null,
      evidenceIds: type === "partial_deduction" ? evidenceIds : [],
    });
    if (settlementTermsHashHex(termsHash) !== proposal.termsHash) {
      setActionError("Those details do not match the terms committed to Solana. Restore the original reason and evidence.");
      return;
    }
    setBusy(true);
    await reconcileAfterTransaction(input);
    setBusy(false);
  }

  async function handleWithdraw() {
    if (!publicKey || !walletMatches || !dataReady?.proposal) return;
    await runTransaction(
      [buildWithdrawSettlementProposalInstruction({
        landlord: publicKey,
        tenancyIdBytes: tenancyIdToBytes(tenancy.id),
        expectedProposalVersion: dataReady.proposal.proposalVersion,
        expectedTermsHash: settlementTermsHashBytes(dataReady.proposal.termsHash),
      })],
      { intent: "withdrawal" },
    );
  }

  async function handleApproval() {
    if (!publicKey || !walletMatches || !dataReady?.proposal || !tenancy.landlord.wallet) return;
    await runTransaction(
      [buildApproveSettlementInstruction({
        tenant: publicKey,
        landlord: new PublicKey(tenancy.landlord.wallet!),
        mint: new PublicKey(DEPOSIT_LOCK_MINT_ADDRESS),
        tenancyIdBytes: tenancyIdToBytes(tenancy.id),
        expectedProposalVersion: dataReady.proposal.proposalVersion,
        expectedTermsHash: settlementTermsHashBytes(dataReady.proposal.termsHash),
      })],
      { intent: "refresh" },
    );
  }

  async function handleChallenge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!publicKey || !walletMatches || !dataReady?.proposal) return;
    if (challengeReason.trim().length < 3 || challengeReason.trim().length > 1000) {
      setActionError("Enter a challenge explanation between 3 and 1,000 characters.");
      return;
    }
    await runTransaction(
      [buildChallengeSettlementInstruction({
        tenant: publicKey,
        tenancyIdBytes: tenancyIdToBytes(tenancy.id),
        expectedProposalVersion: dataReady.proposal.proposalVersion,
        expectedTermsHash: settlementTermsHashBytes(dataReady.proposal.termsHash),
      })],
      {
        intent: "challenge",
        challengeReason: challengeReason.trim(),
        challengeEvidenceIds,
      },
    );
  }

  async function reconcileWithoutTransaction(input: SettlementReconcileInput) {
    setReconcileInput(input);
    setBusy(true);
    setReconciling(true);
    try {
      const result = await reconcileSettlement(tenancy.id, input);
      if (!result.ok) setActionError(result.message);
      else {
        setActionError(null);
        setReconcileInput(null);
        onRefresh();
        refresh();
      }
    } catch {
      setActionError("The server could not be reached to reconcile settlement state.");
    } finally {
      setReconciling(false);
      setBusy(false);
    }
  }

  async function retryReconcile() {
    if (!reconcileInput) return;
    await reconcileWithoutTransaction(reconcileInput);
  }

  const dataReady = data.phase === "ready" ? data : null;
  const currentProposal = dataReady?.proposal ?? null;
  const storedProposalCandidate = dataReady?.proposals.find(
    (entry) => entry.proposalVersion === Number(currentProposal?.proposalVersion),
  ) ?? null;
  const storedProposal = dataReady?.proposalTermsMatch ? storedProposalCandidate : null;
  const currentDeduction = storedProposal?.deductionId
    ? dataReady?.deductions.find((item) => item.id === storedProposal.deductionId) ?? null
    : null;
  const currentDispute = storedProposal?.disputeId
    ? dataReady?.disputes.find((item) => item.id === storedProposal.disputeId) ?? null
    : null;
  const evidenceOptions = dataReady?.evidence.filter(
    (item) => item.evidenceContext === "move_out" && item.deductionId === null,
  ) ?? [];
  const challengeEvidenceOptions = dataReady?.evidence.filter(
    (item) => item.evidenceContext === "move_out" || item.evidenceContext === "deduction",
  ) ?? [];
  const roleWalletReady = walletAddress !== null && walletMatches;
  const transactable = isTransactableCluster(SOLANA_CLUSTER) &&
    Boolean(DEPOSIT_LOCK_MINT_ADDRESS) &&
    Boolean(dataReady?.configMatches);

  if (!role || ![
    "protected",
    "move_out_review",
    "settlement_pending",
    "deduction_proposed",
    "disputed",
    "closed",
  ].includes(tenancy.recordStatus)) return null;

  if (data.phase === "loading") {
    return (
      <section aria-label="Settlement workflow" className="rounded-3xl border border-line bg-parchment p-5 sm:p-6">
        <p aria-busy="true" className="h-12 animate-pulse rounded-xl bg-sand">
          <span className="sr-only">Reading settlement state from Solana…</span>
        </p>
      </section>
    );
  }
  if (data.phase === "error") {
    return (
      <section aria-label="Settlement workflow" className="rounded-3xl border border-line bg-parchment p-5 sm:p-6">
        <FormAlert>{data.message}</FormAlert>
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={refresh}>Refresh</Button>
      </section>
    );
  }
  if (!dataReady) return null;

  const agreement = data.agreement;
  const active = agreement?.status === "settlement_proposed" && currentProposal?.status === "active";
  const disputed = agreement?.status === "disputed" && currentProposal?.status === "challenged";
  const closed = agreement?.status === "closed" && currentProposal?.status === "executed";
  const withdrawn = agreement?.status === "funded" && currentProposal?.status === "withdrawn";
  const amountLabel = (value: bigint) => `${formatBaseUnits(value, DEPOSIT_LOCK_MINT_DECIMALS)} ${TEST_TOKEN_DISPLAY_SYMBOL}`;
  const explorerUrl = agreement ? explorerAddressUrl(agreement.address.toBase58(), SOLANA_CLUSTER) : null;
  const transactionSignature = tx?.signature;
  const txUrl = transactionSignature ? explorerTransactionUrl(transactionSignature, SOLANA_CLUSTER) : null;

  return (
    <section aria-label="Settlement workflow" className="rounded-3xl border border-line bg-parchment p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow text-subtle">Move-out settlement</p>
          <h2 className="mt-1 text-base font-semibold text-ink">
            {disputed ? "Settlement under dispute" : closed ? "Settlement complete" : "Mutual agreement required"}
          </h2>
        </div>
        {agreement ? (
          <a href={explorerUrl!} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-forest hover:underline">
            View agreement <ExternalLink aria-hidden className="size-3.5" />
          </a>
        ) : null}
      </div>

      {!transactable ? (
        <FormAlert>
          Settlement actions require the configured DepositLock program and test mint on Solana Devnet.
        </FormAlert>
      ) : null}

      {tenancy.recordStatus === "protected" ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm leading-relaxed text-muted">
            The landlord can start move-out review. No funds move until the tenant approves a specific on-chain settlement.
          </p>
          {role === "landlord" ? (
            !walletAddress ? (
              <WalletConnectOrMismatch
                connected={false}
                party={tenancy.landlord.name}
                address={tenancy.landlord.wallet}
                onConnect={walletIdentity.connect}
              />
            ) : !walletMatches ? (
              <WalletMismatch party={tenancy.landlord.name} address={tenancy.landlord.wallet} />
            ) : (
              <Button
                type="button"
                onClick={() => void handleStartReview()}
                disabled={busy || !transactable || !walletMatches || agreement?.status !== "funded"}
              >
                {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <ShieldCheck aria-hidden className="size-4" />}
                Start Move-Out Review
              </Button>
            )
          ) : (
            <p className="text-sm text-muted">Waiting for the landlord to start move-out review.</p>
          )}
        </div>
      ) : null}

      {withdrawn ? (
        <div role="status" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-cream-raised px-4 py-3">
          <p className="text-sm text-muted">The proposal is withdrawn on chain; syncing the move-out record.</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void reconcileWithoutTransaction({ intent: "withdrawal" })} disabled={busy}>Sync withdrawal</Button>
        </div>
      ) : null}

      {tenancy.recordStatus === "move_out_review" && agreement?.status === "funded" && !active ? (
        <div className="mt-4 space-y-5">
          {role === "landlord" ? (
            !roleWalletReady ? (
              <WalletConnectOrMismatch
                connected={Boolean(walletAddress)}
                party={tenancy.landlord.name}
                address={tenancy.landlord.wallet}
                onConnect={walletIdentity.connect}
              />
            ) : !transactable ? (
              <FormAlert>Settlement actions are available only on Solana Devnet.</FormAlert>
            ) : (
              <div className="grid gap-5 lg:grid-cols-2">
                <div className="rounded-2xl border border-line bg-cream-raised p-4">
                  <p className="text-sm font-semibold text-ink">Return full deposit</p>
                  <p className="mt-1 text-sm text-muted">
                    Propose returning {formatCurrency(tenancy.depositAmount)} ({amountLabel(requiredAmount)}) to the tenant.
                  </p>
                  <SettlementSplitPreview depositAmount={tenancy.depositAmount} landlordAmount={BigInt(0)} />
                  <form className="mt-4" onSubmit={(event) => void handleProposal(event, "full_return")}>
                    <Button type="submit" disabled={busy}>
                      {busy ? "Working…" : "Propose Full Return"}
                    </Button>
                  </form>
                </div>
                <DeductionForm
                  amount={amountText}
                  depositAmount={tenancy.depositAmount}
                  category={reasonCategory}
                  description={description}
                  evidence={evidenceOptions}
                  selectedEvidence={evidenceIds}
                  busy={busy}
                  onAmount={setAmountText}
                  onCategory={setReasonCategory}
                  onDescription={setDescription}
                  onEvidence={(id, checked) => setEvidenceIds((ids) => checked ? [...new Set([...ids, id])] : ids.filter((value) => value !== id))}
                  onSubmit={(event) => void handleProposal(event, "partial_deduction")}
                />
              </div>
            )
          ) : (
            <p className="text-sm leading-relaxed text-muted">The landlord is reviewing the move-out and may propose a full return or documented deduction.</p>
          )}
        </div>
      ) : null}

      {active ? (
        <div className="mt-4 space-y-4">
          {storedProposal ? (
            <SettlementTerms
              proposal={currentProposal!}
              row={storedProposal}
              deduction={currentDeduction}
              evidence={dataReady.evidence}
            />
          ) : (
            <div className="space-y-3">
              <FormAlert>
                The on-chain proposal is confirmed; its description is not yet mirrored. The tenant cannot approve until the exact committed terms are verified.
              </FormAlert>
              {currentProposal?.proposalType === "full_return" ? (
                <Button type="button" variant="outline" onClick={() => void handleProposalMetadataRecovery(undefined, "full_return")} disabled={busy}>
                  Sync full-return proposal
                </Button>
              ) : null}
              {role === "landlord" && currentProposal?.proposalType === "partial_deduction" ? (
                <DeductionForm
                  amount={amountText}
                  depositAmount={tenancy.depositAmount}
                  category={reasonCategory}
                  description={description}
                  evidence={evidenceOptions}
                  selectedEvidence={evidenceIds}
                  busy={busy}
                  submitLabel="Retry recording deduction terms"
                  onAmount={setAmountText}
                  onCategory={setReasonCategory}
                  onDescription={setDescription}
                  onEvidence={(evidenceId, checked) => setEvidenceIds((ids) => checked ? [...new Set([...ids, evidenceId])] : ids.filter((value) => value !== evidenceId))}
                  onSubmit={(event) => void handleProposalMetadataRecovery(event, "partial_deduction")}
                />
              ) : null}
            </div>
          )}
          {!roleWalletReady ? (
            <WalletConnectOrMismatch
              connected={Boolean(walletAddress)}
              party={actor?.name ?? role}
              address={actor?.wallet ?? null}
              onConnect={walletIdentity.connect}
            />
          ) : null}
          {role === "tenant" && roleWalletReady && (storedProposal || currentProposal?.proposalType === "partial_deduction") ? (
            <div className="flex flex-wrap gap-3">
              {storedProposal ? (
                <Button type="button" onClick={() => void handleApproval()} disabled={busy || !transactable}>
                  {busy ? "Working…" : storedProposal.settlementType === "full_return" ? "Approve Return" : "Accept Deduction"}
                </Button>
              ) : (
                <FormAlert>
                  The on-chain deduction is active, but its explanation has not been verified. You can challenge the split; approval remains disabled until the committed details are restored.
                </FormAlert>
              )}
              {currentProposal?.proposalType === "partial_deduction" ? (
                <form onSubmit={(event) => void handleChallenge(event)} className="flex w-full flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-end">
                  <label className="flex-1 text-sm font-medium text-ink">
                    Challenge explanation
                    <textarea
                      value={challengeReason}
                      onChange={(event) => setChallengeReason(event.target.value)}
                      minLength={3}
                      maxLength={1000}
                      rows={2}
                      className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
                      placeholder="Explain what you disagree with."
                    />
                  </label>
                  {challengeEvidenceOptions.length > 0 ? (
                    <fieldset className="w-full">
                      <legend className="text-xs font-semibold text-muted">Relevant evidence (optional)</legend>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {challengeEvidenceOptions.map((item) => (
                          <label key={item.id} className="flex items-start gap-2 rounded-xl border border-line bg-white px-3 py-2 text-xs text-muted">
                            <input
                              type="checkbox"
                              checked={challengeEvidenceIds.includes(item.id)}
                              onChange={(event) => setChallengeEvidenceIds((ids) => event.target.checked ? [...new Set([...ids, item.id])] : ids.filter((value) => value !== item.id))}
                            />
                            <span>{item.caption}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  ) : null}
                  <Button type="submit" variant="outline" disabled={busy || !transactable}>
                    Challenge Deduction
                  </Button>
                </form>
              ) : null}
              {storedProposal ? (
                <p className="w-full text-xs text-subtle">
                  The tenant approval transaction also pays rent for any missing recipient token account.
                </p>
              ) : null}
            </div>
          ) : null}
          {role === "landlord" && roleWalletReady && storedProposal ? (
            <Button type="button" variant="outline" onClick={() => void handleWithdraw()} disabled={busy || !transactable}>
              Withdraw Pending Proposal
            </Button>
          ) : null}
        </div>
      ) : null}

      {disputed ? (
        <div className="mt-4 rounded-2xl border border-dispute/30 bg-dispute-soft p-4">
          <p className="flex items-center gap-2 font-semibold text-dispute">
            <AlertTriangle aria-hidden className="size-4" />
            {amountLabel(agreement!.depositedAmount)} — PROTECTED, UNDER DISPUTE
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink">
            No funds moved when the deduction was challenged. DepositLock does not resolve disputes in this phase; the vault remains locked.
          </p>
          {currentDispute ? <p className="mt-3 text-sm text-muted">Tenant’s explanation: {currentDispute.reason}</p> : null}
          {storedProposal?.settlementType === "partial_deduction" ? (
            <SettlementTerms proposal={currentProposal!} row={storedProposal} deduction={currentDeduction} evidence={dataReady.evidence} />
          ) : null}
          {currentProposal?.status === "challenged" && role === "tenant" && storedProposal?.status !== "challenged" ? (
            <form className="mt-4 space-y-3" onSubmit={(event) => {
              event.preventDefault();
              if (challengeReason.trim().length < 3 || challengeReason.trim().length > 1000) {
                setActionError("Enter a challenge explanation between 3 and 1,000 characters.");
                return;
              }
              void reconcileWithoutTransaction({
                intent: "challenge",
                challengeReason: challengeReason.trim(),
                challengeEvidenceIds,
              });
            }}>
              <label className="block text-sm font-medium text-ink">
                Challenge explanation to record
                <textarea value={challengeReason} onChange={(event) => setChallengeReason(event.target.value)} minLength={3} maxLength={1000} rows={2} className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm" />
              </label>
              {challengeEvidenceOptions.length > 0 ? (
                <fieldset>
                  <legend className="text-xs font-semibold text-muted">Relevant evidence (optional)</legend>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {challengeEvidenceOptions.map((item) => (
                      <label key={item.id} className="flex items-start gap-2 rounded-xl border border-line bg-white px-3 py-2 text-xs text-muted">
                        <input
                          type="checkbox"
                          checked={challengeEvidenceIds.includes(item.id)}
                          onChange={(event) => setChallengeEvidenceIds((ids) => event.target.checked ? [...new Set([...ids, item.id])] : ids.filter((value) => value !== item.id))}
                        />
                        <span>{item.caption}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : null}
              <Button type="submit" variant="outline" disabled={busy}>Sync challenge record</Button>
            </form>
          ) : null}
        </div>
      ) : null}

      {closed ? (
        <div className="mt-4 rounded-2xl border border-protected/30 bg-protected-soft p-4">
          <p className="flex items-center gap-2 font-semibold text-protected">
            <Check aria-hidden className="size-4" />
            Settlement complete
          </p>
          {dataReady.settlement && currentProposal ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Payout
                label={`Returned to ${tenancy.tenant.name}`}
                amount={formatBaseUnits(currentProposal.settledTenantAmount, DEPOSIT_LOCK_MINT_DECIMALS)}
              />
              <Payout
                label={`Released to ${tenancy.landlord.name}`}
                amount={formatBaseUnits(currentProposal.settledLandlordAmount, DEPOSIT_LOCK_MINT_DECIMALS)}
              />
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted">The closed agreement is syncing to the tenancy record.</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void reconcileWithoutTransaction({ intent: "refresh" })} disabled={busy}>Sync settlement</Button>
            </div>
          )}
          {currentProposal && currentProposal.settledTenantAmount > currentProposal.tenantAmount ? (
            <p className="mt-3 text-xs leading-relaxed text-muted">
              The tenant payout includes {formatBaseUnits(
                currentProposal.settledTenantAmount - currentProposal.tenantAmount,
                DEPOSIT_LOCK_MINT_DECIMALS,
              )} extra {TEST_TOKEN_DISPLAY_SYMBOL} that had been transferred directly into the vault.
            </p>
          ) : null}
          {dataReady.settlement?.blockchainTransaction ? (
            <a href={explorerTransactionUrl(dataReady.settlement.blockchainTransaction, SOLANA_CLUSTER)} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-forest hover:underline">
              View settlement transaction <ExternalLink aria-hidden className="size-3.5" />
            </a>
          ) : null}
        </div>
      ) : null}

      {tx && tx.phase !== "preparing" ? (
        <div role="status" className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-cream-raised px-4 py-3">
          {tx.phase === "confirmed" ? <Check aria-hidden className="size-4 text-protected" /> : <Loader2 aria-hidden className="size-4 animate-spin text-moss" />}
          <p className="text-sm font-medium text-ink">{tx.phase === "failed" && tx.message ? tx.message : TX_COPY[tx.phase]}</p>
          {txUrl ? <a href={txUrl} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1.5 text-sm font-semibold text-forest hover:underline">View transaction <ExternalLink aria-hidden className="size-3.5" /></a> : null}
        </div>
      ) : null}

      {reconciling ? (
        <p role="status" className="mt-3 text-sm font-medium text-muted">
          Reconciling the confirmed settlement against Solana…
        </p>
      ) : null}

      {actionError ? (
        <div className="mt-4 space-y-3">
          <FormAlert>{actionError}</FormAlert>
          {reconcileInput ? <Button type="button" variant="outline" onClick={() => void retryReconcile()} disabled={busy}>Retry reconciliation</Button> : null}
        </div>
      ) : null}
    </section>
  );
}

function WalletConnectOrMismatch({
  connected,
  party,
  address,
  onConnect,
}: {
  connected: boolean;
  party: string;
  address: string | null;
  onConnect: () => void;
}) {
  if (connected) return <WalletMismatch party={party} address={address} />;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="text-sm text-muted">Connect the wallet recorded for {party} to sign this action.</p>
      <Button type="button" variant="outline" size="sm" onClick={onConnect}>
        <Wallet aria-hidden className="size-4" /> Connect wallet
      </Button>
    </div>
  );
}

function WalletMismatch({ party, address }: { party: string; address: string | null }) {
  return (
    <p className="text-sm text-dispute">
      Switch to {party}’s recorded wallet{address ? ` (${address.slice(0, 4)}…${address.slice(-4)})` : ""}.
    </p>
  );
}

function DeductionForm({
  amount,
  depositAmount,
  category,
  description,
  evidence,
  selectedEvidence,
  busy,
  submitLabel = "Propose Deduction",
  onAmount,
  onCategory,
  onDescription,
  onEvidence,
  onSubmit,
}: {
  amount: string;
  depositAmount: number;
  category: string;
  description: string;
  evidence: EvidenceRecord[];
  selectedEvidence: string[];
  busy: boolean;
  submitLabel?: string;
  onAmount: (value: string) => void;
  onCategory: (value: string) => void;
  onDescription: (value: string) => void;
  onEvidence: (id: string, checked: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const parsedAmount = parseMoneyAmount(amount);
  let proposedLandlordAmount = BigInt(0);
  if (parsedAmount.ok) {
    try {
      proposedLandlordAmount = depositAmountToBaseUnits(parsedAmount.value, DEPOSIT_LOCK_MINT_DECIMALS);
    } catch {
      proposedLandlordAmount = BigInt(0);
    }
  }

  return (
    <form className="rounded-2xl border border-line bg-cream-raised p-4" onSubmit={onSubmit}>
      <p className="text-sm font-semibold text-ink">Propose a deduction</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium text-ink">
          Deduction amount
          <input
            required
            inputMode="decimal"
            value={amount}
            onChange={(event) => onAmount(event.target.value)}
            placeholder="150.00"
            className="mt-1.5 h-11 w-full rounded-xl border border-line bg-white px-3 text-sm"
          />
        </label>
        <label className="text-sm font-medium text-ink">
          Reason
          <select value={category} onChange={(event) => onCategory(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-line bg-white px-3 text-sm">
            {REASON_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>
      <label className="mt-3 block text-sm font-medium text-ink">
        Explanation
        <textarea required minLength={3} maxLength={1000} rows={3} value={description} onChange={(event) => onDescription(event.target.value)} className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm" placeholder="Explain the proposed deduction." />
      </label>
      <SettlementSplitPreview
        depositAmount={depositAmount}
        landlordAmount={proposedLandlordAmount}
      />
      {evidence.length > 0 ? (
        <fieldset className="mt-3">
          <legend className="text-sm font-medium text-ink">Move-out evidence (optional)</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {evidence.map((item) => (
              <label key={item.id} className="flex items-start gap-2 rounded-xl border border-line bg-white px-3 py-2 text-sm text-muted">
                <input type="checkbox" checked={selectedEvidence.includes(item.id)} onChange={(event) => onEvidence(item.id, event.target.checked)} />
                <span>{item.caption}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <p className="mt-3 text-xs text-subtle">No move-out evidence has been linked yet. A written reason is still required.</p>
      )}
      <Button type="submit" className="mt-4" disabled={busy}>{busy ? "Working…" : submitLabel}</Button>
    </form>
  );
}

function SettlementSplitPreview({
  depositAmount,
  landlordAmount,
}: {
  depositAmount: number;
  landlordAmount: bigint;
}) {
  const original = depositAmountToBaseUnits(depositAmount, DEPOSIT_LOCK_MINT_DECIMALS);
  const tenantAmount = landlordAmount <= original ? original - landlordAmount : null;
  return (
    <dl className="mt-4 grid gap-2 rounded-xl border border-line bg-white p-3 text-xs sm:grid-cols-3">
      <div>
        <dt className="text-subtle">Protected deposit</dt>
        <dd className="mt-1 font-semibold text-ink">
          {formatBaseUnits(original, DEPOSIT_LOCK_MINT_DECIMALS)} {TEST_TOKEN_DISPLAY_SYMBOL}
        </dd>
      </div>
      <div>
        <dt className="text-subtle">Landlord receives</dt>
        <dd className="mt-1 font-semibold text-ink">
          {formatBaseUnits(landlordAmount, DEPOSIT_LOCK_MINT_DECIMALS)} {TEST_TOKEN_DISPLAY_SYMBOL}
        </dd>
      </div>
      <div>
        <dt className="text-subtle">Tenant receives</dt>
        <dd className="mt-1 font-semibold text-ink">
          {tenantAmount === null
            ? "More than the deposit"
            : `${formatBaseUnits(tenantAmount, DEPOSIT_LOCK_MINT_DECIMALS)} ${TEST_TOKEN_DISPLAY_SYMBOL}`}
        </dd>
      </div>
    </dl>
  );
}

function SettlementTerms({
  proposal,
  row,
  deduction,
  evidence,
}: {
  proposal: SettlementProposalState;
  row: SettlementProposalRecord;
  deduction: DeductionRecord | null;
  evidence: EvidenceRecord[];
}) {
  const attached = evidence.filter((item) => item.deductionId === row.deductionId);
  return (
    <div className="rounded-2xl border border-line bg-cream-raised p-4">
      <p className="eyebrow text-subtle">
        {proposal.proposalType === "full_return" ? "Full return proposed" : "Deduction proposed"}
      </p>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <Payout label="Tenant receives" amount={formatBaseUnits(proposal.tenantAmount, DEPOSIT_LOCK_MINT_DECIMALS)} />
        <Payout label="Landlord receives" amount={formatBaseUnits(proposal.landlordAmount, DEPOSIT_LOCK_MINT_DECIMALS)} />
      </dl>
      {deduction ? (
        <div className="mt-4 border-t border-line pt-3">
          {row.metadataVerified ? (
            <>
              <p className="text-sm font-semibold text-ink">{deduction.reasonCategory.replaceAll("_", " ")}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">{deduction.description}</p>
              {attached.length > 0 ? (
                <ul className="mt-2 list-disc pl-5 text-xs text-subtle">{attached.map((item) => <li key={item.id}>{item.caption}</li>)}</ul>
              ) : null}
            </>
          ) : (
            <p className="text-sm leading-relaxed text-muted">
              The tenant challenged this on-chain split before the landlord’s reason and evidence were verified.
            </p>
          )}
        </div>
      ) : null}
      <p className="mt-3 text-xs text-subtle">Proposal version {proposal.proposalVersion.toString()} · terms verified against the agreement PDA.</p>
    </div>
  );
}

function Payout({ label, amount }: { label: string; amount: string }) {
  return (
    <div className="rounded-xl border border-line bg-white px-3 py-3">
      <p className="eyebrow text-subtle">{label}</p>
      <p className="mt-1 font-serif text-xl text-ink">{amount} {TEST_TOKEN_DISPLAY_SYMBOL}</p>
    </div>
  );
}
