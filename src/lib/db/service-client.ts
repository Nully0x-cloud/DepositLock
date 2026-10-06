import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Server-only client using the service-role key.
 *
 * The key lives in `.env.local` as `SUPABASE_SERVICE_ROLE_KEY` (never a
 * `NEXT_PUBLIC_*` name, never logged, never committed) and bypasses RLS —
 * so this module may only be imported from route handlers, and only for the
 * deposit reconciliation RPCs that are themselves restricted to
 * `service_role` in SQL. Returns `null` when the key is not configured.
 */
export function createSupabaseServiceClient(): SupabaseClient<Database> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) return null;

  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
