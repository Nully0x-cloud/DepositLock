export type SolanaCluster = "devnet" | "testnet" | "mainnet-beta";

const SUPPORTED_CLUSTERS: SolanaCluster[] = ["devnet", "testnet", "mainnet-beta"];

const DEFAULT_CLUSTER: SolanaCluster = "devnet";

const PUBLIC_RPC_ENDPOINTS: Record<SolanaCluster, string> = {
  devnet: "https://api.devnet.solana.com",
  testnet: "https://api.testnet.solana.com",
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
};

function readCluster(): SolanaCluster {
  const raw = process.env.NEXT_PUBLIC_SOLANA_CLUSTER?.trim();
  return SUPPORTED_CLUSTERS.includes(raw as SolanaCluster)
    ? (raw as SolanaCluster)
    : DEFAULT_CLUSTER;
}

/**
 * Single source of truth for the cluster DepositLock talks to.
 * Swap the environment variables to move to another cluster — no component
 * should read `process.env` for Solana configuration directly.
 */
export const SOLANA_CLUSTER: SolanaCluster = readCluster();

export const SOLANA_RPC_URL: string =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() ||
  PUBLIC_RPC_ENDPOINTS[SOLANA_CLUSTER];

export type SolanaCommitment =
  | "processed"
  | "confirmed"
  | "finalized";

export const SOLANA_COMMITMENT: SolanaCommitment = "confirmed";

/** Local-storage key used by the wallet-adapter to remember the last wallet. */
export const WALLET_STORAGE_KEY = "depositlock.wallet";
