import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Settlement } from "@/types/database";
import type { RepositoryResult } from "./errors";
import { fromResult } from "./from-result";
import type { SettlementRecord } from "./models";

type Client = SupabaseClient<Database>;

export function toSettlementRecord(row: Settlement): SettlementRecord {
  return {
    id: row.id,
    tenancyId: row.tenancy_id,
    originalDepositAmount: row.original_deposit_amount,
    tenantAmount: row.tenant_amount,
    landlordAmount: row.landlord_amount,
    settlementType: row.settlement_type as SettlementRecord["settlementType"],
    tenantApproved: row.tenant_approved,
    landlordApproved: row.landlord_approved,
    blockchainTransaction: row.blockchain_transaction,
    settledAt: row.settled_at,
    createdAt: row.created_at,
  };
}

/**
 * Read-only by design: RLS grants participants SELECT and no INSERT/UPDATE/
 * DELETE, so settlement rows can only come from the service layer / on-chain
 * reconciliation that a later phase introduces. There is deliberately no
 * `createSettlement` here.
 */
export async function getSettlementByTenancy(
  client: Client,
  tenancyId: string,
): Promise<RepositoryResult<SettlementRecord | null>> {
  const result = await fromResult<Settlement | null>(
    client.from("settlements").select("*").eq("tenancy_id", tenancyId).maybeSingle(),
    { allowNull: true },
  );
  if (!result.ok) return result;
  return { ok: true, data: result.data ? toSettlementRecord(result.data) : null };
}
