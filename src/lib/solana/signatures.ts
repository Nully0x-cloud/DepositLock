import type { AgreementStatusName } from "./deposit";

export type SignatureStatusEntry = {
  signature: string;
  /** Non-null when the transaction failed — never used for reconciliation. */
  err: unknown;
};

export type DepositSignatures = {
  /** The `initialize_deposit` transaction (oldest successful write). */
  initialization: string;
  /** The `fund_deposit` transaction; `null` until the agreement is funded. */
  funding: string | null;
};

/**
 * Picks the initialization and funding signatures from
 * `getSignaturesForAddress(agreement)` (newest first).
 *
 * Failed attempts — a rejected fund retry, a dropped transaction — are
 * filtered first so only real writes can be recorded. With exactly the
 * successful transactions present, the oldest is initialization and the
 * newest is funding.
 */
export function pickDepositSignatures(
  entries: readonly SignatureStatusEntry[],
  status: AgreementStatusName,
): DepositSignatures {
  const successful = entries.filter((entry) => entry.err === null || entry.err === undefined);
  if (successful.length === 0) {
    throw new Error("The agreement has no successful transactions.");
  }

  const oldest = successful[successful.length - 1];
  if (status === "funded") {
    if (successful.length < 2) {
      throw new Error("A funded agreement must have an initialization and a funding transaction.");
    }
    return { initialization: oldest.signature, funding: successful[0].signature };
  }

  // Closed agreements keep the funding signature of their history; for the
  // Phase 5 states the newest write before closing is still the funding one.
  if (status === "closed" && successful.length >= 2) {
    return { initialization: oldest.signature, funding: successful[0].signature };
  }

  return { initialization: oldest.signature, funding: null };
}
