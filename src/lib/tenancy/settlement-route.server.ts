import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/db/client";
import { createSupabaseServiceClient } from "@/lib/db/service-client";
import type { Database } from "@/types/database";

export type SettlementTenancyRow = {
  id: string;
  status: string;
  deposit_amount: number;
  landlord_profile_id: string;
  tenant_profile_id: string;
  vault_address: string | null;
  blockchain_reference: string | null;
};

export type SettlementRequestContext = {
  caller: SupabaseClient<Database>;
  service: SupabaseClient<Database>;
  userId: string;
  tenancy: SettlementTenancyRow;
  landlordWallet: string;
  tenantWallet: string;
};

export type SettlementAuthorizationResult =
  | { ok: true; context: SettlementRequestContext }
  | { ok: false; status: number; message: string };

/** Authenticates and RLS-loads the tenancy before any privileged settlement RPC. */
export async function authorizeSettlementRequest(
  request: Request,
  tenancyId: string,
): Promise<SettlementAuthorizationResult> {
  const token = (request.headers.get("authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!token) return { ok: false, status: 401, message: "Sign in to manage this settlement." };

  const caller = createSupabaseServerClient(token);
  if (!caller) return { ok: false, status: 503, message: "Supabase is not configured." };
  const { data: authData, error: authError } = await caller.auth.getUser(token);
  if (authError || !authData.user) {
    return { ok: false, status: 401, message: "Your session has expired." };
  }

  const { data: tenancy, error: tenancyError } = await caller
    .from("tenancies")
    .select("id,status,deposit_amount,landlord_profile_id,tenant_profile_id,vault_address,blockchain_reference")
    .eq("id", tenancyId)
    .maybeSingle();
  if (tenancyError) return { ok: false, status: 500, message: "Could not read the tenancy." };
  if (!tenancy) return { ok: false, status: 404, message: "Tenancy not found." };
  if (!tenancy.tenant_profile_id) {
    return { ok: false, status: 409, message: "The tenant has not accepted this tenancy yet." };
  }

  const { data: profiles, error: profilesError } = await caller
    .from("v_shared_profiles")
    .select("id,wallet_address")
    .in("id", [tenancy.landlord_profile_id, tenancy.tenant_profile_id]);
  if (profilesError) return { ok: false, status: 500, message: "Could not read tenancy wallets." };
  const wallets = new Map(
    (profiles ?? []).filter((row) => row.id).map((row) => [row.id as string, row.wallet_address]),
  );
  const landlordWallet = wallets.get(tenancy.landlord_profile_id);
  const tenantWallet = wallets.get(tenancy.tenant_profile_id);
  if (!landlordWallet || !tenantWallet) {
    return { ok: false, status: 409, message: "Both parties need verified wallets." };
  }

  const service = createSupabaseServiceClient();
  if (!service) {
    return { ok: false, status: 503, message: "Settlement reconciliation is not configured." };
  }

  return {
    ok: true,
    context: {
      caller,
      service,
      userId: authData.user.id,
      tenancy: { ...tenancy, tenant_profile_id: tenancy.tenant_profile_id! },
      landlordWallet,
      tenantWallet,
    },
  };
}
