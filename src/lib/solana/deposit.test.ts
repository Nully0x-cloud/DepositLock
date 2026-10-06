import { Keypair, type Connection } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import {
  AGREEMENT_ACCOUNT_SIZE,
  CONFIG_ACCOUNT_SIZE,
  decodeAgreementAccount,
  decodeConfigAccount,
  fetchTokenBalance,
} from "./deposit";
import {
  AGREEMENT_ACCOUNT_DISCRIMINATOR,
  CONFIG_ACCOUNT_DISCRIMINATOR,
  TOKEN_PROGRAM_ID,
  bytesToTenancyId,
  tenancyIdToBytes,
} from "./program";

const TENANCY_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function writeU64(bytes: Uint8Array, offset: number, value: bigint): void {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setBigUint64(
    offset,
    value,
    true,
  );
}

function writeI64(bytes: Uint8Array, offset: number, value: number): void {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setBigInt64(
    offset,
    BigInt(value),
    true,
  );
}

function makeAgreement(overrides: {
  status?: number;
  requiredAmount?: bigint;
  depositedAmount?: bigint;
  createdAt?: number;
  fundedAt?: number;
}): Uint8Array {
  const landlord = Keypair.generate().publicKey;
  const tenant = Keypair.generate().publicKey;
  const mint = Keypair.generate().publicKey;
  const vault = Keypair.generate().publicKey;

  const bytes = new Uint8Array(AGREEMENT_ACCOUNT_SIZE);
  bytes.set(AGREEMENT_ACCOUNT_DISCRIMINATOR, 0);
  bytes[8] = 1;
  bytes[9] = 254;
  bytes[10] = overrides.status ?? 0;
  bytes.set(tenancyIdToBytes(TENANCY_ID), 11);
  bytes.set(landlord.toBytes(), 27);
  bytes.set(tenant.toBytes(), 59);
  bytes.set(mint.toBytes(), 91);
  bytes.set(vault.toBytes(), 123);
  writeU64(bytes, 155, overrides.requiredAmount ?? BigInt("1200000000"));
  writeU64(bytes, 163, overrides.depositedAmount ?? BigInt(0));
  writeI64(bytes, 171, overrides.createdAt ?? 1_760_000_000);
  writeI64(bytes, 179, overrides.fundedAt ?? 0);
  return bytes;
}

describe("decodeAgreementAccount", () => {
  it("round-trips every field of a synthetic account", () => {
    const address = Keypair.generate().publicKey;
    const decoded = decodeAgreementAccount(address, makeAgreement({}));

    expect(decoded.address.toBase58()).toBe(address.toBase58());
    expect(decoded.version).toBe(1);
    expect(decoded.bump).toBe(254);
    expect(decoded.status).toBe("initialized");
    expect(decoded.tenancyId).toBe(TENANCY_ID);
    expect(decoded.requiredAmount).toBe(BigInt("1200000000"));
    expect(decoded.depositedAmount).toBe(BigInt(0));
    expect(decoded.createdAt).toBe(1_760_000_000);
    expect(decoded.fundedAt).toBe(0);
  });

  it("decodes funded state and amounts", () => {
    const address = Keypair.generate().publicKey;
    const decoded = decodeAgreementAccount(
      address,
      makeAgreement({
        status: 1,
        depositedAmount: BigInt("1800000000"),
        fundedAt: 1_760_000_500,
      }),
    );

    expect(decoded.status).toBe("funded");
    expect(decoded.depositedAmount).toBe(BigInt("1800000000"));
    expect(decoded.fundedAt).toBe(1_760_000_500);
    expect(bytesToTenancyId(tenancyIdToBytes(decoded.tenancyId))).toBe(TENANCY_ID);
  });

  it("rejects foreign accounts", () => {
    const address = Keypair.generate().publicKey;
    const bytes = makeAgreement({});
    bytes[0] = 0;
    expect(() => decodeAgreementAccount(address, bytes)).toThrow(
      "not a DepositLock agreement",
    );
  });

  it("rejects truncated accounts", () => {
    const address = Keypair.generate().publicKey;
    expect(() => decodeAgreementAccount(address, new Uint8Array(10))).toThrow(
      "size",
    );
  });

  it("rejects unknown status values", () => {
    const address = Keypair.generate().publicKey;
    expect(() =>
      decodeAgreementAccount(address, makeAgreement({ status: 7 })),
    ).toThrow("Unknown agreement status");
  });
});

describe("decodeConfigAccount", () => {
  it("round-trips every field", () => {
    const address = Keypair.generate().publicKey;
    const admin = Keypair.generate().publicKey;
    const mint = Keypair.generate().publicKey;

    const bytes = new Uint8Array(CONFIG_ACCOUNT_SIZE);
    bytes.set(CONFIG_ACCOUNT_DISCRIMINATOR, 0);
    bytes[8] = 1;
    bytes[9] = 253;
    bytes.set(admin.toBytes(), 10);
    bytes.set(mint.toBytes(), 42);
    bytes[74] = 6;
    writeI64(bytes, 75, 1_760_000_000);

    const decoded = decodeConfigAccount(address, bytes);
    expect(decoded.admin.toBase58()).toBe(admin.toBase58());
    expect(decoded.allowedMint.toBase58()).toBe(mint.toBase58());
    expect(decoded.allowedDecimals).toBe(6);
    expect(decoded.bump).toBe(253);
    expect(decoded.createdAt).toBe(1_760_000_000);
  });

  it("rejects foreign accounts", () => {
    const address = Keypair.generate().publicKey;
    const bytes = new Uint8Array(CONFIG_ACCOUNT_SIZE);
    bytes[7] = 1;
    expect(() => decodeConfigAccount(address, bytes)).toThrow(
      "not a DepositLock config",
    );
  });
});

describe("fetchTokenBalance", () => {
  it("reads the classic SPL token amount at its fixed account offset", async () => {
    const owner = Keypair.generate().publicKey;
    const mint = Keypair.generate().publicKey;
    const data = new Uint8Array(165);
    data.set(mint.toBytes(), 0);
    data.set(owner.toBytes(), 32);
    writeU64(data, 64, BigInt("12500000"));
    const connection = {
      getAccountInfo: async () => ({ data, owner: TOKEN_PROGRAM_ID }),
    } as unknown as Connection;

    await expect(fetchTokenBalance(connection, owner, mint)).resolves.toMatchObject({
      exists: true,
      amount: BigInt("12500000"),
    });
  });

  it("returns a zero balance when the associated account does not exist", async () => {
    const connection = {
      getAccountInfo: async () => null,
    } as unknown as Connection;
    const result = await fetchTokenBalance(
      connection,
      Keypair.generate().publicKey,
      Keypair.generate().publicKey,
    );
    expect(result).toMatchObject({ exists: false, amount: BigInt(0) });
  });

  it("rejects a token account whose embedded mint or owner is wrong", async () => {
    const owner = Keypair.generate().publicKey;
    const mint = Keypair.generate().publicKey;
    const data = new Uint8Array(165);
    data.set(Keypair.generate().publicKey.toBytes(), 0);
    data.set(owner.toBytes(), 32);
    const connection = {
      getAccountInfo: async () => ({ data, owner: TOKEN_PROGRAM_ID }),
    } as unknown as Connection;

    await expect(fetchTokenBalance(connection, owner, mint)).rejects.toThrow(
      "does not match its expected owner and mint",
    );
  });
});
