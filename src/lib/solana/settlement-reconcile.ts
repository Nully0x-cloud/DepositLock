import { getSupabaseBrowserClient } from "@/lib/db/client";

export type SettlementReconcileIntent =
  | "proposal"
  | "withdrawal"
  | "challenge"
  | "refresh";

export type SettlementReconcileInput = {
  intent: SettlementReconcileIntent;
  settlementType?: "full_return" | "partial_deduction";
  reasonCategory?: string;
  description?: string;
  evidenceIds?: string[];
  challengeReason?: string;
  challengeEvidenceIds?: string[];
};

export type SettlementReconcileResult =
  | { ok: true; state: string; body: Record<string, unknown> }
  | { ok: false; status: number; message: string };

async function postAuthenticated(
  path: string,
  body?: object,
): Promise<SettlementReconcileResult> {
  const client = getSupabaseBrowserClient();
  if (!client) return { ok: false, status: 0, message: "Supabase is not configured." };
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, status: 401, message: "Sign in to continue." };

  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    return { ok: false, status: 0, message: "The server is unreachable right now." };
  }
  let result: Record<string, unknown> = {};
  try {
    result = (await response.json()) as Record<string, unknown>;
  } catch {
    result = {};
  }
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: typeof result.error === "string" ? result.error : "Could not reconcile settlement state.",
    };
  }
  return {
    ok: true,
    state: typeof result.state === "string" ? result.state : "updated",
    body: result,
  };
}

export function startMoveOutReview(tenancyId: string): Promise<SettlementReconcileResult> {
  return postAuthenticated(
    `/api/tenancies/${encodeURIComponent(tenancyId)}/start-move-out-review`,
  );
}

export function reconcileSettlement(
  tenancyId: string,
  input: SettlementReconcileInput,
): Promise<SettlementReconcileResult> {
  return postAuthenticated(
    `/api/tenancies/${encodeURIComponent(tenancyId)}/reconcile-settlement`,
    input,
  );
}
