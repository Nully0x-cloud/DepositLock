import { describe, expect, it } from "vitest";
import { hasWalletMismatch, signOutOnDisconnect } from "./session-sync";

const WALLET_A = "DEVWALLET-00000000000000000000SARAH00001";
const WALLET_B = "DEVWALLET-00000000000000000000OTHER0001";

describe("hasWalletMismatch", () => {
  it("fires only when a live session and a different connected wallet coexist", () => {
    expect(hasWalletMismatch(WALLET_A, WALLET_B)).toBe(true);
    expect(hasWalletMismatch(WALLET_B, WALLET_A)).toBe(true);
  });

  it("keeps the session while the wallets agree", () => {
    expect(hasWalletMismatch(WALLET_A, WALLET_A)).toBe(false);
  });

  it("never signs out on guesswork while either side is unknown", () => {
    expect(hasWalletMismatch(WALLET_A, null)).toBe(false);
    expect(hasWalletMismatch(null, WALLET_B)).toBe(false);
    expect(hasWalletMismatch(null, null)).toBe(false);
    expect(hasWalletMismatch("", WALLET_B)).toBe(false);
  });
});

describe("signOutOnDisconnect", () => {
  it("drops the session when the wallet disconnects", () => {
    expect(signOutOnDisconnect(true)).toBe(true);
  });

  it("does nothing without a session", () => {
    expect(signOutOnDisconnect(false)).toBe(false);
  });
});
