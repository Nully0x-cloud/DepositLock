/**
 * Pure session↔wallet synchronization decisions.
 *
 * The database never trusts any of this (profiles re-derive the wallet from
 * `auth.identities` on every write); these rules only decide when the app
 * should drop a stale browser session so the UI and the verified wallet can
 * never disagree.
 */

/**
 * True when the wallet connected in the Solana adapter is a *different*
 * address than the one proven by the signed-in session.
 *
 * - No session → nothing to invalidate.
 * - Either side unknown (auto-connect still settling, or a session created
 *   without wallet claims) → never sign out on guesswork.
 */
export function hasWalletMismatch(
  sessionWallet: string | null,
  connectedWallet: string | null,
): boolean {
  if (!sessionWallet || !connectedWallet) return false;
  return sessionWallet !== connectedWallet;
}

/**
 * A wallet adapter `disconnect` event means the user (or the wallet) ended
 * the connection — the app session that was proven *through* that wallet
 * goes with it. No session → nothing to do.
 */
export function signOutOnDisconnect(hasSession: boolean): boolean {
  return hasSession;
}
