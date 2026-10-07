import { Keypair } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import {
  SETTLEMENT_PROPOSAL_ACCOUNT_SIZE,
  decodeSettlementProposalAccount,
} from "./settlement";
import {
  SETTLEMENT_ACCOUNT_DISCRIMINATOR,
  tenancyIdToBytes,
} from "./program";

function writeI64(data: Uint8Array, offset: number, value: number): void {
  new DataView(data.buffer, data.byteOffset, data.byteLength).setBigInt64(
    offset,
    BigInt(value),
    true,
  );
}

function writeU64(data: Uint8Array, offset: number, value: bigint): void {
  new DataView(data.buffer, data.byteOffset, data.byteLength).setBigUint64(
    offset,
    value,
    true,
  );
}

describe("decodeSettlementProposalAccount", () => {
  it("decodes parties, exact split, proposal version, and lifecycle", () => {
    const address = Keypair.generate().publicKey;
    const agreement = Keypair.generate().publicKey;
    const landlord = Keypair.generate().publicKey;
    const tenant = Keypair.generate().publicKey;
    const proposer = landlord;
    const data = new Uint8Array(SETTLEMENT_PROPOSAL_ACCOUNT_SIZE);
    data.set(SETTLEMENT_ACCOUNT_DISCRIMINATOR, 0);
    data[8] = 1;
    data[9] = 254;
    data.set(agreement.toBytes(), 10);
    data.set(tenancyIdToBytes("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"), 42);
    data.set(landlord.toBytes(), 58);
    data.set(tenant.toBytes(), 90);
    data.set(proposer.toBytes(), 122);
    data[154] = 1;
    data[155] = 1;
    writeU64(data, 156, BigInt("150000000"));
    writeU64(data, 164, BigInt("1650000000"));
    writeU64(data, 172, BigInt(2));
    data.set(Uint8Array.from({ length: 32 }, (_, index) => index), 180);
    writeI64(data, 212, 1_800_000_000);
    writeI64(data, 220, 0);
    writeU64(data, 228, BigInt("1650000000"));
    writeU64(data, 236, BigInt("150000000"));

    const proposal = decodeSettlementProposalAccount(address, data);
    expect(proposal.address.equals(address)).toBe(true);
    expect(proposal.agreement.equals(agreement)).toBe(true);
    expect(proposal.tenancyId).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(proposal.landlord.equals(landlord)).toBe(true);
    expect(proposal.tenant.equals(tenant)).toBe(true);
    expect(proposal.proposer.equals(landlord)).toBe(true);
    expect(proposal.proposalType).toBe("partial_deduction");
    expect(proposal.status).toBe("active");
    expect(proposal.landlordAmount).toBe(BigInt("150000000"));
    expect(proposal.tenantAmount).toBe(BigInt("1650000000"));
    expect(proposal.proposalVersion).toBe(BigInt(2));
    expect(proposal.termsHash).toBe(
      "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
    );
    expect(proposal.proposedAt).toBe(1_800_000_000);
    expect(proposal.respondedAt).toBe(0);
    expect(proposal.settledTenantAmount).toBe(BigInt("1650000000"));
    expect(proposal.settledLandlordAmount).toBe(BigInt("150000000"));
  });

  it("rejects wrong-sized and foreign accounts", () => {
    const address = Keypair.generate().publicKey;
    expect(() => decodeSettlementProposalAccount(address, new Uint8Array(10))).toThrow(
      "Unexpected settlement proposal size",
    );
    const data = new Uint8Array(SETTLEMENT_PROPOSAL_ACCOUNT_SIZE);
    expect(() => decodeSettlementProposalAccount(address, data)).toThrow(
      "not a DepositLock settlement proposal",
    );
  });
});
