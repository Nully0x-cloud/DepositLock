import "server-only";

import { createSupabaseServerClient } from "@/lib/db/client";
import { createSupabaseServiceClient } from "@/lib/db/service-client";

export type EvidenceRequestContext = {
  caller: NonNullable<ReturnType<typeof createSupabaseServerClient>>;
  service: NonNullable<ReturnType<typeof createSupabaseServiceClient>>;
  userId: string;
  role: "landlord" | "tenant";
  status: string;
};

export type EvidenceAuthorizationResult =
  | { ok: true; context: EvidenceRequestContext }
  | { ok: false; status: number; message: string };

/** Authenticates the session and lets RLS prove participant access first. */
export async function authorizeEvidenceRequest(
  request: Request,
  tenancyId: string,
): Promise<EvidenceAuthorizationResult> {
  const token = (request.headers.get("authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!token) return { ok: false, status: 401, message: "Sign in to access tenancy evidence." };

  const caller = createSupabaseServerClient(token);
  if (!caller) return { ok: false, status: 503, message: "Evidence storage is not configured." };
  const { data: auth, error: authError } = await caller.auth.getUser(token);
  if (authError || !auth.user) return { ok: false, status: 401, message: "Your session has expired. Sign in again." };

  const { data: tenancy, error } = await caller
    .from("tenancies")
    .select("id,status,landlord_profile_id,tenant_profile_id")
    .eq("id", tenancyId)
    .maybeSingle();
  if (error) return { ok: false, status: 500, message: "Could not verify access to this tenancy." };
  if (!tenancy || !tenancy.tenant_profile_id) {
    return { ok: false, status: 404, message: "This tenancy is not available to your account." };
  }

  const role = auth.user.id === tenancy.landlord_profile_id
    ? "landlord"
    : auth.user.id === tenancy.tenant_profile_id
      ? "tenant"
      : null;
  if (!role) return { ok: false, status: 404, message: "This tenancy is not available to your account." };

  const service = createSupabaseServiceClient();
  if (!service) return { ok: false, status: 503, message: "Evidence storage is not configured." };

  return {
    ok: true,
    context: { caller, service, userId: auth.user.id, role, status: tenancy.status },
  };
}
