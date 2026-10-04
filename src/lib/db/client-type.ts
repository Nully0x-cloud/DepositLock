import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * The client type every repository accepts.
 *
 * A single alias keeps the nine repository modules structurally identical, so
 * a browser client, a server client or a test fake can all be passed in.
 */
export type DbClient = SupabaseClient<Database>;
