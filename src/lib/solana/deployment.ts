import { PublicKey } from "@solana/web3.js";

/**
 * Deployment constants for the Phase 5 Devnet release.
 *
 * Everything the UI and the reconcile route must agree on lives here:
 * the program id, the accepted mint and its decimals. The mint is a
 * test-only mint displayed as "test USDC" (6 decimals) created by
 * `scripts/devnet-bootstrap.mjs`; its mint authority keypair stays in the
 * gitignored `.keys/` directory.
 */

export const DEPOSIT_LOCK_PROGRAM_ADDRESS = "FX2jWasLMqeG3X4ntc8jogMgxRdbMMSxKcfTWJxexQbY";

/**
 * The accepted mint for this deployment, as committed at bootstrap time.
 * Must equal the `allowed_mint` stored in the config PDA — the client
 * cross-checks both before ever asking for a signature.
 */
export const DEPOSIT_LOCK_MINT_ADDRESS = "Unc12gXoMvv5asxgqT1FKhUaydH2XwiocPxmuNw8yum";

/** Decimals of the accepted test mint. */
export const DEPOSIT_LOCK_MINT_DECIMALS = 6;

export function depositLockMint(): PublicKey {
  if (!DEPOSIT_LOCK_MINT_ADDRESS) {
    throw new Error("The deposit mint has not been configured for this deployment.");
  }
  return new PublicKey(DEPOSIT_LOCK_MINT_ADDRESS);
}
