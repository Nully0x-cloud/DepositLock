#!/usr/bin/env node

/**
 * Phase 5 end-to-end check: local Supabase + real Solana Devnet.
 *
 * Requires a Next dev server at E2E_APP_URL configured with the same local
 * Supabase URL/anon/service-role keys as this script. It creates/reuses two
 * real SIWS wallets under `.keys/`, creates a tenancy through the Phase 4
 * invitation RPCs, initializes and funds the Anchor vault, calls the real
 * reconcile route, and verifies the resulting database state and activity.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createPrivateKey, sign as ed25519Sign, randomUUID } from "node:crypto";
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
  throw new Error("E2E_SUPABASE_URL must point to local Supabase to protect hosted seed data.");
}
if (!ANON_KEY) {
  throw new Error("Set E2E_SUPABASE_ANON_KEY to the local Supabase anon/publishable key.");
}

const PROGRAM_ID = new PublicKey("FX2jWasLMqeG3X4ntc8jogMgxRdbMMSxKcfTWJxexQbY");
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const SYSTEM_PROGRAM_ID = SystemProgram.programId;
const INITIALIZE_DISCRIMINATOR = Uint8Array.from([171, 65, 93, 225, 61, 109, 31, 227]);
const FUND_DISCRIMINATOR = Uint8Array.from([149, 24, 209, 94, 206, 202, 144, 233]);
const MINT_TO_DISCRIMINATOR = 7;
const DEPOSIT = "25.50";
const DEPOSIT_BASE_UNITS = BigInt("25500000");
const deploymentSource = readFileSync("src/lib/solana/deployment.ts", "utf8");
const deploymentMint = /DEPOSIT_LOCK_MINT_ADDRESS\s*=\s*"([1-9A-HJ-NP-Za-km-z]+)"/.exec(deploymentSource)?.[1];
const TEST_MINT_ADDRESS = process.env.DEPOSIT_LOCK_MINT_ADDRESS || deploymentMint;
if (!TEST_MINT_ADDRESS) {
  throw new Error("Set DEPOSIT_LOCK_MINT_ADDRESS to the mint from deployment.ts.");
}
const MINT = new PublicKey(TEST_MINT_ADDRESS);
const HOST = new URL(APP_URL).host;
const URI = `${APP_URL.replace(/\/$/, "")}/`;
const STATEMENT = "Sign in to DepositLock. No funds will move.";

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

function privateKeyFromSeed(seed) {
  const prefix = Buffer.from("302e020100300506032b657004220420", "hex");
  return createPrivateKey({
    key: Buffer.concat([prefix, seed]),
    format: "der",
    type: "pkcs8",
  });
}

function base64Url(bytes) {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function siwsMessage(address, issuedAt) {
  return [
    `${HOST} wants you to sign in with your Solana account:`,
    address,
    "",
    STATEMENT,
    "",
    "Version: 1",
    `URI: ${URI}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
}

async function signIn(keypair) {
  const address = keypair.publicKey.toBase58();
  const message = siwsMessage(address, new Date().toISOString());
  const signature = base64Url(
    ed25519Sign(null, Buffer.from(message, "utf8"), privateKeyFromSeed(keypair.secretKey.subarray(0, 32))),
  );
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=web3`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ chain: "solana", message, signature }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    throw new Error(`Local SIWS sign-in failed (${response.status}): ${JSON.stringify(body)}`);
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
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!response.ok) {
    throw new Error(`Supabase ${method} ${path} failed (${response.status}): ${JSON.stringify(parsed)}`);
  }
  return parsed;
}

async function ensureProfile(session, fullName, email, wallet) {
  const rows = await rest(
    `profiles?id=eq.${encodeURIComponent(session.user.id)}&select=id,wallet_address`,
    { token: session.token },
  );
  if (rows.length === 0) {
    await rest("profiles", {
      token: session.token,
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: { id: session.user.id, full_name: fullName, email },
    });
  }
  const current = await rest(
    `profiles?id=eq.${encodeURIComponent(session.user.id)}&select=id,wallet_address`,
    { token: session.token },
  );
  if (current[0]?.wallet_address !== wallet) {
    throw new Error(`Verified profile wallet mismatch for ${fullName}.`);
  }
}

function u64(value) {
  if (value < BigInt(0) || value > BigInt("18446744073709551615")) {
    throw new Error("u64 out of range");
  }
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(value);
  return bytes;
}

function uuidBytes(value) {
  const compact = value.replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/i.test(compact)) throw new Error("Invalid tenancy UUID from Supabase.");
  return Buffer.from(compact, "hex");
}

function ataAddress(owner, mint) {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

async function ensureSol(connection, payer, recipient, minimumLamports) {
  const balance = await connection.getBalance(recipient.publicKey, "confirmed");
  if (balance >= minimumLamports) return;
  const signature = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: recipient.publicKey,
        lamports: minimumLamports - balance,
      }),
    ),
    [payer],
    { commitment: "confirmed" },
  );
  console.log(`Funded test wallet ${recipient.publicKey.toBase58()} (${signature})`);
}

async function mintTestTokens(connection, authority, tenant, mint) {
  const ata = ataAddress(tenant.publicKey, mint);
  const instructions = [];
  if (!(await connection.getAccountInfo(ata, "confirmed"))) {
    instructions.push(
      new TransactionInstruction({
        programId: ASSOCIATED_TOKEN_PROGRAM_ID,
        keys: [
          { pubkey: authority.publicKey, isSigner: true, isWritable: true },
          { pubkey: ata, isSigner: false, isWritable: true },
          { pubkey: tenant.publicKey, isSigner: false, isWritable: false },
          { pubkey: mint, isSigner: false, isWritable: false },
          { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        data: Buffer.alloc(0),
      }),
    );
  }

  const mintToData = Buffer.alloc(9);
  mintToData.writeUInt8(MINT_TO_DISCRIMINATOR, 0);
  mintToData.writeBigUInt64LE(BigInt("1000000000"), 1); // 1,000 test USDC
  instructions.push(
    new TransactionInstruction({
      programId: TOKEN_PROGRAM_ID,
      keys: [
        { pubkey: mint, isSigner: false, isWritable: true },
        { pubkey: ata, isSigner: false, isWritable: true },
        { pubkey: authority.publicKey, isSigner: true, isWritable: false },
      ],
      data: mintToData,
    }),
  );

  const signature = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(...instructions),
    [authority],
    { commitment: "confirmed" },
  );
  console.log(`Minted test tokens to tenant ATA (${signature})`);
}

async function main() {
  mkdirSync(".keys", { recursive: true });
  const deployer = loadKeypair(".keys/deployer.json");
  const mintKeypair = loadKeypair(".keys/mint.json");
  if (!mintKeypair.publicKey.equals(MINT)) {
    throw new Error("E2E mint does not match `.keys/mint.json`.");
  }
  const landlord = loadOrCreateKeypair(".keys/e2e-landlord.json");
  const tenant = loadOrCreateKeypair(".keys/e2e-tenant.json");
  const connection = new Connection(RPC_URL, "confirmed");

  const localHealth = await fetch(`${APP_URL}/api/tenancies/not-a-uuid/reconcile-deposit`);
  if (localHealth.status !== 405 && localHealth.status !== 400) {
    throw new Error(`Next dev server is not responding at ${APP_URL} (HTTP ${localHealth.status}).`);
  }

  const landlordSession = await signIn(landlord);
  const tenantSession = await signIn(tenant);
  const landlordAddress = landlord.publicKey.toBase58();
  const tenantAddress = tenant.publicKey.toBase58();
  await ensureProfile(landlordSession, "DepositLock E2E Landlord", `e2e-landlord-${landlordSession.user.id}@example.ie`, landlordAddress);
  await ensureProfile(tenantSession, "DepositLock E2E Tenant", `e2e-tenant-${tenantSession.user.id}@example.ie`, tenantAddress);

  const createResult = await rest("rpc/create_tenancy_with_invitation", {
    token: landlordSession.token,
    method: "POST",
    body: {
      p_start_date: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
      p_monthly_rent: 1500,
      p_deposit: Number(DEPOSIT),
      p_tenant_wallet: tenantAddress,
      p_property: {
        address_line_1: `E2E DepositLock ${randomUUID().slice(0, 8)}`,
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
  const tenancyId = createResult?.tenancy_id;
  const invitationToken = createResult?.invitation_token;
  if (!tenancyId || !invitationToken) {
    throw new Error(`Tenancy RPC returned an unexpected result: ${JSON.stringify(createResult)}`);
  }

  await rest("rpc/accept_tenancy_invitation", {
    token: tenantSession.token,
    method: "POST",
    body: { p_token: invitationToken },
  });

  await ensureSol(connection, deployer, landlord, 30_000_000);
  await ensureSol(connection, deployer, tenant, 10_000_000);
  await mintTestTokens(connection, deployer, tenant, MINT);

  const tenancySeed = uuidBytes(tenancyId);
  const [agreement] = PublicKey.findProgramAddressSync(
    [Buffer.from("deposit"), tenancySeed],
    PROGRAM_ID,
  );
  const vault = ataAddress(agreement, MINT);
  const [config] = PublicKey.findProgramAddressSync(
    [Buffer.from("depositlock_config")],
    PROGRAM_ID,
  );

  const initializeData = Buffer.concat([
    Buffer.from(INITIALIZE_DISCRIMINATOR),
    tenancySeed,
    u64(DEPOSIT_BASE_UNITS),
  ]);
  const initialize = new TransactionInstruction({
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
      { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: initializeData,
  });
  const initializeSignature = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(initialize),
    [landlord],
    { commitment: "confirmed" },
  );
  console.log(`Agreement initialized (${initializeSignature})`);

  const source = ataAddress(tenant.publicKey, MINT);
  const fundData = Buffer.concat([Buffer.from(FUND_DISCRIMINATOR), u64(DEPOSIT_BASE_UNITS)]);
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
    data: fundData,
  });
  const fundingSignature = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(fund),
    [tenant],
    { commitment: "confirmed" },
  );
  console.log(`Deposit funded (${fundingSignature})`);

  const reconcileResponse = await fetch(
    `${APP_URL}/api/tenancies/${encodeURIComponent(tenancyId)}/reconcile-deposit`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${tenantSession.token}` },
    },
  );
  const reconcileBody = await reconcileResponse.json().catch(() => ({}));
  if (!reconcileResponse.ok || reconcileBody.state !== "deposit_funded") {
    throw new Error(`Reconcile failed (${reconcileResponse.status}): ${JSON.stringify(reconcileBody)}`);
  }

  const agreementInfo = await connection.getAccountInfo(agreement, "confirmed");
  if (!agreementInfo || agreementInfo.data[10] !== 1) {
    throw new Error("On-chain agreement is not in Funded state after reconciliation.");
  }
  const chainDepositedAmount = agreementInfo.data.readBigUInt64LE(163);
  if (chainDepositedAmount !== DEPOSIT_BASE_UNITS) {
    throw new Error(`On-chain deposited amount mismatch: ${chainDepositedAmount}`);
  }

  const [recordRows, tenancyRows, activityRows] = await Promise.all([
    rest(`deposit_records?tenancy_id=eq.${encodeURIComponent(tenancyId)}&select=onchain_status,required_amount,deposited_amount,funding_signature`, {
      token: tenantSession.token,
    }),
    rest(`tenancies?id=eq.${encodeURIComponent(tenancyId)}&select=status,vault_address`, {
      token: tenantSession.token,
    }),
    rest(`activity_events?tenancy_id=eq.${encodeURIComponent(tenancyId)}&event_type=eq.deposit_protected&select=id`, {
      token: tenantSession.token,
    }),
  ]);

  if (recordRows[0]?.onchain_status !== "deposit_funded") {
    throw new Error(`Deposit record was not reconciled: ${JSON.stringify(recordRows)}`);
  }
  if (tenancyRows[0]?.status !== "protected" || tenancyRows[0]?.vault_address !== vault.toBase58()) {
    throw new Error(`Tenancy was not moved to protected: ${JSON.stringify(tenancyRows)}`);
  }
  if (activityRows.length !== 1) {
    throw new Error(`Expected exactly one deposit_protected event; found ${activityRows.length}.`);
  }

  console.log("PASS: Devnet agreement funded, server reconciliation verified, tenancy protected.");
  console.log(`Tenancy: ${tenancyId}`);
  console.log(`Agreement: ${agreement.toBase58()}`);
  console.log(`Vault: ${vault.toBase58()}`);
  console.log(`Funding transaction: ${fundingSignature}`);
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exitCode = 1;
});
