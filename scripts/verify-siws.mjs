#!/usr/bin/env node
/**
 * Sign-In-With-Solana integration check (Phase 3B).
 *
 * Talks to whatever Supabase project `.env.local` points at (local stack or
 * hosted) over HTTP exactly the way the browser does — publishable/anon key
 * only, no service-role key anywhere:
 *
 *   1. builds a SIWS message, signs it with a real ed25519 keypair
 *      (development-only fixed seed — it can never hold funds),
 *   2. exchanges it for a session through GoTrue (`grant_type=web3`),
 *   3. exercises the identity contract as that session:
 *        - profile created as auth.uid() with the wallet stamped by the DB,
 *        - a forged profile id is rejected (42501),
 *        - a forged wallet address is rejected (23514),
 *        - RLS exposes only the caller's own rows,
 *        - `verified_wallet_address()` is not callable by client roles,
 *        - other people's tenancies read as empty, not as an error.
 *
 * Run:  npm run test:siws
 */

import { readFileSync } from "node:fs";
import { createPrivateKey, sign as ed25519Sign, randomUUID } from "node:crypto";
import { Keypair } from "@solana/web3.js";

const STATEMENT = "Sign in to DepositLock. No funds will move.";
const URI = "http://localhost:3000/";
const HOST = "localhost:3000";

// Fixed development seed: clearly not a real key, deterministic so repeated
// runs reuse the same auth user instead of littering the database.
const DEV_SEED = Buffer.from(
  "depositlock-local-siws-dev-seed-not-a-real-key-0001",
  "utf8",
).subarray(0, 32);

loadDotEnvLocal();

const BASE =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "http://127.0.0.1:54321";
const ANON =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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

function loadDotEnvLocal() {
  try {
    const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (!match) continue;
      let value = match[2];
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(match[1] in process.env)) process.env[match[1]] = value;
    }
  } catch {
    // No .env.local — the caller may export the values directly.
  }
}

function privateKeyFromSeed(seed) {
  const derPrefix = Buffer.from("302e020100300506032b657004220420", "hex");
  return createPrivateKey({
    key: Buffer.concat([derPrefix, seed]),
    format: "der",
    type: "pkcs8",
  });
}

function toBase64Url(bytes) {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base58FromSeed(seed) {
  return Keypair.fromSeed(seed).publicKey.toBase58();
}

function buildMessage(address, issuedAt) {
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

async function signIn(message, signature) {
  const res = await fetch(`${BASE}/auth/v1/token?grant_type=web3`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ chain: "solana", message, signature }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function decodeJwtPayload(token) {
  const part = token.split(".")[1];
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

async function rest(path, { token, method = "GET", body, headers = {} } = {}) {
  const res = await fetch(`${BASE}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...headers,
    },
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
  return { status: res.status, body: parsed };
}

async function main() {
  console.log(`SIWS integration check against ${BASE}`);
  if (!ANON) {
    console.error(
      "No anon key found. Set NEXT_PUBLIC_SUPABASE_ANON_KEY (or add it to .env.local).",
    );
    process.exit(1);
  }

  // --- 1. real signature → real GoTrue session -----------------------------
  const keyPairSeed = DEV_SEED;
  const privateKey = privateKeyFromSeed(keyPairSeed);
  const address = base58FromSeed(keyPairSeed);
  const issuedAt = new Date().toISOString();
  const message = buildMessage(address, issuedAt);
  const signature = toBase64Url(
    ed25519Sign(null, Buffer.from(message, "utf8"), privateKey),
  );

  const signInResult = await signIn(message, signature);
  if (signInResult.status !== 200) {
    console.error(
      `Sign-in failed with HTTP ${signInResult.status}:`,
      JSON.stringify(signInResult.body),
    );
    console.error(
      "Is Sign-In-With-Solana enabled for this project? Locally that is " +
        "[auth.web3.solana] in supabase/config.toml (apply with: npx supabase " +
        "stop && npx supabase start); on a hosted project it is the Web3 " +
        "provider toggle in the Supabase dashboard under Authentication.",
    );
    process.exit(1);
  }

  const user = signInResult.body.user ?? {};
  // GoTrue's web3 grant returns the session fields at the top level
  // (access_token / refresh_token / …), not nested under `session`.
  const session = signInResult.body;
  check("SIWS sign-in returns a session", Boolean(session.access_token));
  check("auth user id is a UUID", /^[0-9a-f-]{36}$/i.test(user.id ?? ""));

  // --- 2. repeat sign-in reuses the same identity --------------------------
  const again = await signIn(message, signature);
  check(
    "repeat sign-in maps to the same auth user",
    again.status === 200 && again.body?.user?.id === user.id,
    `statuses ${signInResult.status}/${again.status}`,
  );

  // --- 3. session claims ----------------------------------------------------
  const claims = decodeJwtPayload(session.access_token);
  check("JWT sub is the auth user id", claims.sub === user.id);
  check("JWT role is authenticated", claims.role === "authenticated");
  check(
    "JWT records the web3 sign-in method",
    Array.isArray(claims.amr) && claims.amr.some((entry) => entry.method === "web3"),
  );
  check(
    "JWT carries the verified address for display",
    claims.user_metadata?.custom_claims?.address === address,
  );

  // --- 4. auth.identities row (the trustworthy side) ------------------------
  const identity = (user.identities ?? []).find((row) => row.provider === "web3");
  check("auth.identities has a web3 identity", Boolean(identity));
  check(
    "identity maps to this wallet address",
    identity?.id === `web3:solana:${address}`,
    identity?.id,
  );

  // --- 5. profile creation as auth.uid() ------------------------------------
  const token = session.access_token;
  const createAttempt = await rest("profiles", {
    token,
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: { id: user.id, full_name: "SIWS Check", email: "siws.check@example.ie" },
  });

  if (createAttempt.status === 201 || createAttempt.status === 200) {
    check("profile insert without a wallet succeeds", true);
  } else if (createAttempt.body?.code === "23505") {
    check("profile insert without a wallet succeeds", true, "reusing profile from a previous run");
  } else {
    check(
      "profile insert without a wallet succeeds",
      false,
      `HTTP ${createAttempt.status} ${JSON.stringify(createAttempt.body)}`,
    );
  }

  const ownRows = await rest(`profiles?id=eq.${user.id}&select=id,full_name,wallet_address`, {
    token,
  });
  const ownProfile = Array.isArray(ownRows.body) ? ownRows.body[0] : null;
  check(
    "own profile row is readable",
    ownProfile !== undefined && ownProfile !== null,
    `HTTP ${ownRows.status}`,
  );
  check(
    "wallet_address was stamped from the verified identity by the database",
    ownProfile?.wallet_address === address,
    `got ${ownProfile?.wallet_address}`,
  );

  // --- 6. forged profile id rejected ----------------------------------------
  const forgedId = await rest("profiles", {
    token,
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: {
      id: randomUUID(),
      full_name: "Not Me",
      email: "not.me@example.ie",
      wallet_address: address,
    },
  });
  check(
    "creating a profile for somebody else fails",
    forgedId.status === 403 && forgedId.body?.code === "42501",
    `HTTP ${forgedId.status} code=${forgedId.body?.code}`,
  );

  // --- 7. forged wallet address rejected -------------------------------------
  const forgedWallet = await rest(`profiles?id=eq.${user.id}`, {
    token,
    method: "PATCH",
    body: { wallet_address: "DEVWALLET-00000000000000000000FORGED001" },
  });
  check(
    "editing the bound wallet to another address fails",
    forgedWallet.status === 400 && forgedWallet.body?.code === "23514",
    `HTTP ${forgedWallet.status} code=${forgedWallet.body?.code}`,
  );

  // --- 8. RLS: only my rows ---------------------------------------------------
  const allProfiles = await rest("profiles?select=id", { token });
  const visibleIds = Array.isArray(allProfiles.body)
    ? allProfiles.body.map((row) => row.id)
    : [];
  check(
    "profiles table exposes only the caller's own row",
    allProfiles.status === 200 &&
      visibleIds.length <= 1 &&
      visibleIds.every((id) => id === user.id),
    `HTTP ${allProfiles.status}, saw ${visibleIds.length} rows`,
  );

  const allTenancies = await rest("tenancies?select=id", { token });
  check(
    "somebody else's tenancies read as an empty list (not an error)",
    allTenancies.status === 200 && Array.isArray(allTenancies.body) && allTenancies.body.length === 0,
    `HTTP ${allTenancies.status}, rows=${Array.isArray(allTenancies.body) ? allTenancies.body.length : "?"}`,
  );

  // --- 9. wallet lookup function is not callable ------------------------------
  const rpc = await rest("rpc/verified_wallet_address", {
    token,
    method: "POST",
    body: { p_user_id: user.id },
  });
  check(
    "verified_wallet_address() is not exposed to client roles",
    rpc.status !== 200,
    `HTTP ${rpc.status}`,
  );

  console.log(
    `\nSIWS integration checks: ${passed} passed, ${failed} failed.`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("SIWS check crashed:", error?.message ?? error);
  process.exit(1);
});
