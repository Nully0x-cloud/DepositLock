#!/usr/bin/env node

/** Phase 6 real-wallet flows: full return, deduction, then dispute freeze. */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash, createPrivateKey, randomUUID, sign as ed25519Sign } from "node:crypto";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL || "http://127.0.0.1:54321";
const ANON_KEY = process.env.E2E_SUPABASE_ANON_KEY;
const APP_URL = process.env.E2E_APP_URL || "http://localhost:3000";
const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(SUPABASE_URL)) {
  throw new Error("E2E_SUPABASE_URL must point to local Supabase only.");
}
if (!ANON_KEY) throw new Error("Set E2E_SUPABASE_ANON_KEY to the local Supabase anon key.");

const PROGRAM_ID = new PublicKey("FX2jWasLMqeG3X4ntc8jogMgxRdbMMSxKcfTWJxexQbY");
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const INITIALIZE_DEPOSIT = Uint8Array.from([171, 65, 93, 225, 61, 109, 31, 227]);
const FUND_DEPOSIT = Uint8Array.from([149, 24, 209, 94, 206, 202, 144, 233]);
const INITIALIZE_SETTLEMENT = Uint8Array.from([119, 249, 114, 45, 48, 126, 253, 238]);
const PROPOSE_SETTLEMENT = Uint8Array.from([228, 149, 56, 61, 137, 43, 106, 25]);
const APPROVE_SETTLEMENT = Uint8Array.from([186, 5, 15, 163, 23, 10, 142, 12]);
const CHALLENGE_SETTLEMENT = Uint8Array.from([124, 204, 242, 137, 177, 7, 153, 173]);
const DEPLOYMENT = readFileSync("src/lib/solana/deployment.ts", "utf8");
const MINT_ADDRESS = process.env.DEPOSIT_LOCK_MINT_ADDRESS ||
  /DEPOSIT_LOCK_MINT_ADDRESS\s*=\s*"([1-9A-HJ-NP-Za-km-z]+)"/.exec(DEPLOYMENT)?.[1];
if (!MINT_ADDRESS) throw new Error("Settlement E2E requires the configured test mint.");
const MINT = new PublicKey(MINT_ADDRESS);
const HOST = new URL(APP_URL).host;
const URI = `${APP_URL.replace(/\/$/, "")}/`;
const DEPOSIT = "25.50";
const DEPOSIT_UNITS = BigInt("25500000");
const DEDUCTION_UNITS = BigInt("5000000");

function loadKeypair(path) {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));
}

function loadOrCreateKeypair(path) {
  try {
    return loadKeypair(path);
  } catch {
    const pair = Keypair.generate();
    writeFileSync(path, `${JSON.stringify(Array.from(pair.secretKey))}\n`, { mode: 0o600 });
    return pair;
  }
}

function keypairFromSeed(seed) {
  const prefix = Buffer.from("302e020100300506032b657004220420", "hex");
  return createPrivateKey({ key: Buffer.concat([prefix, seed]), format: "der", type: "pkcs8" });
}

function base64Url(bytes) {
  return Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildSiwsMessage(address) {
  return [
    `${HOST} wants you to sign in with your Solana account:`,
    address,
    "",
    "Sign in to DepositLock. No funds will move.",
    "",
    "Version: 1",
    `URI: ${URI}`,
    `Issued At: ${new Date().toISOString()}`,
  ].join("\n");
}

async function signIn(keypair) {
  const address = keypair.publicKey.toBase58();
  const message = buildSiwsMessage(address);
  const signature = base64Url(ed25519Sign(
    null,
    Buffer.from(message, "utf8"),
    keypairFromSeed(keypair.secretKey.subarray(0, 32)),
  ));
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=web3`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ chain: "solana", message, signature }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    throw new Error(`Local SIWS failed (${response.status}): ${JSON.stringify(body)}`);
  }
  return { token: body.access_token, user: body.user };
}

async function rest(path, { token, method = "GET", body, headers = {} } = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  if (!response.ok) {
    throw new Error(`Supabase ${method} ${path} failed (${response.status}): ${JSON.stringify(parsed)}`);
  }
  return parsed;
}

async function ensureProfile(session, name, email, wallet) {
  const rows = await rest(`profiles?id=eq.${session.user.id}&select=id,wallet_address`, { token: session.token });
  if (rows.length === 0) {
    await rest("profiles", {
      token: session.token,
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: { id: session.user.id, full_name: name, email },
    });
  }
  const own = await rest(`profiles?id=eq.${session.user.id}&select=wallet_address`, { token: session.token });
  if (own[0]?.wallet_address !== wallet) throw new Error(`Verified wallet mismatch for ${name}.`);
}

function u64(value) {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(value);
  return bytes;
}

function uuidBytes(value) {
  return Buffer.from(value.replace(/-/g, ""), "hex");
}

function ata(owner, mint = MINT) {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

function pda(seed, ...additional) {
  return PublicKey.findProgramAddressSync([Buffer.from(seed), ...additional], PROGRAM_ID)[0];
}

function termsHash(tenancyId, type, landlordAmount, reasonCategory = "", description = "", evidenceIds = []) {
  const canonical = JSON.stringify([
    tenancyId.toLowerCase(),
    type,
    landlordAmount.toString(),
    reasonCategory.trim(),
    description.trim(),
    [...evidenceIds].map((id) => id.toLowerCase()).sort(),
  ]);
  return createHash("sha256").update(canonical).digest();
}

async function ensureSol(connection, payer, receiver, lamports) {
  const balance = await connection.getBalance(receiver.publicKey, "confirmed");
  if (balance >= lamports) return;
  await sendAndConfirmTransaction(
    connection,
    new Transaction().add(SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: receiver.publicKey,
      lamports: lamports - balance,
    })),
    [payer],
    { commitment: "confirmed" },
  );
}

async function mintTestTokens(connection, authority, tenant) {
  const tokenAccount = ata(tenant.publicKey);
  const instructions = [];
  if (!(await connection.getAccountInfo(tokenAccount, "confirmed"))) {
    instructions.push(new TransactionInstruction({
      programId: ASSOCIATED_TOKEN_PROGRAM_ID,
      keys: [
        { pubkey: authority.publicKey, isSigner: true, isWritable: true },
        { pubkey: tokenAccount, isSigner: false, isWritable: true },
        { pubkey: tenant.publicKey, isSigner: false, isWritable: false },
        { pubkey: MINT, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: Buffer.alloc(0),
    }));
  }
  const data = Buffer.alloc(9);
  data.writeUInt8(7, 0);
  data.writeBigUInt64LE(BigInt("1000000000"), 1);
  instructions.push(new TransactionInstruction({
    programId: TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: MINT, isSigner: false, isWritable: true },
      { pubkey: tokenAccount, isSigner: false, isWritable: true },
      { pubkey: authority.publicKey, isSigner: true, isWritable: false },
    ],
    data,
  }));
  await sendAndConfirmTransaction(connection, new Transaction().add(...instructions), [authority], {
    commitment: "confirmed",
  });
}

async function callRoute(appUrl, path, token, body) {
  const response = await fetch(`${appUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Route ${path} failed (${response.status}): ${JSON.stringify(result)}`);
  return result;
}

async function ensureTenancy(connection, deployer, landlord, tenant, sessions, label) {
  const create = await rest("rpc/create_tenancy_with_invitation", {
    token: sessions.landlord.token,
    method: "POST",
    body: {
      p_start_date: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
      p_monthly_rent: 1500,
      p_deposit: Number(DEPOSIT),
      p_tenant_wallet: tenant.publicKey.toBase58(),
      p_property: {
        address_line_1: `Phase6 ${label} ${randomUUID().slice(0, 8)}`,
        city: "Dublin",
        county: "Dublin",
        postal_code: "D02 E2E1",
        country: "IE",
        property_type: "apartment",
        bedrooms: 1,
      },
      p_currency: "EUR",
    },
  });
  await rest("rpc/accept_tenancy_invitation", {
    token: sessions.tenant.token,
    method: "POST",
    body: { p_token: create.invitation_token },
  });
  await mintTestTokens(connection, deployer, tenant);
  const idBytes = uuidBytes(create.tenancy_id);
  const agreement = pda("deposit", idBytes);
  const [config] = PublicKey.findProgramAddressSync([Buffer.from("depositlock_config")], PROGRAM_ID);
  const vault = ata(agreement);
  const init = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: landlord.publicKey, isSigner: true, isWritable: true },
      { pubkey: tenant.publicKey, isSigner: false, isWritable: false },
      { pubkey: config, isSigner: false, isWritable: false },
      { pubkey: MINT, isSigner: false, isWritable: false },
      { pubkey: agreement, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([Buffer.from(INITIALIZE_DEPOSIT), idBytes, u64(DEPOSIT_UNITS)]),
  });
  const initSignature = await sendAndConfirmTransaction(connection, new Transaction().add(init), [landlord], {
    commitment: "confirmed",
  });
  await callRoute(APP_URL, `/api/tenancies/${create.tenancy_id}/reconcile-deposit`, sessions.landlord.token);

  const source = ata(tenant.publicKey);
  const fund = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: tenant.publicKey, isSigner: true, isWritable: true },
      { pubkey: agreement, isSigner: false, isWritable: true },
      { pubkey: MINT, isSigner: false, isWritable: false },
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([Buffer.from(FUND_DEPOSIT), u64(DEPOSIT_UNITS)]),
  });
  const fundSignature = await sendAndConfirmTransaction(connection, new Transaction().add(fund), [tenant], {
    commitment: "confirmed",
  });
  await callRoute(APP_URL, `/api/tenancies/${create.tenancy_id}/reconcile-deposit`, sessions.tenant.token);
  await callRoute(APP_URL, `/api/tenancies/${create.tenancy_id}/start-move-out-review`, sessions.landlord.token);
  return {
    tenancyId: create.tenancy_id,
    idBytes,
    agreement,
    vault,
    source,
    initSignature,
    fundSignature,
  };
}

function settlementPda(agreement) {
  return pda("settlement", agreement.toBuffer());
}

async function propose(connection, landlord, tenant, chain, type, landlordAmount, metadata = {}) {
  const proposal = settlementPda(chain.agreement);
  const terms = termsHash(
    chain.tenancyId,
    type,
    landlordAmount,
    metadata.reasonCategory ?? "",
    metadata.description ?? "",
    metadata.evidenceIds ?? [],
  );
  const instructions = [];
  if (!(await connection.getAccountInfo(proposal, "confirmed"))) {
    instructions.push(new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: landlord.publicKey, isSigner: true, isWritable: true },
        { pubkey: chain.agreement, isSigner: false, isWritable: false },
        { pubkey: proposal, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.from(INITIALIZE_SETTLEMENT),
    }));
  }
  const proposeData = Buffer.concat([
    Buffer.from(PROPOSE_SETTLEMENT),
    u64(landlordAmount),
    u64(BigInt(1)),
    terms,
  ]);
  instructions.push(new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: landlord.publicKey, isSigner: true, isWritable: false },
      { pubkey: chain.agreement, isSigner: false, isWritable: true },
      { pubkey: proposal, isSigner: false, isWritable: true },
      { pubkey: MINT, isSigner: false, isWritable: false },
      { pubkey: chain.vault, isSigner: false, isWritable: false },
    ],
    data: proposeData,
  }));
  const signature = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(...instructions),
    [landlord],
    { commitment: "confirmed" },
  );
  await callRoute(APP_URL, `/api/tenancies/${chain.tenancyId}/reconcile-settlement`, landlord.sessionToken, {
    intent: "proposal",
    settlementType: type,
    ...(type === "partial_deduction" ? metadata : {}),
  });
  return { proposal, terms, signature };
}

async function approve(connection, landlord, tenant, chain, proposal, expectedTermsHash) {
  const tenantToken = ata(tenant.publicKey);
  const landlordToken = ata(landlord.publicKey);
  const instruction = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: tenant.publicKey, isSigner: true, isWritable: true },
      { pubkey: landlord.publicKey, isSigner: false, isWritable: false },
      { pubkey: chain.agreement, isSigner: false, isWritable: true },
      { pubkey: proposal, isSigner: false, isWritable: true },
      { pubkey: MINT, isSigner: false, isWritable: false },
      { pubkey: chain.vault, isSigner: false, isWritable: true },
      { pubkey: tenantToken, isSigner: false, isWritable: true },
      { pubkey: landlordToken, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([Buffer.from(APPROVE_SETTLEMENT), u64(BigInt(1)), expectedTermsHash]),
  });
  const signature = await sendAndConfirmTransaction(connection, new Transaction().add(instruction), [tenant], {
    commitment: "confirmed",
  });
  await callRoute(APP_URL, `/api/tenancies/${chain.tenancyId}/reconcile-settlement`, tenant.sessionToken, {
    intent: "refresh",
  });
  return { signature, tenantToken, landlordToken };
}

async function challenge(connection, tenant, chain, proposal, expectedTermsHash, reason) {
  const instruction = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: tenant.publicKey, isSigner: true, isWritable: false },
      { pubkey: chain.agreement, isSigner: false, isWritable: true },
      { pubkey: proposal, isSigner: false, isWritable: true },
    ],
    data: Buffer.concat([Buffer.from(CHALLENGE_SETTLEMENT), u64(BigInt(1)), expectedTermsHash]),
  });
  const signature = await sendAndConfirmTransaction(connection, new Transaction().add(instruction), [tenant], {
    commitment: "confirmed",
  });
  await callRoute(APP_URL, `/api/tenancies/${chain.tenancyId}/reconcile-settlement`, tenant.sessionToken, {
    intent: "challenge",
    challengeReason: reason,
  });
  return signature;
}

async function readTokenAmount(connection, account) {
  const info = await connection.getAccountInfo(account, "confirmed");
  if (!info) return BigInt(0);
  return info.data.readBigUInt64LE(64);
}

async function assertProtectedAndSettled(
  token,
  tenancyId,
  expectedStatus,
  settlementType,
  expectedTenantMoney,
  expectedLandlordMoney,
) {
  const [tenancies, settlements, proposals, deductions, disputes] = await Promise.all([
    rest(`tenancies?id=eq.${tenancyId}&select=status`, { token }),
    rest(`settlements?tenancy_id=eq.${tenancyId}&select=settlement_type,tenant_amount,landlord_amount,settled_at`, { token }),
    rest(`settlement_proposals?tenancy_id=eq.${tenancyId}&select=status,settlement_type,tenant_amount,landlord_amount`, { token }),
    rest(`deductions?tenancy_id=eq.${tenancyId}&select=status,amount`, { token }),
    rest(`disputes?tenancy_id=eq.${tenancyId}&select=status,reason`, { token }),
  ]);
  if (tenancies[0]?.status !== expectedStatus) throw new Error(`Expected tenancy ${expectedStatus}; got ${JSON.stringify(tenancies)}`);
  if (settlementType === "disputed") {
    if (settlements.length !== 0 || proposals[0]?.status !== "challenged" || deductions[0]?.status !== "challenged" || disputes[0]?.status !== "open") {
      throw new Error(`Dispute reconciliation mismatch: ${JSON.stringify({ settlements, proposals, deductions, disputes })}`);
    }
  } else if (
    settlements[0]?.settlement_type !== settlementType ||
    proposals[0]?.status !== "executed" ||
    settlements[0]?.settled_at == null ||
    Number(settlements[0]?.tenant_amount) !== expectedTenantMoney ||
    Number(settlements[0]?.landlord_amount) !== expectedLandlordMoney
  ) {
    throw new Error(`Settlement reconciliation mismatch: ${JSON.stringify({ settlements, proposals })}`);
  }
}

async function runSettledScenario(connection, deployer, landlord, tenant, sessions, kind, label) {
  const chain = await ensureTenancy(connection, deployer, landlord, tenant, sessions, label);
  const full = kind === "full_return";
  const landlordAmount = full ? BigInt(0) : DEDUCTION_UNITS;
  const metadata = full ? {} : {
    reasonCategory: "cleaning",
    description: `Phase 6 ${label} deduction E2E`,
    evidenceIds: [],
  };
  const proposalResult = await propose(
    connection,
    landlord,
    tenant,
    chain,
    kind,
    landlordAmount,
    metadata,
  );
  const tenantBalanceBefore = await readTokenAmount(connection, ata(tenant.publicKey));
  const landlordBalanceBefore = await readTokenAmount(connection, ata(landlord.publicKey));
  const result = await approve(connection, landlord, tenant, chain, proposalResult.proposal, proposalResult.terms);
  const tenantBalanceAfter = await readTokenAmount(connection, result.tenantToken);
  const landlordBalanceAfter = await readTokenAmount(connection, result.landlordToken);
  const expectedLandlord = landlordAmount;
  const expectedTenant = DEPOSIT_UNITS - landlordAmount;
  if (tenantBalanceAfter - tenantBalanceBefore !== expectedTenant) throw new Error(`${label}: tenant payout differs from approved amount`);
  if (landlordBalanceAfter - landlordBalanceBefore !== expectedLandlord) throw new Error(`${label}: landlord payout differs from approved amount`);
  const agreementInfo = await connection.getAccountInfo(chain.agreement, "confirmed");
  const proposalInfo = await connection.getAccountInfo(proposalResult.proposal, "confirmed");
  if (!agreementInfo || agreementInfo.data[10] !== 2) throw new Error(`${label}: agreement did not close`);
  if (!proposalInfo || proposalInfo.data[155] !== 4) throw new Error(`${label}: proposal did not record execution`);
  if (proposalInfo.data.readBigUInt64LE(228) !== expectedTenant || proposalInfo.data.readBigUInt64LE(236) !== expectedLandlord) {
    throw new Error(`${label}: on-chain final payout record differs from transferred amounts`);
  }
  if (await readTokenAmount(connection, chain.vault) !== BigInt(0)) throw new Error(`${label}: vault is not empty`);
  await assertProtectedAndSettled(
    sessions.tenant.token,
    chain.tenancyId,
    "closed",
    kind,
    Number(expectedTenant) / 1_000_000,
    Number(expectedLandlord) / 1_000_000,
  );
  console.log(`PASS ${label}: landlord=${expectedLandlord} tenant=${expectedTenant}; ${result.signature}`);
}

async function runDisputeScenario(connection, deployer, landlord, tenant, sessions) {
  const chain = await ensureTenancy(connection, deployer, landlord, tenant, sessions, "dispute");
  const reasonCategory = "damage";
  const description = "Phase 6 E2E disputed item damage";
  const proposalResult = await propose(connection, landlord, tenant, chain, "partial_deduction", DEDUCTION_UNITS, {
    reasonCategory,
    description,
    evidenceIds: [],
  });
  const tenantBalanceBefore = await readTokenAmount(connection, ata(tenant.publicKey));
  const landlordAta = ata(landlord.publicKey);
  const landlordBalanceBefore = await readTokenAmount(connection, landlordAta);
  const reason = "Tenant challenges the recorded condition of the item.";
  const signature = await challenge(connection, tenant, chain, proposalResult.proposal, proposalResult.terms, reason);
  const agreementInfo = await connection.getAccountInfo(chain.agreement, "confirmed");
  const proposalInfo = await connection.getAccountInfo(proposalResult.proposal, "confirmed");
  if (!agreementInfo || agreementInfo.data[10] !== 4) throw new Error("Dispute: agreement is not in Disputed state");
  if (!proposalInfo || proposalInfo.data[155] !== 3) throw new Error("Dispute: proposal is not Challenged");
  if (await readTokenAmount(connection, chain.vault) !== DEPOSIT_UNITS) throw new Error("Dispute: vault balance changed");
  if (await readTokenAmount(connection, ata(tenant.publicKey)) !== tenantBalanceBefore) throw new Error("Dispute: tenant balance changed");
  if (await readTokenAmount(connection, landlordAta) !== landlordBalanceBefore) throw new Error("Dispute: landlord balance changed");
  await assertProtectedAndSettled(sessions.tenant.token, chain.tenancyId, "disputed", "disputed");
  console.log(`PASS dispute: full deposit remains locked; ${signature}`);
}

async function main() {
  mkdirSync(".keys", { recursive: true });
  const deployer = loadKeypair(".keys/deployer.json");
  const mintKeypair = loadKeypair(".keys/mint.json");
  if (mintKeypair.publicKey.toBase58() !== MINT_ADDRESS) throw new Error("Mint keypair differs from deployment config.");
  const landlord = loadOrCreateKeypair(".keys/e2e-landlord.json");
  const tenant = loadOrCreateKeypair(".keys/e2e-tenant.json");
  const connection = new Connection(RPC_URL, "confirmed");
  const health = await fetch(`${APP_URL}/api/tenancies/not-a-uuid/reconcile-settlement`);
  if (health.status !== 405) throw new Error(`Configured Next server is not responding (${health.status}).`);

  await ensureSol(connection, deployer, landlord, 50_000_000);
  await ensureSol(connection, deployer, tenant, 30_000_000);
  const landlordSession = await signIn(landlord);
  const tenantSession = await signIn(tenant);
  landlord.sessionToken = landlordSession.token;
  tenant.sessionToken = tenantSession.token;
  await ensureProfile(landlordSession, "Phase 6 E2E Landlord", `phase6-landlord-${landlordSession.user.id}@example.ie`, landlord.publicKey.toBase58());
  await ensureProfile(tenantSession, "Phase 6 E2E Tenant", `phase6-tenant-${tenantSession.user.id}@example.ie`, tenant.publicKey.toBase58());
  const sessions = { landlord: landlordSession, tenant: tenantSession };

  await runSettledScenario(connection, deployer, landlord, tenant, sessions, "full_return", "full return");
  await runSettledScenario(connection, deployer, landlord, tenant, sessions, "partial_deduction", "partial deduction");
  await runDisputeScenario(connection, deployer, landlord, tenant, sessions);
  console.log("PASS Phase 6 Devnet E2E: full return, deduction, and disputed freeze.");
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exitCode = 1;
});
