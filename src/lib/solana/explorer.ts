import { SOLANA_CLUSTER, type SolanaCluster } from "@/lib/solana/config";

const EXPLORER_BASE = "https://explorer.solana.com";

function clusterParam(cluster: SolanaCluster): string {
  return cluster === "mainnet-beta" ? "" : `?cluster=${cluster}`;
}

function withCluster(path: string, cluster: SolanaCluster): string {
  const query = clusterParam(cluster);
  return `${EXPLORER_BASE}${path}${query}`;
}

export function explorerAddressUrl(
  address: string,
  cluster: SolanaCluster = SOLANA_CLUSTER,
): string {
  return withCluster(`/address/${encodeURIComponent(address)}`, cluster);
}

export function explorerTransactionUrl(
  signature: string,
  cluster: SolanaCluster = SOLANA_CLUSTER,
): string {
  return withCluster(`/tx/${encodeURIComponent(signature)}`, cluster);
}

export function explorerClusterLabel(
  cluster: SolanaCluster = SOLANA_CLUSTER,
): string {
  if (cluster === "mainnet-beta") return "Mainnet";
  if (cluster === "testnet") return "Testnet";
  return "Devnet";
}
