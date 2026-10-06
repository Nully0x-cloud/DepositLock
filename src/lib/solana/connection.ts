import { Connection } from "@solana/web3.js";
import { SOLANA_COMMITMENT, SOLANA_RPC_URL } from "./config";

let shared: Connection | null = null;

/**
 * The app's single RPC connection. Memoized so every hook, action and route
 * handler talks to one connection with one commitment level.
 */
export function getSolanaConnection(): Connection {
  if (!shared) {
    shared = new Connection(SOLANA_RPC_URL, SOLANA_COMMITMENT);
  }
  return shared;
}
