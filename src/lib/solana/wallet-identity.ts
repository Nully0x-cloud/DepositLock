const DEFAULT_EDGE = 4;

/**
 * Formats a base58 public key for display: `7VxQ...4Kp2`.
 * Long addresses are never shown in full inside the interface.
 */
export function shortenAddress(
  address: string,
  leading: number = DEFAULT_EDGE,
  trailing: number = DEFAULT_EDGE,
): string {
  const value = address.trim();
  if (value.length <= leading + trailing + 1) return value;
  return `${value.slice(0, leading)}...${value.slice(-trailing)}`;
}

type WalletErrorLike = {
  name?: string;
  message?: string;
  code?: number;
};

function toErrorLike(error: unknown): WalletErrorLike {
  if (error && typeof error === "object") {
    return error as WalletErrorLike;
  }
  if (typeof error === "string") return { message: error };
  return {};
}

/**
 * Turns wallet-adapter errors into calm, consumer-facing copy.
 * Raw adapter errors are never surfaced to the interface.
 */
export function describeWalletError(error: unknown): string {
  const { name, message, code } = toErrorLike(error);
  const haystack = `${name ?? ""} ${message ?? ""}`.toLowerCase();

  if (code === 4001) return "Connection cancelled";

  if (
    haystack.includes("notready") ||
    haystack.includes("not ready") ||
    haystack.includes("not installed") ||
    haystack.includes("not detected")
  ) {
    return "That wallet is not available in this browser yet.";
  }

  if (
    haystack.includes("rejected") ||
    haystack.includes("declined") ||
    haystack.includes("cancelled") ||
    haystack.includes("canceled") ||
    haystack.includes("user closed") ||
    haystack.includes("denied")
  ) {
    return "Connection cancelled";
  }

  if (haystack.includes("not found") || haystack.includes("no wallet")) {
    return "We could not find that wallet in this browser.";
  }

  if (haystack.includes("timeout") || haystack.includes("timed out")) {
    return "The wallet took too long to respond. Please try again.";
  }

  return "We could not connect to that wallet. Please try again.";
}

/** True when the error should be treated as a benign cancellation. */
export function isCancellationMessage(message: string): boolean {
  return message === "Connection cancelled";
}
