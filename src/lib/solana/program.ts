import { Buffer } from "buffer";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { DEPOSIT_LOCK_PROGRAM_ADDRESS } from "./deployment";

/**
 * DepositLock program primitives: addresses, PDAs and instruction builders.
 *
 * The Anchor client is intentionally not a dependency of the web app — the
 * instruction layout is small and stable, so the discriminators and account
 * lists are encoded here directly. `program.test.ts` cross-checks every
 * discriminator against the committed IDL so the two can never drift apart.
 */

export const DEPOSIT_LOCK_PROGRAM_ID = new PublicKey(DEPOSIT_LOCK_PROGRAM_ADDRESS);

export const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);

export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);

export const SYSTEM_PROGRAM_ID = PublicKey.default;

const CONFIG_SEED = Buffer.from("depositlock_config");
const AGREEMENT_SEED = Buffer.from("deposit");

/** sha256("global:<name>")[0..8], precomputed — see program.test.ts. */
export const INITIALIZE_CONFIG_DISCRIMINATOR = Uint8Array.from([
  208, 127, 21, 1, 194, 190, 196, 70,
]);
export const INITIALIZE_DEPOSIT_DISCRIMINATOR = Uint8Array.from([
  171, 65, 93, 225, 61, 109, 31, 227,
]);
export const FUND_DEPOSIT_DISCRIMINATOR = Uint8Array.from([
  149, 24, 209, 94, 206, 202, 144, 233,
]);

/** sha256("account:<Name>")[0..8] — the 8-byte Anchor account prefix. */
export const AGREEMENT_ACCOUNT_DISCRIMINATOR = Uint8Array.from([
  215, 134, 114, 207, 161, 37, 231, 136,
]);
export const CONFIG_ACCOUNT_DISCRIMINATOR = Uint8Array.from([
  100, 201, 249, 97, 88, 98, 177, 123,
]);

/** Deployment-specific configuration PDA (`["depositlock_config"]`). */
export function findDepositConfigPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [CONFIG_SEED],
    DEPOSIT_LOCK_PROGRAM_ID,
  );
}

/**
 * Deposit Agreement PDA for one tenancy: `["deposit", <16 uuid bytes>]`.
 * Accepts the uuid in any of the standard hyphenated/base formats.
 */
export function findDepositAgreementPda(tenancyIdBytes: Uint8Array): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [AGREEMENT_SEED, Buffer.from(tenancyIdBytes)],
    DEPOSIT_LOCK_PROGRAM_ID,
  );
}

/** Canonical associated token address (classic SPL Token program). */
export function getAssociatedTokenAddressSync(
  mint: PublicKey,
  owner: PublicKey,
): PublicKey {
  const [address] = PublicKey.findProgramAddressSync(
    [
      owner.toBuffer(),
      TOKEN_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  return address;
}

const UUID_PATTERN =
  /^[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}$/;

/**
 * The tenancy uuid as the 16 raw bytes the program stores (RFC 4122 byte
 * order — the hex digits in their natural order, hyphens removed).
 */
export function tenancyIdToBytes(tenancyId: string): Uint8Array {
  const compact = tenancyId.trim().replace(/-/g, "");
  if (!UUID_PATTERN.test(tenancyId.trim()) || compact.length !== 32) {
    throw new Error(`Invalid tenancy id: ${tenancyId}`);
  }
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) {
    bytes[i] = Number.parseInt(compact.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Hex string of the raw 16 bytes, for comparing against decoded accounts. */
export function bytesToTenancyId(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function encodeU64(value: bigint): Uint8Array {
  if (value < BigInt(0) || value > BigInt("18446744073709551615")) {
    throw new Error("Amount does not fit in a u64");
  }
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, value, true);
  return out;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export type InitializeDepositInput = {
  /** The landlord's wallet — signs and pays for the agreement + vault. */
  landlord: PublicKey;
  /** The tenant's wallet — recorded on the agreement, never signs here. */
  tenant: PublicKey;
  mint: PublicKey;
  tenancyIdBytes: Uint8Array;
  /** Required deposit in mint base units (integer, never a float). */
  requiredAmount: bigint;
};

/**
 * `initialize_deposit` — landlord-signed creation of the agreement PDA and
 * its deterministic token vault. Account order mirrors the Anchor context.
 */
export function buildInitializeDepositInstruction(
  input: InitializeDepositInput,
): TransactionInstruction {
  const [config] = findDepositConfigPda();
  const [agreement] = findDepositAgreementPda(input.tenancyIdBytes);
  const vault = getAssociatedTokenAddressSync(input.mint, agreement);

  return new TransactionInstruction({
    programId: DEPOSIT_LOCK_PROGRAM_ID,
    keys: [
      { pubkey: input.landlord, isSigner: true, isWritable: true },
      { pubkey: input.tenant, isSigner: false, isWritable: false },
      { pubkey: config, isSigner: false, isWritable: false },
      { pubkey: input.mint, isSigner: false, isWritable: false },
      { pubkey: agreement, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(concatBytes(
      INITIALIZE_DEPOSIT_DISCRIMINATOR,
      input.tenancyIdBytes,
      encodeU64(input.requiredAmount),
    )),
  });
}

export type FundDepositInput = {
  /** The tenant's wallet — signs; the transfer authority is this signature. */
  tenant: PublicKey;
  mint: PublicKey;
  tenancyIdBytes: Uint8Array;
  /** Must equal the agreement's required amount exactly. */
  amount: bigint;
};

/**
 * `fund_deposit` — tenant-signed exact funding of the vault. The source is
 * the tenant's canonical ATA, derived here so a non-canonical account can
 * never be passed.
 */
export function buildFundDepositInstruction(input: FundDepositInput): TransactionInstruction {
  const [agreement] = findDepositAgreementPda(input.tenancyIdBytes);
  const source = getAssociatedTokenAddressSync(input.mint, input.tenant);
  const vault = getAssociatedTokenAddressSync(input.mint, agreement);

  return new TransactionInstruction({
    programId: DEPOSIT_LOCK_PROGRAM_ID,
    keys: [
      { pubkey: input.tenant, isSigner: true, isWritable: true },
      { pubkey: agreement, isSigner: false, isWritable: true },
      { pubkey: input.mint, isSigner: false, isWritable: false },
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(concatBytes(FUND_DEPOSIT_DISCRIMINATOR, encodeU64(input.amount))),
  });
}
