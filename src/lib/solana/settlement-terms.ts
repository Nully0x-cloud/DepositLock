import type { OnChainSettlementType } from "./settlement";

export type SettlementTermsInput = {
  tenancyId: string;
  settlementType: OnChainSettlementType;
  landlordAmount: bigint;
  reasonCategory?: string | null;
  description?: string | null;
  evidenceIds?: readonly string[];
};

/**
 * Hashes the canonical off-chain explanation/evidence snapshot committed by
 * the on-chain proposal. Token amounts remain independently stored and
 * enforced by the program.
 */
export async function hashSettlementTerms(input: SettlementTermsInput): Promise<Uint8Array> {
  const canonical = JSON.stringify([
    input.tenancyId.toLowerCase(),
    input.settlementType,
    input.landlordAmount.toString(),
    input.reasonCategory?.trim() ?? "",
    input.description?.trim() ?? "",
    [...(input.evidenceIds ?? [])].map((id) => id.toLowerCase()).sort(),
  ]);
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  );
  return new Uint8Array(digest);
}

export function settlementTermsHashHex(hash: Uint8Array): string {
  if (hash.length !== 32) throw new Error("Settlement terms hash must be 32 bytes.");
  return Array.from(hash, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function settlementTermsHashBytes(hash: string): Uint8Array {
  const normalized = hash.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error("Settlement terms hash must be 64 hexadecimal characters.");
  }
  return Uint8Array.from({ length: 32 }, (_, index) =>
    Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16),
  );
}
