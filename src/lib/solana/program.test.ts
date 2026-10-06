import { createHash } from "node:crypto";
import { Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import idl from "./idl-discriminators.json";
import {
  AGREEMENT_ACCOUNT_DISCRIMINATOR,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  CONFIG_ACCOUNT_DISCRIMINATOR,
  DEPOSIT_LOCK_PROGRAM_ID,
  FUND_DEPOSIT_DISCRIMINATOR,
  INITIALIZE_CONFIG_DISCRIMINATOR,
  INITIALIZE_DEPOSIT_DISCRIMINATOR,
  TOKEN_PROGRAM_ID,
  buildFundDepositInstruction,
  buildInitializeDepositInstruction,
  bytesToTenancyId,
  findDepositAgreementPda,
  findDepositConfigPda,
  getAssociatedTokenAddressSync,
  tenancyIdToBytes,
} from "./program";

const TENANCY_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function sha256Discriminator(preimage: string): number[] {
  return Array.from(createHash("sha256").update(preimage).digest().subarray(0, 8));
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
  });

  it("match the committed Anchor IDL discriminator manifest", () => {
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
