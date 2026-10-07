import { PublicKey, type Connection } from "@solana/web3.js";
import { DEPOSIT_LOCK_PROGRAM_ID } from "./program";
import {
  SETTLEMENT_ACCOUNT_DISCRIMINATOR,
  findDepositAgreementPda,
  findSettlementProposalPda,
} from "./program";

export type OnChainSettlementType = "full_return" | "partial_deduction";
export type OnChainSettlementStatus =
  | "draft"
  | "active"
  | "withdrawn"
  | "challenged"
  | "executed";

export const SETTLEMENT_PROPOSAL_ACCOUNT_SIZE = 244;

export type SettlementProposalState = {
  address: PublicKey;
  version: number;
  bump: number;
  agreement: PublicKey;
  tenancyId: string;
  landlord: PublicKey;
  tenant: PublicKey;
  proposer: PublicKey;
  proposalType: OnChainSettlementType;
  status: OnChainSettlementStatus;
  landlordAmount: bigint;
  tenantAmount: bigint;
  proposalVersion: bigint;
  termsHash: string;
  proposedAt: number;
  respondedAt: number;
  /** Payouts actually executed; may include unsolicited vault tokens returned to tenant. */
  settledTenantAmount: bigint;
  settledLandlordAmount: bigint;
};

const TYPE_NAMES: OnChainSettlementType[] = ["full_return", "partial_deduction"];
const STATUS_NAMES: OnChainSettlementStatus[] = [
  "draft",
  "active",
  "withdrawn",
  "challenged",
  "executed",
];

function readPublicKey(data: Uint8Array, offset: number): PublicKey {
  return new PublicKey(data.slice(offset, offset + 32));
}

function readHash(data: Uint8Array, offset: number): string {
  return Array.from(data.slice(offset, offset + 32), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function uuidFromBytes(data: Uint8Array): string {
  const value = readHash(data, 0);
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function hasDiscriminator(data: Uint8Array): boolean {
  return SETTLEMENT_ACCOUNT_DISCRIMINATOR.every((value, index) => data[index] === value);
}

export function decodeSettlementProposalAccount(
  address: PublicKey,
  data: Uint8Array,
): SettlementProposalState {
  if (data.length !== SETTLEMENT_PROPOSAL_ACCOUNT_SIZE) {
    throw new Error(`Unexpected settlement proposal size: ${data.length}`);
  }
  if (!hasDiscriminator(data)) {
    throw new Error("Account is not a DepositLock settlement proposal.");
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const proposalType = TYPE_NAMES[data[154]];
  const status = STATUS_NAMES[data[155]];
  if (proposalType === undefined || status === undefined) {
    throw new Error("Settlement proposal contains an unknown enum value.");
  }

  return {
    address,
    version: data[8],
    bump: data[9],
    agreement: readPublicKey(data, 10),
    tenancyId: uuidFromBytes(data.slice(42, 58)),
    landlord: readPublicKey(data, 58),
    tenant: readPublicKey(data, 90),
    proposer: readPublicKey(data, 122),
    proposalType,
    status,
    landlordAmount: view.getBigUint64(156, true),
    tenantAmount: view.getBigUint64(164, true),
    proposalVersion: view.getBigUint64(172, true),
    termsHash: readHash(data, 180),
    proposedAt: Number(view.getBigInt64(212, true)),
    respondedAt: Number(view.getBigInt64(220, true)),
    settledTenantAmount: view.getBigUint64(228, true),
    settledLandlordAmount: view.getBigUint64(236, true),
  };
}

export async function fetchSettlementProposal(
  connection: Connection,
  tenancyIdBytes: Uint8Array,
): Promise<SettlementProposalState | null> {
  const [agreement] = findDepositAgreementPda(tenancyIdBytes);
  const [address] = findSettlementProposalPda(agreement);
  const info = await connection.getAccountInfo(address);
  if (!info) return null;
  if (!info.owner.equals(DEPOSIT_LOCK_PROGRAM_ID)) {
    throw new Error("Settlement proposal PDA is not owned by the DepositLock program.");
  }
  const state = decodeSettlementProposalAccount(address, info.data);
  if (!state.agreement.equals(agreement)) {
    throw new Error("Settlement proposal points at another agreement.");
  }
  return state;
}
