import { NextResponse } from "next/server";
import { authorizeSettlementRequest } from "@/lib/tenancy/settlement-route.server";
import { depositAmountToBaseUnits } from "@/lib/solana/amounts";
import { SOLANA_CLUSTER } from "@/lib/solana/config";
import { getSolanaConnection } from "@/lib/solana/connection";
import { fetchDepositAgreement, fetchDepositConfig, fetchTokenBalance } from "@/lib/solana/deposit";
import {
  DEPOSIT_LOCK_MINT_ADDRESS,
  DEPOSIT_LOCK_MINT_DECIMALS,
} from "@/lib/solana/deployment";
import { isTransactableCluster } from "@/lib/solana/transactions";
import { getAssociatedTokenAddressSync, tenancyIdToBytes } from "@/lib/solana/program";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "Invalid tenancy id." }, { status: 400 });
  }

  const authorization = await authorizeSettlementRequest(request, id);
  if (!authorization.ok) {
    return NextResponse.json({ error: authorization.message }, { status: authorization.status });
  }
  const { context } = authorization;
  if (context.userId !== context.tenancy.landlord_profile_id) {
    return NextResponse.json({ error: "Only the landlord can start move-out review." }, { status: 403 });
  }
  if (context.tenancy.status !== "protected" && context.tenancy.status !== "move_out_review") {
    return NextResponse.json({ error: "Move-out review requires a protected tenancy." }, { status: 409 });
  }
  if (!isTransactableCluster(SOLANA_CLUSTER) || !DEPOSIT_LOCK_MINT_ADDRESS) {
    return NextResponse.json({ error: "Settlement is available only for the configured Devnet deployment." }, { status: 409 });
  }

  let agreement;
  let config;
  let vaultBalance;
  try {
    const connection = getSolanaConnection();
    const tenancyBytes = tenancyIdToBytes(id);
    [agreement, config] = await Promise.all([
      fetchDepositAgreement(connection, tenancyBytes),
      fetchDepositConfig(connection),
    ]);
    if (agreement) vaultBalance = await fetchTokenBalance(connection, agreement.address, agreement.mint);
  } catch {
    return NextResponse.json({ error: "The chain is unreachable right now." }, { status: 502 });
  }

  if (!agreement || agreement.status !== "funded") {
    return NextResponse.json({ error: "The on-chain agreement is not funded." }, { status: 409 });
  }
  let requiredAmount: bigint;
  try {
    requiredAmount = depositAmountToBaseUnits(
      context.tenancy.deposit_amount,
      DEPOSIT_LOCK_MINT_DECIMALS,
    );
  } catch {
    return NextResponse.json({ error: "The tenancy deposit amount is invalid." }, { status: 409 });
  }
  if (
    agreement.tenancyId.toLowerCase() !== id.toLowerCase() ||
    agreement.landlord.toBase58() !== context.landlordWallet ||
    agreement.tenant.toBase58() !== context.tenantWallet ||
    agreement.mint.toBase58() !== DEPOSIT_LOCK_MINT_ADDRESS ||
    agreement.requiredAmount !== requiredAmount ||
    agreement.depositedAmount !== requiredAmount ||
    agreement.vault.toBase58() !== getAssociatedTokenAddressSync(agreement.mint, agreement.address).toBase58() ||
    !vaultBalance ||
    vaultBalance.amount !== requiredAmount ||
    !config ||
    config.allowedMint.toBase58() !== DEPOSIT_LOCK_MINT_ADDRESS ||
    config.allowedDecimals !== DEPOSIT_LOCK_MINT_DECIMALS
  ) {
    return NextResponse.json({ error: "On-chain deposit does not match this tenancy." }, { status: 409 });
  }

  const { error: rpcError } = await context.service.rpc("start_move_out_review", {
    p_tenancy_id: id,
    p_landlord_profile_id: context.userId,
  });
  if (rpcError) {
    const status = rpcError.code === "P0001" || rpcError.code === "23514" ? 409 : 500;
    return NextResponse.json({ error: rpcError.message }, { status });
  }
  return NextResponse.json({ tenancy_id: id, status: "move_out_review" });
}
