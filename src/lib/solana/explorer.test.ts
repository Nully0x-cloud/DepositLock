import { describe, expect, it } from "vitest";
import {
  explorerAddressUrl,
  explorerClusterLabel,
  explorerTransactionUrl,
} from "@/lib/solana/explorer";

const ADDRESS = "7VxQmF2pL9sTnR4kW1jH6cB3dY8uA5eZqX0gN4Kp2";
const SIGNATURE = "5KqXnT8vR2wY7bE3sL9mH4cD6jA1fP0gNzU2xQ8oV3i";

describe("explorerAddressUrl", () => {
  it("targets devnet by default", () => {
    expect(explorerAddressUrl(ADDRESS)).toBe(
      `https://explorer.solana.com/address/${ADDRESS}?cluster=devnet`,
    );
  });

  it("omits the cluster query on mainnet", () => {
    expect(explorerAddressUrl(ADDRESS, "mainnet-beta")).toBe(
      `https://explorer.solana.com/address/${ADDRESS}`,
    );
  });

  it("encodes the address so query characters cannot break the URL", () => {
    expect(explorerAddressUrl("a/b?c=d", "devnet")).toBe(
      "https://explorer.solana.com/address/a%2Fb%3Fc%3Dd?cluster=devnet",
    );
  });
});

describe("explorerTransactionUrl", () => {
  it("builds a devnet transaction link", () => {
    expect(explorerTransactionUrl(SIGNATURE)).toBe(
      `https://explorer.solana.com/tx/${SIGNATURE}?cluster=devnet`,
    );
  });

  it("builds a testnet transaction link", () => {
    expect(explorerTransactionUrl(SIGNATURE, "testnet")).toBe(
      `https://explorer.solana.com/tx/${SIGNATURE}?cluster=testnet`,
    );
  });
});

describe("explorerClusterLabel", () => {
  it("labels each cluster for display", () => {
    expect(explorerClusterLabel("devnet")).toBe("Devnet");
    expect(explorerClusterLabel("testnet")).toBe("Testnet");
    expect(explorerClusterLabel("mainnet-beta")).toBe("Mainnet");
  });
});
