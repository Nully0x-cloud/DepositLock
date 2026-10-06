import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/db/client";
import { createSupabaseServiceClient } from "@/lib/db/service-client";
import type { Database } from "@/types/database";
import { depositAmountToBaseUnits } from "@/lib/solana/amounts";
import { getSolanaConnection } from "@/lib/solana/connection";
import {
  fetchDepositAgreement,
  fetchDepositConfig,
} from "@/lib/solana/deposit";
import {
  DEPOSIT_LOCK_MINT_ADDRESS,
  DEPOSIT_LOCK_MINT_DECIMALS,
} from "@/lib/solana/deployment";
import {
  findDepositAgreementPda,
  getAssociatedTokenAddressSync,
  tenancyIdToBytes,
} from "@/lib/solana/program";
import { pickDepositSignatures } from "@/lib/solana/signatures";
import { isTransactableCluster } from "@/lib/solana/transactions";
import { SOLANA_CLUSTER } from "@/lib/solana/config";

/**
 * Reconciles a tenancy's deposit against the chain.
 *
 * The client sends no signature and no proof — the route derives the
 * agreement PDA from the tenancy id, reads the chain itself, cross-checks
 * the account against the Supabase record (parties, mint, required amount),
 * then calls the service-role-only RPCs. Chain state is authoritative;
 * Supabase only ever gets an index of what the chain already proved.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ReconcileState = "absent" | "agreement_initialized" | "deposit_funded";

type ReconcileBody = {
  tenancy_id: string;
  state: ReconcileState;
  agreement_address?: string;
  vault_address?: string;
  initialization_signature?: string;
  funding_signature?: string | null;
};

function json(body: ReconcileBody, status: number): NextResponse {
  return NextResponse.json(body, { status });
}

function error(status: number, tenancyId: string, message: string): NextResponse {
  return NextResponse.json({ tenancy_id: tenancyId, error: message }, { status });
}

function isPostgrestError(value: unknown): value is { code: string; message: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof (value as { message: unknown }).message === "string" &&
    "code" in value &&
    typeof (value as { code: unknown }).code === "string"
  );
}

type Client = SupabaseClient<Database>;

async function readTenancyForCaller(
  client: Client,
  tenancyId: string,
): Promise<
  | { ok: true; tenancy: TenancyRow }
  | { ok: false; status: number; message: string }
> {
  const { data, error: queryError } = await client
    .from("tenancies")
    .select(
      "id, status, deposit_amount, landlord_profile_id, tenant_profile_id, vault_address",
    )
    .eq("id", tenancyId)
    .maybeSingle();

  if (queryError) {
    return { ok: false, status: 500, message: "Could not read the tenancy." };
  }
  if (!data) {
    // RLS: a non-participant sees nothing — never leak existence.
    return { ok: false, status: 404, message: "Tenancy not found." };
  }
  return { ok: true, tenancy: data };
}

type TenancyRow = {
  id: string;
  status: string;
  deposit_amount: number;
  landlord_profile_id: string;
  tenant_profile_id: string | null;
  vault_address: string | null;
};

async function readPartyWallets(
  client: Client,
  tenancy: TenancyRow,
): Promise<Record<string, string | null>> {
  const partyIds = [tenancy.landlord_profile_id, tenancy.tenant_profile_id].filter(
    (value): value is string => Boolean(value),
  );
  const { data } = await client
    .from("v_shared_profiles")
    .select("id, wallet_address")
    .in("id", partyIds);

  const wallets: Record<string, string | null> = {};
  for (const row of data ?? []) {
    if (row.id) wallets[row.id] = row.wallet_address;
  }
  return wallets;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return error(400, id, "Invalid tenancy id.");
  }

  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return error(401, id, "Sign in to reconcile this deposit.");
  }

  const userScoped = createSupabaseServerClient(token);
  if (!userScoped) {
    return error(503, id, "Supabase is not configured.");
  }

  const { data: authData, error: authError } = await userScoped.auth.getUser(token);
  if (authError || !authData.user) {
    return error(401, id, "Your session has expired.");
  }

  const tenancyResult = await readTenancyForCaller(userScoped, id);
  if (!tenancyResult.ok) {
    return error(tenancyResult.status, id, tenancyResult.message);
  }
  const tenancy = tenancyResult.tenancy;

  if (tenancy.status !== "awaiting_deposit" && tenancy.status !== "protected") {
    return error(409, id, "This tenancy is not awaiting a deposit.");
  }

  const wallets = await readPartyWallets(userScoped, tenancy);
  const landlordWallet = wallets[tenancy.landlord_profile_id] ?? null;
  const tenantWallet = tenancy.tenant_profile_id
    ? (wallets[tenancy.tenant_profile_id] ?? null)
    : null;
  if (!landlordWallet || !tenantWallet) {
    return error(
      409,
      id,
      "Both parties need verified wallets before the deposit can be reconciled.",
    );
  }

  if (!isTransactableCluster(SOLANA_CLUSTER)) {
    return error(409, id, "Deposit reconciliation is only available on Solana Devnet.");
  }

  const connection = getSolanaConnection();
  const tenancyIdBytes = tenancyIdToBytes(id);

  let agreement;
  try {
    agreement = await fetchDepositAgreement(connection, tenancyIdBytes);
  } catch {
    return error(502, id, "The chain is unreachable right now.");
  }

  if (!agreement) {
    return json({ tenancy_id: id, state: "absent" }, 200);
  }

  const [expectedPda] = findDepositAgreementPda(tenancyIdBytes);
  const mismatches: string[] = [];
  if (agreement.address.toBase58() !== expectedPda.toBase58()) {
    mismatches.push("agreement address");
  }
  if (agreement.tenancyId.toLowerCase() !== id.toLowerCase()) {
    mismatches.push("tenancy id");
  }
  if (agreement.landlord.toBase58() !== landlordWallet) {
    mismatches.push("landlord wallet");
  }
  if (agreement.tenant.toBase58() !== tenantWallet) {
    mismatches.push("tenant wallet");
  }
  if (agreement.mint.toBase58() !== DEPOSIT_LOCK_MINT_ADDRESS) {
    mismatches.push("mint");
  }
  if (
    agreement.vault.toBase58() !==
    getAssociatedTokenAddressSync(agreement.mint, agreement.address).toBase58()
  ) {
    mismatches.push("vault address");
  }

  let expectedAmount: bigint;
  try {
    expectedAmount = depositAmountToBaseUnits(
      tenancy.deposit_amount,
      DEPOSIT_LOCK_MINT_DECIMALS,
    );
  } catch {
    return error(500, id, "The tenancy deposit amount is invalid.");
  }
  if (agreement.requiredAmount !== expectedAmount) {
    mismatches.push("required amount");
  }
  if (agreement.status === "closed") {
    return error(409, id, "This deposit agreement has been closed.");
  }
  if (mismatches.length > 0) {
    return error(
      409,
      id,
      `On-chain deposit does not match this tenancy (${mismatches.join(", ")}).`,
    );
  }

  let config;
  try {
    config = await fetchDepositConfig(connection);
  } catch {
    return error(502, id, "The chain is unreachable right now.");
  }
  if (!config) {
    return error(409, id, "The deployment has not been initialized yet.");
  }
  if (config.allowedMint.toBase58() !== agreement.mint.toBase58()) {
    return error(409, id, "The deployment mint does not accept this agreement.");
  }
  if (config.allowedDecimals !== DEPOSIT_LOCK_MINT_DECIMALS) {
    return error(409, id, "The deployment mint decimals have changed.");
  }

  let signatureEntries;
  try {
    signatureEntries = await connection.getSignaturesForAddress(agreement.address, {
      limit: 256,
    });
  } catch {
    return error(502, id, "The chain is unreachable right now.");
  }

  let signatures;
  try {
    signatures = pickDepositSignatures(
      signatureEntries.map((entry) => ({
        signature: entry.signature,
        err: entry.err,
      })),
      agreement.status,
    );
  } catch {
    return error(502, id, "Could not read the deposit transactions.");
  }

  const service = createSupabaseServiceClient();
  if (!service) {
    return error(503, id, "Reconciliation is not configured on this server.");
  }

  try {
    const recordResult = await service.rpc("record_deposit_agreement", {
      p_tenancy_id: id,
      p_agreement_address: agreement.address.toBase58(),
      p_vault_address: agreement.vault.toBase58(),
      p_mint_address: agreement.mint.toBase58(),
      p_required_amount: agreement.requiredAmount.toString() as unknown as number,
      p_decimals: DEPOSIT_LOCK_MINT_DECIMALS,
      p_initialization_signature: signatures.initialization,
    });
    if (recordResult.error) throw recordResult.error;

    if (agreement.status === "funded") {
      if (!signatures.funding || agreement.fundedAt <= 0) {
        return error(502, id, "The funding transaction could not be verified.");
      }
      const protectResult = await service.rpc("mark_deposit_protected", {
        p_tenancy_id: id,
        p_agreement_address: agreement.address.toBase58(),
        p_vault_address: agreement.vault.toBase58(),
        p_mint_address: agreement.mint.toBase58(),
        p_required_amount: agreement.requiredAmount.toString() as unknown as number,
        p_deposited_amount: agreement.depositedAmount.toString() as unknown as number,
        p_decimals: DEPOSIT_LOCK_MINT_DECIMALS,
        p_funding_signature: signatures.funding,
        p_onchain_funded_at: new Date(agreement.fundedAt * 1000).toISOString(),
      });
      if (protectResult.error) throw protectResult.error;
    }
  } catch (rpcError) {
    if (isPostgrestError(rpcError)) {
      if (
        rpcError.code === "P0001" ||
        rpcError.message.includes("does not match the recorded agreement")
      ) {
        return error(409, id, rpcError.message);
      }
      console.error("reconcile rpc failed:", rpcError.message);
      return error(500, id, rpcError.message);
    }
    console.error("reconcile failed:", rpcError);
    return error(500, id, "Could not record the on-chain deposit.");
  }

  const state: ReconcileState =
    agreement.status === "funded" ? "deposit_funded" : "agreement_initialized";

  return json(
    {
      tenancy_id: id,
      state,
      agreement_address: agreement.address.toBase58(),
      vault_address: agreement.vault.toBase58(),
      initialization_signature: signatures.initialization,
      funding_signature: signatures.funding,
    },
    200,
  );
}
