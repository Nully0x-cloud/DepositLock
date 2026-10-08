#!/usr/bin/env node
/**
 * Re-authentication identity regression check (local Supabase only).
 *
 * Reproduces the returning-user shape from manual QA against real local
 * GoTrue + PostgREST + RLS — no mocks:
 *
 *   1. wallet A signs in (fresh client) → identity A
 *   2. profile A created, tenancy created by A (tenant invited, not accepted)
 *   3. client state torn down (brand-new client, no session carried over)
 *   4. wallet A signs in again → MUST resolve to the same auth user id
 *   5. same profile row restored, same tenancy still visible via RLS
 *   6. wallet B signs in → sees its own profile only, NONE of A's tenancies
 *
 * Cleanup removes the tenancy and both profiles through the service role so
 * the seed-shape pgTAP suites keep passing. Auth users are deterministic
 * (fixed dev seeds, never fundable) and are reused across runs.
 */

import { createPrivateKey, randomUUID, sign as ed25519Sign } from "node:crypto";
import { Keypair } from "@solana/web3.js";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.E2E_SUPABASE_URL || "http://127.0.0.1:54321";
const ANON_KEY = process.env.E2E_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(URL)) {
  throw new Error("Re-auth checks are local-only; refusing a hosted Supabase URL.");
}
if (!ANON_KEY) throw new Error("Set E2E_SUPABASE_ANON_KEY to the local Supabase anon key.");
if (!SERVICE_KEY) throw new Error("Set E2E_SUPABASE_SERVICE_ROLE_KEY to the local service-role key (cleanup only).");

const HOST = "localhost:3000";
const URI = "http://localhost:3000/";
// Fixed development seeds: clearly not real keys, deterministic so repeated
// runs reuse the same auth users instead of littering the database.
const SEED_A = Buffer.from("aaa-depositlock-local-reauth-dev-seed-not-real-01");
const SEED_B = Buffer.from("bbb-depositlock-local-reauth-dev-seed-not-real-02");

let passed = 0;
let failed = 0;
function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function keypairFromSeed(seed) {
  return Keypair.fromSeed(seed.subarray(0, 32));
}

function privateKeyFromSeed(seed) {
  const prefix = Buffer.from("302e020100300506032b657004220420", "hex");
  return createPrivateKey({ key: Buffer.concat([prefix, seed.subarray(0, 32)]), format: "der", type: "pkcs8" });
}

function buildMessage(address) {
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
  // A brand-new client every time: nothing (no session, no cache) survives
  // between sign-ins, exactly like a torn-down browser state.
  const address = keypair.publicKey.toBase58();
  const message = buildMessage(address);
  const signature = Buffer.from(
    ed25519Sign(null, Buffer.from(message, "utf8"), privateKeyFromSeed(keypair.secretKey)),
  ).toString("base64url");
  const res = await fetch(`${URL}/auth/v1/token?grant_type=web3`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ chain: "solana", message, signature }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) throw new Error(`Local SIWS failed (${res.status}): ${JSON.stringify(body)}`);
  const authed = createClient(URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${body.access_token}` } },
  });
  return { client: authed, token: body.access_token, user: body.user, address };
}

async function rest(client, token, path, { method = "GET", body } = {}) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(parsed)}`);
  return parsed;
}

async function main() {
  const walletA = keypairFromSeed(SEED_A);
  const walletB = keypairFromSeed(SEED_B);
  const service = createClient(URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  let tenancyId = null;
  let userA = null;
  let userB = null;

  try {
    // 1–2. Wallet A authenticates on a fresh client; profile + tenancy created.
    const first = await signIn(walletA);
    userA = first.user.id;
    check("wallet A first sign-in returns a session", Boolean(first.token));
    await rest(first.client, first.token, "profiles", {
      method: "POST",
      body: { id: userA, full_name: "Reauth Landlord", email: `reauth-a-${userA}@example.ie` },
    }).catch((cause) => {
      // Re-runs reuse the same auth user; the profile may already exist.
      if (!String(cause).includes("409")) throw cause;
    });
    const created = await rest(first.client, first.token, "rpc/create_tenancy_with_invitation", {
      method: "POST",
      body: {
        p_start_date: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
        p_monthly_rent: 1500,
        p_deposit: 900,
        p_tenant_wallet: walletB.publicKey.toBase58(),
        p_property: {
          address_line_1: `Reauth Close ${randomUUID().slice(0, 8)}`,
          city: "Dublin",
          county: "Dublin",
          postal_code: "D02 R001",
          country: "IE",
          property_type: "apartment",
          bedrooms: 1,
        },
        p_currency: "EUR",
      },
    });
    tenancyId = created.tenancy_id;
    check("tenancy created by A", Boolean(tenancyId));
    const mineBefore = await rest(first.client, first.token, `tenancies?id=eq.${tenancyId}&select=id`);
    check("A sees its tenancy before teardown", mineBefore.length === 1);

    // 3–5. Tear everything down; A signs in again from scratch.
    const second = await signIn(walletA);
    check("wallet A re-authenticates to the SAME auth identity", second.user.id === userA, second.user.id);
    const profileAgain = await rest(second.client, second.token, `profiles?id=eq.${userA}&select=id,full_name`);
    check(
      "same profile row restored for A",
      profileAgain.length === 1 && profileAgain[0].full_name === "Reauth Landlord",
      JSON.stringify(profileAgain),
    );
    const mineAfter = await rest(second.client, second.token, "tenancies?select=id");
    check(
      "tenancy remains visible to A after re-authentication",
      mineAfter.some((row) => row.id === tenancyId),
      JSON.stringify(mineAfter.map((row) => row.id)),
    );

    // 6. Wallet B: own profile only, none of A's tenancies.
    const other = await signIn(walletB);
    userB = other.user.id;
    check("wallet B resolves to a DIFFERENT auth identity", userB !== userA);
    await rest(other.client, other.token, "profiles", {
      method: "POST",
      body: { id: userB, full_name: "Reauth Outsider", email: `reauth-b-${userB}@example.ie` },
    }).catch((cause) => {
      if (!String(cause).includes("409")) throw cause;
    });
    const profilesVisibleToB = await rest(other.client, other.token, "profiles?select=id");
    check(
      "B sees only its own profile row",
      profilesVisibleToB.length === 1 && profilesVisibleToB[0].id === userB,
      JSON.stringify(profilesVisibleToB.map((row) => row.id)),
    );
    const tenanciesVisibleToB = await rest(other.client, other.token, "tenancies?select=id");
    check(
      "A's tenancy is NOT visible to B",
      !tenanciesVisibleToB.some((row) => row.id === tenancyId),
    );
  } finally {
    // Cleanup through the service role so seed-shape suites keep passing.
    // Order matters: tenancy first (frees the property FK), then orphaned
    // properties created by the test users, then the profiles themselves.
    // Every step is checked — a silent cleanup failure would pollute counts.
    const cleanups = [];
    if (tenancyId) cleanups.push(["tenancy", service.from("tenancies").delete().eq("id", tenancyId)]);
    const cleanupResults = await Promise.all(
      cleanups.map(async ([label, query]) => [label, await query]),
    );
    for (const [label, result] of cleanupResults) {
      check(`cleanup removed the test ${label}`, !result.error, result.error?.message ?? "");
    }
    for (const id of [userA, userB].filter(Boolean)) {
      // Only properties no surviving tenancy points at (never seed/user rows).
      const orphans = await service.from("properties").select("id").eq("created_by_profile_id", id);
      for (const row of orphans.data ?? []) {
        const used = await service.from("tenancies").select("id").eq("property_id", row.id).limit(1);
        if ((used.data ?? []).length === 0) {
          const removed = await service.from("properties").delete().eq("id", row.id);
          check("cleanup removed the test property", !removed.error, removed.error?.message ?? "");
        }
      }
      const gone = await service.from("profiles").delete().eq("id", id);
      check("cleanup removed the test profile", !gone.error, gone.error?.message ?? "");
    }
  }

  console.log(`\nRe-auth checks: ${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exitCode = 1;
});
