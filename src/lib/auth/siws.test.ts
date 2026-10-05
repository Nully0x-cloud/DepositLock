import { describe, expect, it } from "vitest";
import {
  SIWS_COPY,
  SIWS_STATEMENT,
  siwsErrorCopy,
  walletFromUser,
} from "./siws";

describe("SIWS_STATEMENT", () => {
  it("is a single line that promises no funds move", () => {
    expect(SIWS_STATEMENT).not.toMatch(/[\r\n]/);
    expect(SIWS_STATEMENT.toLowerCase()).toContain("no funds");
  });

  it("keeps every failure message jargon-free and actionable", () => {
    for (const copy of Object.values(SIWS_COPY)) {
      expect(copy.length).toBeGreaterThan(20);
      expect(copy).toMatch(/[.!]$/);
    }
  });
});

describe("siwsErrorCopy", () => {
  it("explains a rejected signature without blaming the user", () => {
    expect(siwsErrorCopy(new Error("User rejected the request"))).toBe(
      SIWS_COPY.rejected,
    );
    expect(siwsErrorCopy({ message: "Request declined by wallet" })).toBe(
      SIWS_COPY.rejected,
    );
  });

  it("separates connectivity failures from verification failures", () => {
    expect(siwsErrorCopy(new Error("Failed to fetch"))).toBe(SIWS_COPY.unreachable);
    expect(siwsErrorCopy(new TypeError("NetworkError when attempting to fetch"))).toBe(
      SIWS_COPY.unreachable,
    );
    expect(siwsErrorCopy({ message: "Invalid signature", status: 401 })).toBe(
      SIWS_COPY.invalid,
    );
  });

  it("recognises an environment where SIWS is switched off", () => {
    expect(siwsErrorCopy({ message: "Web3 sign in is not enabled" })).toBe(
      SIWS_COPY.notEnabled,
    );
  });

  it("recognises rate limiting", () => {
    expect(siwsErrorCopy({ message: "Too many requests", status: 429 })).toBe(
      SIWS_COPY.rateLimited,
    );
  });

  it("never throws and always returns usable copy", () => {
    expect(siwsErrorCopy(null)).toBe(SIWS_COPY.generic);
    expect(siwsErrorCopy(undefined)).toBe(SIWS_COPY.generic);
    expect(siwsErrorCopy("plain string")).toBe(SIWS_COPY.generic);
    expect(siwsErrorCopy({})).toBe(SIWS_COPY.generic);
    expect(siwsErrorCopy(Symbol("weird"))).toBe(SIWS_COPY.generic);
  });
});

describe("walletFromUser", () => {
  it("reads the address out of the verified session claims", () => {
    expect(
      walletFromUser({
        user_metadata: {
          custom_claims: { address: "DEVWALLET-00000000000000000000SARAH00001" },
        },
      }),
    ).toBe("DEVWALLET-00000000000000000000SARAH00001");
  });

  it("returns null for sessions that were not created by a wallet", () => {
    expect(walletFromUser(null)).toBeNull();
    expect(walletFromUser({ user_metadata: null })).toBeNull();
    expect(walletFromUser({ user_metadata: { provider: "email" } })).toBeNull();
    expect(walletFromUser({ user_metadata: { custom_claims: {} } })).toBeNull();
    expect(
      walletFromUser({ user_metadata: { custom_claims: { address: "" } } }),
    ).toBeNull();
    expect(
      walletFromUser({ user_metadata: { custom_claims: { address: 42 } } }),
    ).toBeNull();
  });
});
