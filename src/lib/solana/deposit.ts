import { PublicKey, type Connection } from "@solana/web3.js";
import {
  AGREEMENT_ACCOUNT_DISCRIMINATOR,
  CONFIG_ACCOUNT_DISCRIMINATOR,
  DEPOSIT_LOCK_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  findDepositAgreementPda,
  findDepositConfigPda,
  getAssociatedTokenAddressSync,
} from "./program";

/**
 * Chain reads for the DepositLock program. The chain is authoritative: these
 * helpers are the only way the client learns deposit state, and the server
 * repeats them independently when reconciling.
 */

export type AgreementStatusName =
  | "initialized"
  | "funded"
  | "closed"
  | "settlement_proposed"
  | "disputed";

const AGREEMENT_STATUS_NAMES: AgreementStatusName[] = [
  "initialized",
  "funded",
  "closed",
  "settlement_proposed",
  "disputed",
];

/** Fixed layout length: 8 discriminator + 3 header + 16 + 4 pubkeys + 3 × u64/i64. */
export const AGREEMENT_ACCOUNT_SIZE = 187;
/** Fixed layout length: 8 discriminator + 2 header + 32 + 32 + 1 + 8. */
export const CONFIG_ACCOUNT_SIZE = 83;

export type DepositAgreementState = {
  address: PublicKey;
  version: number;
  bump: number;
  status: AgreementStatusName;
  tenancyId: string;
  landlord: PublicKey;
  tenant: PublicKey;
  mint: PublicKey;
  vault: PublicKey;
  requiredAmount: bigint;
  depositedAmount: bigint;
  createdAt: number;
  /** Unix seconds; 0 until the agreement is funded. */
  fundedAt: number;
};

export type DepositConfigState = {
  address: PublicKey;
  version: number;
  bump: number;
  admin: PublicKey;
  allowedMint: PublicKey;
  allowedDecimals: number;
  createdAt: number;
};

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function uuidFromBytes(bytes: Uint8Array): string {
  const value = hex(bytes);
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function matchesPrefix(data: Uint8Array, prefix: Uint8Array): boolean {
  if (data.length < prefix.length) return false;
  return prefix.every((byte, index) => data[index] === byte);
}

function readU64(data: DataView, offset: number): bigint {
  return data.getBigUint64(offset, true);
}

function readPublicKey(data: Uint8Array, offset: number): PublicKey {
  return new PublicKey(data.slice(offset, offset + 32));
}

/** Decodes a Deposit Agreement account. Throws on a foreign account. */
export function decodeAgreementAccount(
  address: PublicKey,
  data: Uint8Array,
): DepositAgreementState {
  if (data.length !== AGREEMENT_ACCOUNT_SIZE) {
    throw new Error(`Unexpected deposit agreement size: ${data.length}`);
  }
  if (!matchesPrefix(data, AGREEMENT_ACCOUNT_DISCRIMINATOR)) {
    throw new Error("Account is not a DepositLock agreement.");
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const status = AGREEMENT_STATUS_NAMES[data[10]];
  if (status === undefined) {
    throw new Error(`Unknown agreement status: ${data[10]}`);
  }

  return {
    address,
    version: data[8],
    bump: data[9],
    status,
    tenancyId: uuidFromBytes(data.slice(11, 27)),
    landlord: readPublicKey(data, 27),
    tenant: readPublicKey(data, 59),
    mint: readPublicKey(data, 91),
    vault: readPublicKey(data, 123),
    requiredAmount: readU64(view, 155),
    depositedAmount: readU64(view, 163),
    createdAt: Number(view.getBigInt64(171, true)),
    fundedAt: Number(view.getBigInt64(179, true)),
  };
}

/** Decodes the deployment configuration account. Throws on a foreign account. */
export function decodeConfigAccount(
  address: PublicKey,
  data: Uint8Array,
): DepositConfigState {
  if (data.length !== CONFIG_ACCOUNT_SIZE) {
    throw new Error(`Unexpected deposit config size: ${data.length}`);
  }
  if (!matchesPrefix(data, CONFIG_ACCOUNT_DISCRIMINATOR)) {
    throw new Error("Account is not a DepositLock config.");
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    address,
    version: data[8],
    bump: data[9],
    admin: readPublicKey(data, 10),
    allowedMint: readPublicKey(data, 42),
    allowedDecimals: data[74],
    createdAt: Number(view.getBigInt64(75, true)),
  };
}

/** The agreement for a tenancy, or `null` when it has not been created yet. */
export async function fetchDepositAgreement(
  connection: Connection,
  tenancyIdBytes: Uint8Array,
): Promise<DepositAgreementState | null> {
  const [address] = findDepositAgreementPda(tenancyIdBytes);
  const info = await connection.getAccountInfo(address);
  if (!info) return null;
  if (!info.owner.equals(DEPOSIT_LOCK_PROGRAM_ID)) {
    throw new Error("Agreement PDA is not owned by the DepositLock program.");
  }
  return decodeAgreementAccount(address, info.data);
}

/** The deployment config PDA, or `null` before the program was initialized. */
export async function fetchDepositConfig(
  connection: Connection,
): Promise<DepositConfigState | null> {
  const [address] = findDepositConfigPda();
  const info = await connection.getAccountInfo(address);
  if (!info) return null;
  if (!info.owner.equals(DEPOSIT_LOCK_PROGRAM_ID)) {
    throw new Error("Config PDA is not owned by the DepositLock program.");
  }
  return decodeConfigAccount(address, info.data);
}

export type TokenBalance = {
  /** The associated token account; `null` when it does not exist yet. */
  address: PublicKey;
  exists: boolean;
  amount: bigint;
};

/** Base-unit balance of an owner's ATA for a mint (0 when missing). */
export async function fetchTokenBalance(
  connection: Connection,
  owner: PublicKey,
  mint: PublicKey,
): Promise<TokenBalance> {
  const address = getAssociatedTokenAddressSync(mint, owner);
  const info = await connection.getAccountInfo(address);
  if (!info) {
    return { address, exists: false, amount: BigInt(0) };
  }
  if (info.owner.toBase58() !== TOKEN_PROGRAM_ID.toBase58()) {
    throw new Error("Associated token account is not owned by the SPL Token program.");
  }
  if (info.data.length < 165) {
    throw new Error("Token account data is truncated.");
  }
  const accountMint = new PublicKey(info.data.slice(0, 32));
  const accountOwner = new PublicKey(info.data.slice(32, 64));
  if (!accountMint.equals(mint) || !accountOwner.equals(owner)) {
    throw new Error("Associated token account does not match its expected owner and mint.");
  }
  const view = new DataView(info.data.buffer, info.data.byteOffset, info.data.byteLength);
  return { address, exists: true, amount: readU64(view, 64) };
}
