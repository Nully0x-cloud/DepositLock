#!/usr/bin/env node

/**
 * Local-only demo fixtures for the hackathon walkthrough.
 *
 * Creates clearly-labeled off-chain demo rows (profiles, properties,
 * tenancies, evidence, deductions, disputes, settlements) so the full
 * product flow can be shown without touching Devnet or real funds.
 * No private keys, no signing material, no chain transactions.
 *
 * Safety:
 * - Refuses any non-loopback Supabase URL.
 * - Requires explicit DEMO_CONFIRM=local-demo env acknowledgement.
 * - Idempotent: fixed demo UUIDs with on-conflict no-ops.
 * - Never deletes anything; reset with `npm run db:reset`.
 */

import { createClient } from "@supabase/supabase-js";

const URL = process.env.E2E_SUPABASE_URL || "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(URL)) {
  throw new Error("Demo fixtures are local-only; refusing a hosted Supabase URL.");
}
if (process.env.DEMO_CONFIRM !== "local-demo") {
  throw new Error("Set DEMO_CONFIRM=local-demo to acknowledge local demo data creation.");
}
if (!SERVICE_KEY) {
  throw new Error("Set E2E_SUPABASE_SERVICE_ROLE_KEY to the local Supabase service-role key.");
}

const LANDLORD = "d0000001-0000-4000-8000-0000000000a1";
const TENANT = "d0000001-0000-4000-8000-0000000000b2";
const PROPERTY = "d0000001-0000-4000-8000-0000000000c3";
const TENANCY_PROTECTED = "d0000001-0000-4000-8000-00000000a001";
const TENANCY_CLOSED = "d0000001-0000-4000-8000-00000000b002";
const TENANCY_DISPUTED = "d0000001-0000-4000-8000-00000000c003";
const DEDUCTION_CLOSED = "d0000001-0000-4000-8000-00000000d004";
const DEDUCTION_DISPUTED = "d0000001-0000-4000-8000-00000000d005";
const DISPUTE = "d0000001-0000-4000-8000-00000000e006";

const db = createClient(URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function upsert(table, row, onConflict) {
  const { error } = await db.from(table).upsert(row, { onConflict, ignoreDuplicates: true });
  if (error) throw new Error(`Demo fixture ${table} failed: ${error.message}`);
}

async function main() {
  await upsert("profiles", { id: LANDLORD, full_name: "Demo Landlord", email: "demo-landlord@example.ie" }, "id");
  await upsert("profiles", { id: TENANT, full_name: "Demo Tenant", email: "demo-tenant@example.ie" }, "id");
  await upsert(
    "properties",
    {
      id: PROPERTY, created_by_profile_id: LANDLORD, address_line_1: "18 Camden Street",
      city: "Dublin", county: "Dublin", postal_code: "D02 XY34", country: "IE",
      property_type: "apartment", bedrooms: 2,
    },
    "id",
  );

  const tenancy = (id, status) => ({
    id, property_id: PROPERTY, landlord_profile_id: LANDLORD, tenant_profile_id: TENANT,
    start_date: "2026-09-01", end_date: "2027-08-31", monthly_rent_amount: 2100,
    deposit_amount: 1800, display_currency: "EUR", settlement_token: "USDC", status,
  });
  await upsert("tenancies", tenancy(TENANCY_PROTECTED, "protected"), "id");
  await upsert("tenancies", tenancy(TENANCY_CLOSED, "closed"), "id");
  await upsert("tenancies", tenancy(TENANCY_DISPUTED, "disputed"), "id");

  await upsert(
    "evidence",
    {
      id: "d0000001-0000-4000-8000-00000000f007", tenancy_id: TENANCY_PROTECTED,
      uploaded_by_profile_id: TENANT, evidence_context: "move_in", category: "kitchen",
      file_url: null, caption: "Demo move-in kitchen photo placeholder",
    },
    "id",
  );
  await upsert(
    "deductions",
    {
      id: DEDUCTION_CLOSED, tenancy_id: TENANCY_CLOSED, proposed_by_profile_id: LANDLORD,
      amount: 150, reason_category: "cleaning", description: "Demo agreed clean", status: "resolved",
    },
    "id",
  );
  await upsert(
    "settlements",
    {
      tenancy_id: TENANCY_CLOSED, original_deposit_amount: 1800, tenant_amount: 1650,
      landlord_amount: 150, settlement_type: "partial_deduction",
      tenant_approved: true, landlord_approved: true,
    },
    "tenancy_id",
  );
  await upsert(
    "deductions",
    {
      id: DEDUCTION_DISPUTED, tenancy_id: TENANCY_DISPUTED, proposed_by_profile_id: LANDLORD,
      amount: 300, reason_category: "damage", description: "Demo challenged damage claim",
      status: "challenged",
    },
    "id",
  );
  await upsert(
    "disputes",
    {
      id: DISPUTE, tenancy_id: TENANCY_DISPUTED, deduction_id: DEDUCTION_DISPUTED,
      opened_by_profile_id: TENANT, reason: "Demo challenge: already damaged at move-in", status: "open",
    },
    "id",
  );

  console.log("Demo fixtures ready (local only):");
  console.log(`  Scenario A protected: /app/tenancies/${TENANCY_PROTECTED}`);
  console.log(`  Scenario B closed:    /app/tenancies/${TENANCY_CLOSED}`);
  console.log(`  Scenario C disputed:  /app/tenancies/${TENANCY_DISPUTED}`);
  console.log("Reset with: npm run db:reset");
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exitCode = 1;
});
