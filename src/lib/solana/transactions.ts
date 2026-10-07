import {
  Transaction,
  type BlockhashWithExpiryBlockHeight,
  type Connection,
  type PublicKey,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  SOLANA_CLUSTER,
  SOLANA_COMMITMENT,
  type SolanaCluster,
} from "./config";

/**
 * Wallet transaction lifecycle for deposit actions.
 *
 * Phases mirror the spec: preparing → approving → submitted → confirming →
 * confirmed, with `failed` as the terminal error state. Every phase except
 * `preparing` carries the explorer link material the UI needs.
 */

export type DepositTxPhase =
  | "preparing"
  | "approving"
  | "submitted"
  | "confirming"
  | "confirmed"
  | "failed";

export type DepositTxUpdate = {
  phase: DepositTxPhase;
  signature?: string;
  message?: string;
};

export type SendProgramTransactionInput = {
  connection: Connection;
  wallet: {
    publicKey: PublicKey;
    signTransaction: (transaction: Transaction) => Promise<Transaction>;
  };
  instructions: TransactionInstruction[];
  /** Mirrors each lifecycle phase into component state. */
  onPhase: (update: DepositTxUpdate) => void;
};

export type SendProgramTransactionResult = {
  signature: string;
};

/** Program error codes from `error.rs`, mapped for user-facing copy. */
const PROGRAM_ERROR_NAMES: Record<number, string> = {
  6000: "The deposit amount is invalid.",
  6001: "The amount does not match the required deposit.",
  6002: "Your wallet is not the party allowed to do this.",
  6003: "This mint is not accepted by the deployment.",
  6004: "The mint's decimals are not accepted.",
  6005: "Only the tenant can fund this deposit.",
  6006: "This deposit has already been funded.",
  6007: "The deposit is not in a state that allows this.",
  6008: "The vault account is not the agreement's vault.",
  6009: "The source token account is invalid.",
  6010: "Your test token balance is too low for this deposit.",
  6011: "Only the landlord recorded on the agreement can propose settlement terms.",
  6012: "This agreement is not ready for a settlement action.",
  6013: "There is no active settlement proposal to respond to.",
  6014: "The settlement split does not match the protected deposit.",
  6015: "The settlement proposal version could not be advanced.",
  6016: "The settlement proposal does not match this agreement.",
  6017: "The vault balance has changed; refresh the settlement before continuing.",
  6018: "The recipient token account is invalid.",
};

/** Common Anchor/runtime error codes worth naming. */
const ANCHOR_ERROR_NAMES: Record<number, string> = {
  3012: "The program account is not initialized.",
  3006: "The constraint owner is violated.",
  3008: "The constraint signer is violated.",
};

function parseErrorCode(text: string): number | null {
  const custom = text.match(/custom program error: 0x([0-9a-fA-F]+)/);
  if (custom) return Number.parseInt(custom[1], 16);
  const anchor = text.match(/AnchorError code:\s*(\d+)/);
  if (anchor) return Number.parseInt(anchor[1], 10);
  const raw = text.match(/error code:\s*(\d+)/);
  if (raw) return Number.parseInt(raw[1], 10);
  return null;
}

/**
 * Turns logs or an error message into friendly copy, or `null` when the
 * failure is not a known program error (the raw message is then shown).
 */
export function describeDepositLockError(logsOrMessage: string): string | null {
  const code = parseErrorCode(logsOrMessage);
  if (code === null) return null;
  return (
    PROGRAM_ERROR_NAMES[code] ??
    ANCHOR_ERROR_NAMES[code] ??
    null
  );
}

function errorText(error: unknown): string {
  if (error && typeof error === "object") {
    const withLogs = error as { logs?: string[]; message?: string };
    if (Array.isArray(withLogs.logs) && withLogs.logs.length > 0) {
      return withLogs.logs.join("\n");
    }
    if (typeof withLogs.message === "string") return withLogs.message;
  }
  return String(error);
}

function friendlyError(error: unknown): string {
  const text = errorText(error);
  return describeDepositLockError(text) ?? text;
}

async function confirmSignature(
  connection: Connection,
  signature: string,
  blockhash: BlockhashWithExpiryBlockHeight,
): Promise<void> {
  const result = await connection.confirmTransaction(
    { signature, ...blockhash },
    SOLANA_COMMITMENT,
  );
  if (result.value.err) {
    throw new Error(`Transaction failed: ${JSON.stringify(result.value.err)}`);
  }
}

/**
 * Signs, sends and confirms one transaction through the wallet, reporting
 * every phase. Returns the signature; throws after emitting `failed`.
 */
export async function sendProgramTransaction(
  input: SendProgramTransactionInput,
): Promise<SendProgramTransactionResult> {
  const { connection, wallet, instructions, onPhase } = input;

  onPhase({ phase: "preparing" });
  let blockhash: BlockhashWithExpiryBlockHeight;
  try {
    blockhash = await connection.getLatestBlockhash(SOLANA_COMMITMENT);
  } catch (error) {
    onPhase({ phase: "failed", message: friendlyError(error) });
    throw error;
  }

  const transaction = new Transaction({
    feePayer: wallet.publicKey,
    ...blockhash,
  }).add(...instructions);

  onPhase({ phase: "approving" });
  let signed: Transaction;
  try {
    signed = await wallet.signTransaction(transaction);
  } catch (error) {
    onPhase({ phase: "failed", message: friendlyError(error) });
    throw error;
  }

  let signature: string;
  try {
    signature = await connection.sendRawTransaction(signed.serialize(), {
      skipPreflight: false,
      preflightCommitment: SOLANA_COMMITMENT,
    });
    onPhase({ phase: "submitted", signature });
  } catch (error) {
    onPhase({ phase: "failed", message: friendlyError(error) });
    throw error;
  }

  onPhase({ phase: "confirming", signature });
  try {
    await confirmSignature(connection, signature, blockhash);
  } catch (error) {
    onPhase({
      phase: "failed",
      signature,
      message: friendlyError(error),
    });
    throw error;
  }

  onPhase({ phase: "confirmed", signature });
  return { signature };
}

/** True when this cluster is the one the app is allowed to transact on. */
export function isTransactableCluster(cluster: SolanaCluster = SOLANA_CLUSTER): boolean {
  return cluster === "devnet";
}

/** Program error extraction is shared with the reconcile route. */
export const DEPOSIT_LOCK_PROGRAM_ERROR_NAMES = PROGRAM_ERROR_NAMES;
