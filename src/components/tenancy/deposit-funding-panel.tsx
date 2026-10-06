"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { ExternalLink, Loader2, ShieldCheck, Wallet } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/tenancy/create/fields";
import { getSolanaConnection } from "@/lib/solana/connection";
import { fetchDepositAgreement, fetchDepositConfig, fetchTokenBalance } from "@/lib/solana/deposit";
import {
  DEPOSIT_LOCK_MINT_ADDRESS,
  DEPOSIT_LOCK_MINT_DECIMALS,
} from "@/lib/solana/deployment";
import {
  buildFundDepositInstruction,
  buildInitializeDepositInstruction,
  tenancyIdToBytes,
} from "@/lib/solana/program";
import { depositAmountToBaseUnits, formatBaseUnits, TEST_TOKEN_DISPLAY_SYMBOL } from "@/lib/solana/amounts";
import { requestDepositReconciliation } from "@/lib/solana/reconcile";
import {
  isTransactableCluster,
  sendProgramTransaction,
  type DepositTxUpdate,
} from "@/lib/solana/transactions";
import { explorerAddressUrl, explorerTransactionUrl } from "@/lib/solana/explorer";
import { SOLANA_CLUSTER } from "@/lib/solana/config";
import { PublicKey } from "@solana/web3.js";
import type { DepositAgreementState } from "@/lib/solana/deposit";
import type { Tenancy } from "@/types/tenancy";
import { useWalletIdentity } from "@/hooks/use-wallet-identity";

/**
 * The role-aware funding flow for an `awaiting_deposit` tenancy.
 *
 * The chain is read first (never trusted from the client, never faked from
 * Supabase), the wallet signs exactly one program instruction, and every
 * transaction is reconciled server-side before the record may change. The
 * landlord creates the agreement and vault; only the tenant can fund it —
 * in integer base units, exactly the required amount.
 */

type ChainView =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | {
      phase: "ready";
      agreement: DepositAgreementState | null;
      /** Tenant-side token balance in base units; `null` for the landlord. */
      balance: bigint | null;
      configReady: boolean;
      mintConfigured: boolean;
    };

type ReconcileView =
  | { phase: "idle" }
  | { phase: "working" }
  | { phase: "error"; message: string };

const PHASE_COPY: Record<DepositTxUpdate["phase"], string> = {
  preparing: "Preparing transaction…",
  approving: "Approve the transaction in your wallet…",
  submitted: "Submitted to Solana…",
  confirming: "Confirming on Solana…",
  confirmed: "Confirmed on Solana",
  failed: "Transaction failed",
};

export function DepositFundingPanel({
  tenancy,
  viewerId,
  onReconciled,
}: {
  tenancy: Tenancy;
  viewerId: string;
  onReconciled: () => void;
}) {
  const { publicKey, signTransaction } = useWallet();
  const walletIdentity = useWalletIdentity();

  const role =
    viewerId === tenancy.landlord.id
      ? "landlord"
      : viewerId === tenancy.tenant.id
        ? "tenant"
        : null;

  const [chain, setChain] = useState<ChainView>({ phase: "loading" });
  const [tx, setTx] = useState<DepositTxUpdate | null>(null);
  const [reconcile, setReconcile] = useState<ReconcileView>({ phase: "idle" });
  const [reload, setReload] = useState(0);

  const requiredAmount = depositAmountToBaseUnits(
    tenancy.depositAmount,
    DEPOSIT_LOCK_MINT_DECIMALS,
  );

  useEffect(() => {
    if (!role) return;
    let cancelled = false;

    void (async () => {
      try {
        const mintConfigured = Boolean(DEPOSIT_LOCK_MINT_ADDRESS);
        if (!mintConfigured) {
          if (!cancelled) {
            setChain({
              phase: "ready",
              agreement: null,
              balance: null,
              configReady: false,
              mintConfigured: false,
            });
          }
          return;
        }

        const connection = getSolanaConnection();
        const tenancyIdBytes = tenancyIdToBytes(tenancy.id);
        const [agreement, config] = await Promise.all([
          fetchDepositAgreement(connection, tenancyIdBytes),
          fetchDepositConfig(connection),
        ]);

        let balance: bigint | null = null;
        if (role === "tenant") {
          if (!tenancy.tenant.wallet) {
            throw new Error("Your wallet is not linked to this tenancy yet.");
          }
          const tokenBalance = await fetchTokenBalance(
            connection,
            new PublicKey(tenancy.tenant.wallet),
            new PublicKey(DEPOSIT_LOCK_MINT_ADDRESS),
          );
          balance = tokenBalance.amount;
        }

        const configReady =
          config !== null &&
          config.allowedMint.toBase58() === DEPOSIT_LOCK_MINT_ADDRESS &&
          config.allowedDecimals === DEPOSIT_LOCK_MINT_DECIMALS;

        if (!cancelled) {
          setChain({
            phase: "ready",
            agreement,
            balance,
            configReady,
            mintConfigured: true,
          });
        }
      } catch (cause) {
        if (!cancelled) {
          setChain({
            phase: "error",
            message: cause instanceof Error ? cause.message : "The chain is unreachable.",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [role, reload, tenancy.id, tenancy.tenant.wallet]);

  const reconcileNow = useCallback(async () => {
    setReconcile({ phase: "working" });
    const result = await requestDepositReconciliation(tenancy.id);
    if (!result.ok) {
      setReconcile({ phase: "error", message: result.message });
      return false;
    }
    setReconcile({ phase: "idle" });
    onReconciled();
    return true;
  }, [onReconciled, tenancy.id]);

  const finishWithReconcile = useCallback(async () => {
    await reconcileNow();
    setReload((value) => value + 1);
  }, [reconcileNow]);

  async function runInitialize() {
    if (!role || role !== "landlord") return;
    if (!publicKey || !signTransaction) return;
    if (!tenancy.tenant.wallet || !DEPOSIT_LOCK_MINT_ADDRESS) return;

    setTx(null);
    setReconcile({ phase: "idle" });
    const instruction = buildInitializeDepositInstruction({
      landlord: publicKey,
      tenant: new PublicKey(tenancy.tenant.wallet),
      mint: new PublicKey(DEPOSIT_LOCK_MINT_ADDRESS),
      tenancyIdBytes: tenancyIdToBytes(tenancy.id),
      requiredAmount,
    });

    try {
      await sendProgramTransaction({
        connection: getSolanaConnection(),
        wallet: { publicKey, signTransaction },
        instructions: [instruction],
        onPhase: setTx,
      });
      await finishWithReconcile();
    } catch {
      // The phase carries the message; state is already set.
    }
  }

  async function runFund() {
    if (!role || role !== "tenant") return;
    if (!publicKey || !signTransaction) return;
    if (!DEPOSIT_LOCK_MINT_ADDRESS) return;

    setTx(null);
    setReconcile({ phase: "idle" });
    const instruction = buildFundDepositInstruction({
      tenant: publicKey,
      mint: new PublicKey(DEPOSIT_LOCK_MINT_ADDRESS),
      tenancyIdBytes: tenancyIdToBytes(tenancy.id),
      amount: requiredAmount,
    });

    try {
      await sendProgramTransaction({
        connection: getSolanaConnection(),
        wallet: { publicKey, signTransaction },
        instructions: [instruction],
        onPhase: setTx,
      });
      await finishWithReconcile();
    } catch {
      // The phase carries the message; state is already set.
    }
  }

  if (!role || tenancy.recordStatus !== "awaiting_deposit") return null;

  const party = role === "landlord" ? tenancy.landlord : tenancy.tenant;
  const walletAddress = publicKey ? publicKey.toBase58() : null;
  const walletMatches =
    walletAddress !== null && party.wallet !== null && walletAddress === party.wallet;
  const clusterOk = isTransactableCluster(SOLANA_CLUSTER);
  const busy =
    (tx !== null && tx.phase !== "confirmed" && tx.phase !== "failed") ||
    reconcile.phase === "working";

  if (chain.phase === "loading") {
    return (
      <section aria-label="Deposit funding" className="rounded-3xl border border-line bg-parchment p-5 sm:p-6">
        <p aria-busy="true" className="h-11 animate-pulse rounded-xl bg-sand">
          <span className="sr-only">Reading the deposit on Solana…</span>
        </p>
      </section>
    );
  }

  if (chain.phase === "error") {
    return (
      <section aria-label="Deposit funding" className="rounded-3xl border border-line bg-parchment p-5 sm:p-6">
        <FormAlert>{chain.message}</FormAlert>
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setReload((value) => value + 1)}>
          Try again
        </Button>
      </section>
    );
  }

  const { agreement, balance, configReady, mintConfigured } = chain;
  const shortfall =
    balance !== null && balance < requiredAmount ? requiredAmount - balance : null;
  const alreadyFundedOnChain = agreement !== null && agreement.status !== "initialized";

  let heading: string;
  let blurb: string;
  let action: ReactNode = null;

  if (!mintConfigured || !configReady) {
    heading = "Deployment not ready";
    blurb = "The Solana Devnet deployment is still being configured. Funding will unlock shortly.";
  } else if (!clusterOk) {
    heading = "Devnet only";
    blurb = "Deposits are only available on Solana Devnet for this release.";
  } else if (alreadyFundedOnChain) {
    heading = "Deposit funded — syncing";
    blurb = "The funding transaction is confirmed on Solana. DepositLock is verifying it now.";
    action = (
      <Button
        type="button"
        onClick={() => void finishWithReconcile()}
        disabled={reconcile.phase === "working"}
      >
        <ShieldCheck aria-hidden className="size-4" strokeWidth={1.9} />
        {reconcile.phase === "working" ? "Verifying…" : "Confirm protection"}
      </Button>
    );
  } else if (role === "landlord" && agreement) {
    heading = "Waiting for tenant to fund";
    blurb = "The vault exists on Solana. As soon as the tenant funds it — and only then — this deposit becomes protected.";
    action = <DisabledButton>Waiting for tenant to fund…</DisabledButton>;
  } else if (role === "tenant" && !agreement) {
    heading = "Waiting for the landlord";
    blurb = "The landlord must create the deposit agreement and vault first. Nothing can be funded yet.";
  } else if (!walletAddress) {
    heading = `Connect the ${role}'s wallet`;
    blurb = `This action must be signed by ${party.name}'s wallet${party.wallet ? ` (${party.wallet.slice(0, 4)}…${party.wallet.slice(-4)})` : ""}.`;
    action = (
      <Button type="button" onClick={walletIdentity.connect}>
        <Wallet aria-hidden className="size-4" strokeWidth={1.9} />
        Connect wallet
      </Button>
    );
  } else if (!walletMatches) {
    heading = `Use ${party.name}'s wallet`;
    blurb = `Your connected wallet (${walletAddress.slice(0, 4)}…${walletAddress.slice(-4)}) is not the ${role} recorded for this tenancy. Switch wallets to continue.`;
  } else if (role === "landlord") {
    heading = "Create the protected deposit";
    blurb = `Creates the on-chain agreement and its token vault for ${formatBaseUnits(requiredAmount, DEPOSIT_LOCK_MINT_DECIMALS)} ${TEST_TOKEN_DISPLAY_SYMBOL}. Your tenant funds it next — you cannot fund it yourself.`;
    action = (
      <Button type="button" onClick={runInitialize} disabled={busy}>
        <ShieldCheck aria-hidden className="size-4" strokeWidth={1.9} />
        {busy ? "Working…" : "Create Protected Deposit"}
      </Button>
    );
  } else {
    if (shortfall !== null && shortfall > BigInt(0)) {
      heading = "Top up your test tokens";
      blurb = `You need ${formatBaseUnits(shortfall, DEPOSIT_LOCK_MINT_DECIMALS, { ceilToCents: true })} more ${TEST_TOKEN_DISPLAY_SYMBOL} to fund this deposit in full.`;
      action = <DisabledButton>Fund deposit</DisabledButton>;
    } else {
      heading = "Protect the deposit";
      blurb = `Transfers exactly ${formatBaseUnits(requiredAmount, DEPOSIT_LOCK_MINT_DECIMALS)} ${TEST_TOKEN_DISPLAY_SYMBOL} into the agreement's vault. Neither of you can withdraw it alone.`;
      action = (
        <Button type="button" onClick={runFund} disabled={busy}>
          <ShieldCheck aria-hidden className="size-4" strokeWidth={1.9} />
          {busy ? "Working…" : "Protect Deposit"}
        </Button>
      );
    }
  }

  const showTxStatus = tx !== null && tx.phase !== "preparing";
  const txLink =
    tx?.signature && tx.phase !== "preparing" && tx.phase !== "approving"
      ? explorerTransactionUrl(tx.signature, SOLANA_CLUSTER)
      : null;
  const agreementLink =
    agreement ? explorerAddressUrl(agreement.address.toBase58(), SOLANA_CLUSTER) : null;

  return (
    <section
      aria-label="Deposit funding"
      className="rounded-3xl border border-line bg-parchment p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow text-subtle">On Solana Devnet</p>
          <h2 className="mt-1 text-base font-semibold text-ink">{heading}</h2>
        </div>
        {balance !== null ? (
          <p className="rounded-full border border-line bg-cream px-3.5 py-1.5 text-xs font-medium text-muted tabular-nums">
            Your balance: {formatBaseUnits(balance, DEPOSIT_LOCK_MINT_DECIMALS)} {TEST_TOKEN_DISPLAY_SYMBOL}
          </p>
        ) : null}
      </div>

      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">{blurb}</p>

      {action ? <div className="mt-5 flex flex-wrap items-center gap-3">{action}</div> : null}

      {showTxStatus && tx ? (
        <div
          role="status"
          className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-cream-raised px-4 py-3.5"
        >
          {tx.phase === "failed" ? (
            <Loader2 aria-hidden className="size-4 shrink-0 text-dispute" strokeWidth={2} />
          ) : tx.phase === "confirmed" ? (
            <ShieldCheck aria-hidden className="size-4 shrink-0 text-protected" strokeWidth={2.2} />
          ) : (
            <Loader2 aria-hidden className="size-4 shrink-0 animate-spin text-moss" strokeWidth={2} />
          )}
          <p className="text-sm font-medium text-ink">
            {tx.phase === "failed" && tx.message ? tx.message : PHASE_COPY[tx.phase]}
          </p>
          {txLink ? (
            <a
              href={txLink}
              target="_blank"
              rel="noreferrer"
              className="ml-auto inline-flex items-center gap-1.5 text-sm font-semibold text-forest underline-offset-4 hover:underline"
            >
              View transaction
              <ExternalLink aria-hidden className="size-3.5" strokeWidth={2} />
            </a>
          ) : null}
        </div>
      ) : null}

      {tx?.phase === "confirmed" && reconcile.phase === "working" ? (
        <p role="status" className="mt-3 text-sm text-muted">
          Verifying the transaction against the chain…
        </p>
      ) : null}

      {reconcile.phase === "error" ? (
        <div className="mt-4">
          <FormAlert>
            The transaction is on Solana, but reconciling with DepositLock failed:{" "}
            {reconcile.message}
          </FormAlert>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => void finishWithReconcile()}
          >
            Try verifying again
          </Button>
        </div>
      ) : null}

      {agreementLink ? (
        <p className="mt-4 border-t border-line pt-3.5 text-xs text-subtle">
          Agreement{" "}
          <a
            href={agreementLink}
            target="_blank"
            rel="noreferrer"
            className="font-mono underline-offset-4 hover:underline"
          >
            {agreement ? `${agreement.address.toBase58().slice(0, 8)}…${agreement.address.toBase58().slice(-8)}` : ""}
          </a>
          {" · "}
          {tenancy.vaultAddress
            ? `vault ${tenancy.vaultAddress.slice(0, 8)}…${tenancy.vaultAddress.slice(-8)}`
            : "vault pending"}
        </p>
      ) : null}
    </section>
  );
}

function DisabledButton({ children }: { children: ReactNode }) {
  return (
    <Button type="button" disabled>
      {children}
    </Button>
  );
}
