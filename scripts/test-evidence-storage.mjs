#!/usr/bin/env node

/** Local-only Storage RLS integration checks. Test profiles are ephemeral. */

import { createPrivateKey, randomUUID, sign as ed25519Sign } from "node:crypto";
import { Keypair } from "@solana/web3.js";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.E2E_SUPABASE_URL || "http://127.0.0.1:54321";
const ANON_KEY = process.env.E2E_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "tenancy-evidence";
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(URL)) {
  throw new Error("Evidence Storage checks are local-only; refusing a hosted Supabase URL.");
}
if (!ANON_KEY || !SERVICE_KEY) {
  throw new Error("Set local E2E_SUPABASE_ANON_KEY and E2E_SUPABASE_SERVICE_ROLE_KEY values.");
}

function keypairFromSeed(seed) {
  const prefix = Buffer.from("302e020100300506032b657004220420", "hex");
  return createPrivateKey({ key: Buffer.concat([prefix, seed]), format: "der", type: "pkcs8" });
}

function siwsMessage(address) {
  const host = "localhost:3000";
  return [
    `${host} wants you to sign in with your Solana account:`,
    address,
    "",
    "Sign in to DepositLock. No funds will move.",
    "",
    "Version: 1",
    "URI: http://localhost:3000/",
    `Issued At: ${new Date().toISOString()}`,
  ].join("\n");
}

async function signIn(wallet) {
  const address = wallet.publicKey.toBase58();
  const message = siwsMessage(address);
  const signature = Buffer.from(ed25519Sign(
    null,
    Buffer.from(message),
    keypairFromSeed(wallet.secretKey.subarray(0, 32)),
  )).toString("base64url");
  const response = await fetch(`${URL}/auth/v1/token?grant_type=web3`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ chain: "solana", message, signature }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.access_token) throw new Error(`Local wallet sign-in failed (${response.status}).`);
  return { token: result.access_token, user: result.user };
}

function userClient(token) {
  return createClient(URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

async function ensureProfile(client, session, wallet, label) {
  const { data: existing, error: readError } = await client
    .from("profiles").select("id,wallet_address").eq("id", session.user.id).maybeSingle();
  if (readError) throw new Error("Could not read a local Storage test profile.");
  if (!existing) {
    const { error } = await client.from("profiles").insert({
      id: session.user.id,
      full_name: `Storage Test ${label}`,
      email: `storage-${label.toLowerCase()}-${session.user.id}@example.ie`,
    });
    if (error) throw new Error("Could not create a local Storage test profile.");
  }
  if (existing?.wallet_address && existing.wallet_address !== wallet.publicKey.toBase58()) {
    throw new Error("Local Storage test profile wallet does not match the signed session.");
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const landlordWallet = Keypair.generate();
  const tenantWallet = Keypair.generate();
  const outsiderWallet = Keypair.generate();
  const landlordSession = await signIn(landlordWallet);
  const tenantSession = await signIn(tenantWallet);
  const outsiderSession = await signIn(outsiderWallet);
  const landlord = userClient(landlordSession.token);
  const tenant = userClient(tenantSession.token);
  const outsider = userClient(outsiderSession.token);
  const service = createClient(URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  await Promise.all([
    ensureProfile(landlord, landlordSession, landlordWallet, "Landlord"),
    ensureProfile(tenant, tenantSession, tenantWallet, "Tenant"),
    ensureProfile(outsider, outsiderSession, outsiderWallet, "Outsider"),
  ]);

  const tenancy = await landlord.rpc("create_tenancy_with_invitation", {
    p_start_date: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
    p_monthly_rent: 1500,
    p_deposit: 900,
    p_tenant_wallet: tenantWallet.publicKey.toBase58(),
    p_property: {
      address_line_1: `Storage test ${randomUUID().slice(0, 8)}`,
      city: "Dublin", county: "Dublin", postal_code: "D02 E2E1", country: "IE",
      property_type: "apartment", bedrooms: 1,
    },
    p_currency: "EUR",
  });
  if (tenancy.error || !tenancy.data?.tenancy_id || !tenancy.data?.invitation_token) {
    throw new Error("Could not prepare a local tenancy for the Storage check.");
  }
  const accepted = await tenant.rpc("accept_tenancy_invitation", { p_token: tenancy.data.invitation_token });
  if (accepted.error) throw new Error("Could not accept the local Storage test invitation.");
  const tenancyId = tenancy.data.tenancy_id;

  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZt8AAAAASUVORK5CYII=",
    "base64",
  );
  const moveInPath = `tenancies/${tenancyId}/move_in/${randomUUID()}.png`;
  const orphanPath = `tenancies/${tenancyId}/move_in/${randomUUID()}.png`;

  const moveInUpload = await landlord.storage.from(BUCKET).upload(moveInPath, png, { contentType: "image/png" });
  assert(!moveInUpload.error, "A tenancy participant should be able to upload move-in evidence.");
  const tenantSigned = await tenant.storage.from(BUCKET).createSignedUrl(moveInPath, 60);
  assert(!tenantSigned.error && tenantSigned.data?.signedUrl, "The other participant should be able to request a private signed preview.");
  const imageRead = await fetch(tenantSigned.data.signedUrl);
  assert(imageRead.ok, "A participant signed preview should read the private image.");

  const outsiderSigned = await outsider.storage.from(BUCKET).createSignedUrl(moveInPath, 60);
  assert(Boolean(outsiderSigned.error) || !outsiderSigned.data?.signedUrl, "An outsider must not sign a participant's private image.");
  const outsiderUpload = await outsider.storage.from(BUCKET).upload(
    `tenancies/${tenancyId}/move_in/${randomUUID()}.png`, png, { contentType: "image/png" },
  );
  assert(Boolean(outsiderUpload.error), "An outsider must not upload into another tenancy.");

  const orphanUpload = await landlord.storage.from(BUCKET).upload(orphanPath, png, { contentType: "image/png" });
  assert(!orphanUpload.error, "A participant can upload a file before attaching its metadata.");
  const orphanDelete = await landlord.storage.from(BUCKET).remove([orphanPath]);
  assert(!orphanDelete.error, "An uploader may clean up an unattached upload.");

  const evidence = await service.from("evidence").insert({
    tenancy_id: tenancyId,
    uploaded_by_profile_id: landlordSession.user.id,
    evidence_context: "move_in",
    category: "general",
    file_url: moveInPath,
    mime_type: "image/png",
    file_size_bytes: png.length,
    caption: "Storage access check photo",
  }).select("id").single();
  if (evidence.error || !evidence.data) throw new Error("Could not attach test evidence metadata.");
  const lockedDelete = await landlord.storage.from(BUCKET).remove([moveInPath]);
  const recordedImage = await tenant.storage.from(BUCKET).download(moveInPath);
  assert(Boolean(lockedDelete.error) || (!recordedImage.error && recordedImage.data), "Once metadata is recorded, the original uploader cannot delete the evidence file.");
  const participantStillReads = await tenant.storage.from(BUCKET).download(moveInPath);
  assert(!participantStillReads.error && participantStillReads.data, "Recorded evidence remains readable by tenancy participants.");

  console.log("PASS private Storage: participant upload/read, outsider denial, orphan cleanup, and recorded-evidence immutability.");
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : "Storage integration checks failed.");
  process.exitCode = 1;
});
