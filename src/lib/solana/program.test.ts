import { createHash } from "node:crypto";
import { Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import idl from "./deposit-lock.idl.json";
import {
  AGREEMENT_ACCOUNT_DISCRIMINATOR,
  APPROVE_SETTLEMENT_DISCRIMINATOR,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  CHALLENGE_SETTLEMENT_DISCRIMINATOR,
  CONFIG_ACCOUNT_DISCRIMINATOR,
  DEPOSIT_LOCK_PROGRAM_ID,
  FUND_DEPOSIT_DISCRIMINATOR,
  INITIALIZE_CONFIG_DISCRIMINATOR,
  INITIALIZE_DEPOSIT_DISCRIMINATOR,
  INITIALIZE_SETTLEMENT_PROPOSAL_DISCRIMINATOR,
  PROPOSE_SETTLEMENT_DISCRIMINATOR,
  SETTLEMENT_ACCOUNT_DISCRIMINATOR,
  TOKEN_PROGRAM_ID,
  WITHDRAW_SETTLEMENT_PROPOSAL_DISCRIMINATOR,
  buildApproveSettlementInstruction,
  buildChallengeSettlementInstruction,
  buildFundDepositInstruction,
  buildInitializeSettlementProposalInstruction,
  buildInitializeDepositInstruction,
  buildProposeSettlementInstruction,
  buildWithdrawSettlementProposalInstruction,
  bytesToTenancyId,
  findDepositAgreementPda,
  findDepositConfigPda,
  findSettlementProposalPda,
  getAssociatedTokenAddressSync,
  tenancyIdToBytes,
} from "./program";

const TENANCY_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function sha256Discriminator(preimage: string): number[] {
  return Array.from(createHash("sha256").update(preimage).digest().subarray(0, 8));
}

function expectKeysMatchIdl(ix: TransactionInstruction, name: string): void {
  const entry = idl.instructions.find((instruction) => instruction.name === name);
  expect(entry, `IDL instruction ${name}`).toBeDefined();
  expect(ix.keys.map((key) => [key.isSigner, key.isWritable])).toEqual(
    entry!.accounts.map((account) => [Boolean(account.signer), Boolean(account.writable)]),
  );
}

describe("discriminators", () => {
  it("match the Anchor derivation (sha256 of the namespaced preimage)", () => {
    expect([...INITIALIZE_CONFIG_DISCRIMINATOR]).toEqual(
      sha256Discriminator("global:initialize_config"),
    );
    expect([...INITIALIZE_DEPOSIT_DISCRIMINATOR]).toEqual(
      sha256Discriminator("global:initialize_deposit"),
    );
    expect([...FUND_DEPOSIT_DISCRIMINATOR]).toEqual(
      sha256Discriminator("global:fund_deposit"),
    );
    expect([...AGREEMENT_ACCOUNT_DISCRIMINATOR]).toEqual(
      sha256Discriminator("account:DepositAgreement"),
    );
    expect([...CONFIG_ACCOUNT_DISCRIMINATOR]).toEqual(
      sha256Discriminator("account:DepositLockConfig"),
    );
    expect([...SETTLEMENT_ACCOUNT_DISCRIMINATOR]).toEqual(
      sha256Discriminator("account:SettlementProposal"),
    );
    expect([...INITIALIZE_SETTLEMENT_PROPOSAL_DISCRIMINATOR]).toEqual(
      sha256Discriminator("global:initialize_settlement_proposal"),
    );
    expect([...PROPOSE_SETTLEMENT_DISCRIMINATOR]).toEqual(
      sha256Discriminator("global:propose_settlement"),
    );
    expect([...WITHDRAW_SETTLEMENT_PROPOSAL_DISCRIMINATOR]).toEqual(
      sha256Discriminator("global:withdraw_settlement_proposal"),
    );
    expect([...APPROVE_SETTLEMENT_DISCRIMINATOR]).toEqual(
      sha256Discriminator("global:approve_settlement"),
    );
    expect([...CHALLENGE_SETTLEMENT_DISCRIMINATOR]).toEqual(
      sha256Discriminator("global:challenge_settlement"),
    );
  });

  it("match the committed generated Anchor IDL", () => {
    expect(idl.address).toBe(DEPOSIT_LOCK_PROGRAM_ID.toBase58());
    const instruction = (name: string) =>
      idl.instructions.find((entry) => entry.name === name)?.discriminator;
    const account = (name: string) =>
      idl.accounts.find((entry) => entry.name === name)?.discriminator;
    expect(instruction("initialize_config")).toEqual([...INITIALIZE_CONFIG_DISCRIMINATOR]);
    expect(instruction("initialize_deposit")).toEqual([...INITIALIZE_DEPOSIT_DISCRIMINATOR]);
    expect(instruction("fund_deposit")).toEqual([...FUND_DEPOSIT_DISCRIMINATOR]);
    expect(account("DepositAgreement")).toEqual([...AGREEMENT_ACCOUNT_DISCRIMINATOR]);
    expect(account("DepositLockConfig")).toEqual([...CONFIG_ACCOUNT_DISCRIMINATOR]);
    expect(instruction("initialize_settlement_proposal")).toEqual(
      [...INITIALIZE_SETTLEMENT_PROPOSAL_DISCRIMINATOR],
    );
    expect(instruction("propose_settlement")).toEqual([...PROPOSE_SETTLEMENT_DISCRIMINATOR]);
    expect(instruction("withdraw_settlement_proposal")).toEqual(
      [...WITHDRAW_SETTLEMENT_PROPOSAL_DISCRIMINATOR],
    );
    expect(instruction("approve_settlement")).toEqual([...APPROVE_SETTLEMENT_DISCRIMINATOR]);
    expect(instruction("challenge_settlement")).toEqual([...CHALLENGE_SETTLEMENT_DISCRIMINATOR]);
    expect(account("SettlementProposal")).toEqual([...SETTLEMENT_ACCOUNT_DISCRIMINATOR]);
    expect(
      idl.instructions.find((entry) => entry.name === "propose_settlement")?.args.map((arg) => arg.name),
    ).toEqual(["landlord_amount", "expected_proposal_version", "terms_hash"]);
    expect(
      idl.instructions.find((entry) => entry.name === "approve_settlement")?.args.map((arg) => arg.name),
    ).toEqual(["expected_proposal_version", "expected_terms_hash"]);
    expect(
      idl.instructions.find((entry) => entry.name === "challenge_settlement")?.args.map((arg) => arg.name),
    ).toEqual(["expected_proposal_version", "expected_terms_hash"]);
    const type = (name: string) => idl.types.find((entry) => entry.name === name)?.type;
    expect(type("AgreementStatus")).toMatchObject({
      variants: [
        { name: "Initialized" },
        { name: "Funded" },
        { name: "Closed" },
        { name: "SettlementProposed" },
        { name: "Disputed" },
      ],
    });
    expect(
      (type("DepositAgreement") as { fields: { name: string }[] }).fields.map((field) => field.name),
    ).toEqual([
      "version", "bump", "status", "tenancy_id", "landlord", "tenant", "mint",
      "vault", "required_amount", "deposited_amount", "created_at", "funded_at",
    ]);
    expect(
      (type("SettlementProposal") as { fields: { name: string }[] }).fields.map((field) => field.name),
    ).toEqual([
      "version", "bump", "agreement", "tenancy_id", "landlord", "tenant", "proposer",
      "proposal_type", "status", "landlord_amount", "tenant_amount", "proposal_version",
      "terms_hash", "proposed_at", "responded_at", "settled_tenant_amount",
      "settled_landlord_amount",
    ]);
  });
});

describe("tenancyIdToBytes", () => {
  it("accepts hyphenated uuids in RFC 4122 byte order", () => {
    expect([...tenancyIdToBytes(TENANCY_ID)]).toEqual([
      0xdd, 0xdd, 0xdd, 0xdd, 0xdd, 0xdd, 0x4d, 0xdd,
      0x8d, 0xdd, 0xdd, 0xdd, 0xdd, 0xdd, 0xdd, 0xdd,
    ]);
  });

  it("accepts the compact form and round-trips through bytesToTenancyId", () => {
    const bytes = tenancyIdToBytes("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(bytesToTenancyId(bytes)).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  });

  it("rejects malformed ids", () => {
    expect(() => tenancyIdToBytes("not-a-uuid")).toThrow("Invalid tenancy id");
  });
});

describe("PDAs", () => {
  it("derives a stable config PDA under the program", () => {
    const [address, bump] = findDepositConfigPda();
    expect(address).toBeInstanceOf(PublicKey);
    expect(bump).toBeGreaterThanOrEqual(0);
    expect(bump).toBeLessThanOrEqual(255);
    const [again] = findDepositConfigPda();
    expect(again.toBase58()).toBe(address.toBase58());
  });

  it("derives agreement PDAs that differ per tenancy", () => {
    const [first] = findDepositAgreementPda(tenancyIdToBytes(TENANCY_ID));
    const [second] = findDepositAgreementPda(
      tenancyIdToBytes("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
    );
    expect(first.toBase58()).not.toBe(second.toBase58());
  });
});

describe("getAssociatedTokenAddressSync", () => {
  it("matches the canonical SPL associated token derivation", () => {
    const mint = Keypair.generate().publicKey;
    const owner = Keypair.generate().publicKey;
    const derived = getAssociatedTokenAddressSync(mint, owner);

    const [expected] = PublicKey.findProgramAddressSync(
      [
        owner.toBuffer(),
        TOKEN_PROGRAM_ID.toBuffer(),
        mint.toBuffer(),
      ],
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    expect(derived.toBase58()).toBe(expected.toBase58());
  });
});

function dataBytes(ix: TransactionInstruction): number[] {
  return [...ix.data];
}

describe("instruction builders", () => {
  const landlord = Keypair.generate().publicKey;
  const tenant = Keypair.generate().publicKey;
  const mint = Keypair.generate().publicKey;

  it("builds initialize_deposit with the landlord as sole signer", () => {
    const tenancyIdBytes = tenancyIdToBytes(TENANCY_ID);
    const ix = buildInitializeDepositInstruction({
      landlord,
      tenant,
      mint,
      tenancyIdBytes,
      requiredAmount: BigInt("1200000000"),
    });

    expect(ix.programId.toBase58()).toBe(DEPOSIT_LOCK_PROGRAM_ID.toBase58());
    expectKeysMatchIdl(ix, "initialize_deposit");
    expect(dataBytes(ix).slice(0, 8)).toEqual([...INITIALIZE_DEPOSIT_DISCRIMINATOR]);
    expect(dataBytes(ix).slice(8, 24)).toEqual([...tenancyIdBytes]);
    const amount = Buffer.from(dataBytes(ix).slice(24)).readBigUInt64LE();
    expect(amount).toBe(BigInt("1200000000"));

    const signers = ix.keys.filter((meta) => meta.isSigner);
    expect(signers).toHaveLength(1);
    expect(signers[0].pubkey.toBase58()).toBe(landlord.toBase58());

    const [agreement] = findDepositAgreementPda(tenancyIdBytes);
    expect(ix.keys[4].pubkey.toBase58()).toBe(agreement.toBase58());
    expect(ix.keys[5].pubkey.toBase58()).toBe(
      getAssociatedTokenAddressSync(mint, agreement).toBase58(),
    );
  });

  it("builds fund_deposit with only the tenant as signer", () => {
    const tenancyIdBytes = tenancyIdToBytes(TENANCY_ID);
    const ix = buildFundDepositInstruction({
      tenant,
      mint,
      tenancyIdBytes,
      amount: BigInt("1200000000"),
    });

    expectKeysMatchIdl(ix, "fund_deposit");
    expect(dataBytes(ix).slice(0, 8)).toEqual([...FUND_DEPOSIT_DISCRIMINATOR]);
    const amount = Buffer.from(dataBytes(ix).slice(8)).readBigUInt64LE();
    expect(amount).toBe(BigInt("1200000000"));

    const signers = ix.keys.filter((meta) => meta.isSigner);
    expect(signers).toHaveLength(1);
    expect(signers[0].pubkey.toBase58()).toBe(tenant.toBase58());

    const [agreement] = findDepositAgreementPda(tenancyIdBytes);
    expect(ix.keys[1].pubkey.toBase58()).toBe(agreement.toBase58());
    expect(ix.keys[3].pubkey.toBase58()).toBe(
      getAssociatedTokenAddressSync(mint, tenant).toBase58(),
    );
    expect(ix.keys[4].pubkey.toBase58()).toBe(
      getAssociatedTokenAddressSync(mint, agreement).toBase58(),
    );
  });

  it("rejects amounts that do not fit a u64", () => {
    expect(() =>
      buildFundDepositInstruction({
        tenant,
        mint,
        tenancyIdBytes: tenancyIdToBytes(TENANCY_ID),
        amount: BigInt("18446744073709551616"),
      }),
    ).toThrow("u64");
  });
});

describe("settlement instruction builders", () => {
  const landlord = Keypair.generate().publicKey;
  const tenant = Keypair.generate().publicKey;
  const mint = Keypair.generate().publicKey;
  const tenancyIdBytes = tenancyIdToBytes(TENANCY_ID);

  it("creates and proposes against the canonical settlement PDA", () => {
    const [agreement] = findDepositAgreementPda(tenancyIdBytes);
    const [settlement] = findSettlementProposalPda(agreement);
    const initialize = buildInitializeSettlementProposalInstruction({
      landlord,
      tenancyIdBytes,
    });
    expectKeysMatchIdl(initialize, "initialize_settlement_proposal");
    expect(initialize.keys[0]).toMatchObject({ pubkey: landlord, isSigner: true, isWritable: true });
    expect(initialize.keys[1].pubkey.toBase58()).toBe(agreement.toBase58());
    expect(initialize.keys[2].pubkey.toBase58()).toBe(settlement.toBase58());
    expect([...initialize.data]).toEqual([...INITIALIZE_SETTLEMENT_PROPOSAL_DISCRIMINATOR]);

    const termsHash = Uint8Array.from({ length: 32 }, (_, index) => index);
    const propose = buildProposeSettlementInstruction({
      landlord,
      tenancyIdBytes,
      mint,
      landlordAmount: BigInt("150000000"),
      expectedProposalVersion: BigInt(1),
      termsHash,
    });
    expectKeysMatchIdl(propose, "propose_settlement");
    expect([...propose.data.slice(0, 8)]).toEqual([...PROPOSE_SETTLEMENT_DISCRIMINATOR]);
    expect(Buffer.from(propose.data.slice(8, 16)).readBigUInt64LE()).toBe(
      BigInt("150000000"),
    );
    expect(Buffer.from(propose.data.slice(16, 24)).readBigUInt64LE()).toBe(BigInt(1));
    expect([...propose.data.slice(24)]).toEqual([...termsHash]);
    expect(propose.keys[2].pubkey.toBase58()).toBe(settlement.toBase58());
    expect(propose.keys[4].pubkey.toBase58()).toBe(
      getAssociatedTokenAddressSync(mint, agreement).toBase58(),
    );
  });

  it("uses tenant and landlord canonical ATAs for atomic approval", () => {
    const [agreement] = findDepositAgreementPda(tenancyIdBytes);
    const [settlement] = findSettlementProposalPda(agreement);
    const approve = buildApproveSettlementInstruction({
      tenant,
      landlord,
      mint,
      tenancyIdBytes,
      expectedProposalVersion: BigInt(2),
      expectedTermsHash: new Uint8Array(32).fill(7),
    });
    expectKeysMatchIdl(approve, "approve_settlement");
    expect([...approve.data.slice(0, 8)]).toEqual([...APPROVE_SETTLEMENT_DISCRIMINATOR]);
    expect(Buffer.from(approve.data.slice(8, 16)).readBigUInt64LE()).toBe(BigInt(2));
    expect(approve.keys[0]).toMatchObject({ pubkey: tenant, isSigner: true, isWritable: true });
    expect(approve.keys[1].pubkey.toBase58()).toBe(landlord.toBase58());
    expect(approve.keys[2].pubkey.toBase58()).toBe(agreement.toBase58());
    expect(approve.keys[3].pubkey.toBase58()).toBe(settlement.toBase58());
    expect(approve.keys[6].pubkey.toBase58()).toBe(
      getAssociatedTokenAddressSync(mint, tenant).toBase58(),
    );
    expect(approve.keys[7].pubkey.toBase58()).toBe(
      getAssociatedTokenAddressSync(mint, landlord).toBase58(),
    );
  });

  it("builds withdrawal and challenge instructions with the required party signer", () => {
    const withdraw = buildWithdrawSettlementProposalInstruction({
      landlord,
      tenancyIdBytes,
      expectedProposalVersion: BigInt(2),
      expectedTermsHash: new Uint8Array(32).fill(8),
    });
    expectKeysMatchIdl(withdraw, "withdraw_settlement_proposal");
    expect([...withdraw.data.slice(0, 8)]).toEqual([...WITHDRAW_SETTLEMENT_PROPOSAL_DISCRIMINATOR]);
    expect(withdraw.keys[0]).toMatchObject({ pubkey: landlord, isSigner: true });

    const challenge = buildChallengeSettlementInstruction({
      tenant,
      tenancyIdBytes,
      expectedProposalVersion: BigInt(2),
      expectedTermsHash: new Uint8Array(32).fill(9),
    });
    expectKeysMatchIdl(challenge, "challenge_settlement");
    expect([...challenge.data.slice(0, 8)]).toEqual([...CHALLENGE_SETTLEMENT_DISCRIMINATOR]);
    expect(challenge.keys[0]).toMatchObject({ pubkey: tenant, isSigner: true });
  });

  it("rejects malformed terms hashes before creating a transaction", () => {
    expect(() =>
      buildProposeSettlementInstruction({
        landlord,
        tenancyIdBytes,
        mint,
        landlordAmount: BigInt(0),
        expectedProposalVersion: BigInt(1),
        termsHash: new Uint8Array(31),
      }),
    ).toThrow("32 bytes");
  });
});
