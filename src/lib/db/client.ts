import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type SupabaseConfig = {
  url: string;
  anonKey: string;
};

/**
 * Reads the public Supabase configuration.
 *
 * Phase 3A is local-only: these values come from `supabase status` and live in
 * `.env.local` (gitignored). Nothing here is a secret — the anon key is a
 * published, RLS-constrained key. Server/service keys are deliberately absent.
 */
export function readSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) return null;
  return { url, anonKey };
}

/** True when a Supabase project (local or hosted) has been configured. */
export function isSupabaseConfigured(): boolean {
  return readSupabaseConfig() !== null;
}

const LOCAL_HOSTNAMES = new Set(["127.0.0.1", "localhost", "::1"]);

/**
 * True when the configured URL points at the local Supabase stack.
 * Used to keep development-only conveniences off any hosted project.
 */
export function isLocalSupabaseUrl(url: string): boolean {
  try {
    // `URL` reports IPv6 hosts bracketed (`[::1]`), so strip the brackets
    // before matching against the loopback set.
    const hostname = new URL(url).hostname.replace(/^\[|\]$/g, "");
    return LOCAL_HOSTNAMES.has(hostname);
  } catch {
    return false;
  }
}

const CLIENT_OPTIONS = {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
} as const;

let browserClient: SupabaseClient<Database> | null = null;

/**
 * Browser client. Uses the anon key only, so every query is subject to RLS.
 * Returns `null` until Supabase is configured, which lets the whole
 * application keep working on the local fallbacks from Phase 2.
 */
export function getSupabaseBrowserClient(): SupabaseClient<Database> | null {
  const config = readSupabaseConfig();
  if (!config) return null;

  if (!browserClient) {
    browserClient = createClient<Database>(config.url, config.anonKey, CLIENT_OPTIONS);
  }
  return browserClient;
}

/**
 * Server-side client (Server Components, route handlers).
 * Still the anon key — RLS applies exactly as it does in the browser.
 */
export function createSupabaseServerClient(): SupabaseClient<Database> | null {
  const config = readSupabaseConfig();
  if (!config) return null;

  return createClient<Database>(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
