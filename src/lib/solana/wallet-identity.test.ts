import { describe, expect, it } from "vitest";
import {
  describeWalletError,
  isCancellationMessage,
  shortenAddress,
} from "@/lib/solana/wallet-identity";

describe("shortenAddress", () => {
  it("keeps four characters at each edge of a base58 public key", () => {
    const address = "7VxQmF2pL9sTnR4kW1jH6cB3dY8uA5eZqX0gN4Kp2";
    expect(shortenAddress(address)).toBe("7VxQ...4Kp2");
    expect(shortenAddress(address)).toHaveLength(11);
  });

  it("trims whitespace before formatting", () => {
    expect(shortenAddress("  7VxQmF2pL9sTnR4kW1jH6cB3dY8uA5eZqX0gN4Kp2  ")).toBe(
      "7VxQ...4Kp2",
    );
  });

  it("returns short values untouched", () => {
    expect(shortenAddress("abc")).toBe("abc");
    expect(shortenAddress("")).toBe("");
    expect(shortenAddress("012345678")).toBe("012345678");
    expect(shortenAddress("01234567890")).toBe("0123...7890");
  });

  it("honours custom edge lengths", () => {
    const address = "7VxQmF2pL9sTnR4kW1jH6cB3dY8uA5eZqX0gN4Kp2";
    expect(shortenAddress(address, 6, 2)).toBe("7VxQmF...p2");
  });
});

describe("describeWalletError", () => {
  it("reports a rejected request as a cancellation", () => {
    expect(describeWalletError({ code: 4001 })).toBe("Connection cancelled");
    expect(
      describeWalletError(new Error("User rejected the request")),
    ).toBe("Connection cancelled");
    expect(describeWalletError("The user declined the connection")).toBe(
      "Connection cancelled",
    );
  });

  it("explains a wallet that is not installed", () => {
    expect(describeWalletError(new Error("Wallet not ready"))).toBe(
      "That wallet is not available in this browser yet.",
    );
    expect(describeWalletError("Adapter is not detected")).toBe(
      "That wallet is not available in this browser yet.",
    );
  });

  it("explains a timeout", () => {
    expect(describeWalletError(new Error("Request timed out"))).toBe(
      "The wallet took too long to respond. Please try again.",
    );
  });

  it("falls back to generic copy rather than leaking a raw error", () => {
    expect(describeWalletError(new Error("ECONNREFUSED 127.0.0.1:8899"))).toBe(
      "We could not connect to that wallet. Please try again.",
    );
    expect(describeWalletError(undefined)).toBe(
      "We could not connect to that wallet. Please try again.",
    );
  });
});

describe("isCancellationMessage", () => {
  it("recognises only the cancellation copy", () => {
    expect(isCancellationMessage("Connection cancelled")).toBe(true);
    expect(isCancellationMessage("Connection cancelled.")).toBe(false);
    expect(isCancellationMessage("We could not connect.")).toBe(false);
  });
});
