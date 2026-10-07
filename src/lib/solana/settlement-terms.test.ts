import { describe, expect, it } from "vitest";
import {
  hashSettlementTerms,
  settlementTermsHashBytes,
  settlementTermsHashHex,
} from "./settlement-terms";

describe("settlement terms commitment", () => {
  it("canonicalizes descriptions and evidence ordering", async () => {
    const first = await hashSettlementTerms({
      tenancyId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
      settlementType: "partial_deduction",
      landlordAmount: BigInt(150000000),
      reasonCategory: " cleaning ",
      description: "  Deep clean  ",
      evidenceIds: ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
    });
    const same = await hashSettlementTerms({
      tenancyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      settlementType: "partial_deduction",
      landlordAmount: BigInt(150000000),
      reasonCategory: "cleaning",
      description: "Deep clean",
      evidenceIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
    });
    expect(settlementTermsHashHex(first)).toBe(settlementTermsHashHex(same));
  });

  it("changes when the settlement amount or reason changes", async () => {
    const base = {
      tenancyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      settlementType: "partial_deduction" as const,
      landlordAmount: BigInt(150000000),
      reasonCategory: "cleaning",
      description: "Deep clean",
    };
    const original = settlementTermsHashHex(await hashSettlementTerms(base));
    expect(
      settlementTermsHashHex(
        await hashSettlementTerms({ ...base, landlordAmount: BigInt(151000000) }),
      ),
    ).not.toBe(original);
    expect(
      settlementTermsHashHex(
        await hashSettlementTerms({ ...base, description: "Different terms" }),
      ),
    ).not.toBe(original);
  });

  it("round-trips a 32-byte hash and rejects malformed hex", async () => {
    const hash = await hashSettlementTerms({
      tenancyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      settlementType: "full_return",
      landlordAmount: BigInt(0),
    });
    expect(settlementTermsHashBytes(settlementTermsHashHex(hash))).toEqual(hash);
    expect(() => settlementTermsHashBytes("abc")).toThrow("64 hexadecimal");
  });
});
