import { getSupabaseBrowserClient } from "@/lib/db/client";

export type ReconcileState = "absent" | "agreement_initialized" | "deposit_funded";

export type ReconcileResult =
  | { ok: true; state: ReconcileState }
  | { ok: false; status: number; message: string };

/**
 * Asks the reconcile route to verify the chain and update Supabase.
 *
 * The client sends no signature and no proof — the server re-derives the
 * agreement from the tenancy id, reads the chain itself, and only then
 * records what it saw. Auth rides on the caller's Supabase session so the
 * route can apply RLS (participants only) before touching anything.
 */
export async function requestDepositReconciliation(
  tenancyId: string,
): Promise<ReconcileResult> {
  const client = getSupabaseBrowserClient();
  if (!client) {
    return { ok: false, status: 0, message: "Supabase is not configured." };
  }

  const { data: sessionData } = await client.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    return { ok: false, status: 401, message: "Sign in to reconcile this deposit." };
  }

  let response: Response;
  try {
    response = await fetch(
      `/api/tenancies/${encodeURIComponent(tenancyId)}/reconcile-deposit`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      },
    );
  } catch {
    return { ok: false, status: 0, message: "The server is unreachable right now." };
  }

  let body: { state?: ReconcileState; error?: string } | null = null;
  try {
    body = (await response.json()) as { state?: ReconcileState; error?: string } | null;
  } catch {
    body = null;
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: body?.error ?? "Could not reconcile the deposit.",
    };
  }

  const state = body?.state;
  if (state !== "absent" && state !== "agreement_initialized" && state !== "deposit_funded") {
    return { ok: false, status: 500, message: "The server returned an unexpected state." };
  }
  return { ok: true, state };
}
