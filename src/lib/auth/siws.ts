/**
 * Sign in with Solana (SIWS) — application-facing vocabulary.
 *
 * The message itself is built and verified by `@supabase/supabase-js`
 * (`auth.signInWithWeb3`) against Supabase Auth, so this module only owns the
 * things DepositLock must control: the human-readable statement, extracting
 * the verified wallet from a session, and turning SDK/GoTrue failures into
 * copy a person can act on.
 */

/**
 * Shown inside the wallet's signature request.
 *
 * Deliberately jargon-free and explicit about what is NOT happening: this is
 * an ownership proof, never a transaction.
 */
export const SIWS_STATEMENT =
  "Sign in to DepositLock. No funds will move.";

/** Friendly copy for the failure modes of the sign-in handshake. */
export const SIWS_COPY = {
  rejected:
    "The signature was cancelled. Nothing was sent — try again whenever you're ready.",
  unreachable:
    "We couldn't reach DepositLock's sign-in service. Check your connection and try again.",
  notEnabled:
    "Sign in with Solana isn't turned on for this DepositLock environment yet.",
  rateLimited:
    "Too many sign-in attempts. Give it a moment, then try again.",
  invalid:
    "We couldn't verify that signature. Try signing in again.",
  generic:
    "Something went wrong while verifying your wallet. Please try again.",
} as const;

type MaybeAuthError = {
  message?: string;
  code?: number | string;
  status?: number;
};

function describe(error: unknown): string {
  if (!error || typeof error !== "object") return SIWS_COPY.generic;

  const err = error as MaybeAuthError;
  const message = (err.message ?? "").toLowerCase();
  const status = typeof err.status === "number" ? err.status : undefined;
  const code = err.code === undefined ? "" : String(err.code).toLowerCase();

  // The wallet itself declined the request (thrown before Auth is involved).
  if (
    message.includes("rejected") ||
    message.includes("declined") ||
    message.includes("user closed") ||
    message.includes("cancelled") ||
    code.includes("4001")
  ) {
    return SIWS_COPY.rejected;
  }

  // The request never reached (or never came back from) Auth.
  if (
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("fetch failed") ||
    message.includes("econnrefused") ||
    message.includes("timeout")
  ) {
    return SIWS_COPY.unreachable;
  }

  if (message.includes("not enabled") || message.includes("disabled")) {
    return SIWS_COPY.notEnabled;
  }

  if (status === 429 || message.includes("rate limit")) {
    return SIWS_COPY.rateLimited;
  }

  // Auth answered but the signature/URI could not be accepted.
  if (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    message.includes("signature") ||
    message.includes("siws") ||
    message.includes("invalid") ||
    message.includes("not allowed")
  ) {
    return SIWS_COPY.invalid;
  }

  return SIWS_COPY.generic;
}

/** Turns any sign-in failure into calm, actionable copy. Never throws. */
export function siwsErrorCopy(error: unknown): string {
  try {
    return describe(error);
  } catch {
    return SIWS_COPY.generic;
  }
}

type SessionUserLike = {
  user_metadata?: Record<string, unknown> | null;
} | null;

type CustomClaims = {
  address?: unknown;
};

/**
 * The verified wallet address carried by a Supabase Auth session created
 * through `signInWithWeb3`. Returns `null` for sessions that were not created
 * by a Solana wallet signature.
 *
 * This is a *display/consistency* helper: authorization never trusts it —
 * the database re-derives the wallet from `auth.identities` on every profile
 * write.
 */
export function walletFromUser(user: SessionUserLike): string | null {
  const metadata = user?.user_metadata;
  if (!metadata || typeof metadata !== "object") return null;

  const claims = metadata.custom_claims;
  if (!claims || typeof claims !== "object") return null;

  const address = (claims as CustomClaims).address;
  return typeof address === "string" && address.length > 0 ? address : null;
}
