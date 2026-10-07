import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Server-only client using the service-role key.
 *
 * The key lives in `.env.local` as `SUPABASE_SERVICE_ROLE_KEY` (never a
 * `NEXT_PUBLIC_*` name, never logged, never committed) and bypasses RLS —
 * so this module may only be imported by server-only request workflows after
 * caller authentication and tenancy authorization. It never belongs in a
 * Client Component. Returns `null` when the key is not configured.
 */
export function createSupabaseServiceClient(): SupabaseClient<Database> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) return null;

  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
