import { describe, expect, it } from "vitest";
import { describeDepositLockError, isTransactableCluster } from "./transactions";

describe("describeDepositLockError", () => {
  it("maps program custom errors to user-facing copy", () => {
    expect(describeDepositLockError("custom program error: 0x1775")).toBe(
      "Only the tenant can fund this deposit.",
    );
    expect(describeDepositLockError("custom program error: 0x177a")).toBe(
      "Your test token balance is too low for this deposit.",
    );
  });

  it("maps known Anchor errors and leaves unknown errors to their caller", () => {
    expect(describeDepositLockError("AnchorError code: 3012")).toBe(
      "The program account is not initialized.",
    );
    expect(describeDepositLockError("RPC node unavailable")).toBeNull();
    expect(describeDepositLockError("custom program error: 0x9999")).toBeNull();
  });
});

describe("isTransactableCluster", () => {
  it("allows deposit actions only on Devnet", () => {
    expect(isTransactableCluster("devnet")).toBe(true);
    expect(isTransactableCluster("testnet")).toBe(false);
    expect(isTransactableCluster("mainnet-beta")).toBe(false);
  });
});
