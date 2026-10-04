import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActivityEvent, Database, Json } from "@/types/database";
import type { RepositoryResult } from "./errors";
import { fromResult } from "./from-result";
import type { ActivityEventRecord } from "./models";

type Client = SupabaseClient<Database>;

export function toActivityEventRecord(row: ActivityEvent): ActivityEventRecord {
  return {
    id: row.id,
    tenancyId: row.tenancy_id,
    actorProfileId: row.actor_profile_id,
    eventType: row.event_type,
    title: row.title,
    description: row.description,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    blockchainReference: row.blockchain_reference,
    createdAt: row.created_at,
  };
}

/** The tenancy timeline, oldest first. Append-only: no update/delete helpers. */
export async function listActivityByTenancy(
  client: Client,
  tenancyId: string,
): Promise<RepositoryResult<ActivityEventRecord[]>> {
  const result = await fromResult<ActivityEvent[]>(
    client
      .from("activity_events")
      .select("*")
      .eq("tenancy_id", tenancyId)
      .order("created_at"),
  );
  if (!result.ok) return result;
  return { ok: true, data: result.data.map(toActivityEventRecord) };
}

export type AppendActivityInput = {
  tenancyId: string;
  actorProfileId?: string | null;
  eventType: string;
  title: string;
  description?: string | null;
  metadata?: Record<string, unknown>;
  blockchainReference?: string | null;
};

export async function appendActivity(
  client: Client,
  input: AppendActivityInput,
): Promise<RepositoryResult<ActivityEventRecord>> {
  const result = await fromResult<ActivityEvent[]>(
    client
      .from("activity_events")
      .insert({
        tenancy_id: input.tenancyId,
        actor_profile_id: input.actorProfileId ?? null,
        event_type: input.eventType,
        title: input.title.trim(),
        description: input.description ?? null,
        metadata: (input.metadata ?? {}) as NonNullable<Json>,
        blockchain_reference: input.blockchainReference ?? null,
      })
      .select("*"),
  );
  if (!result.ok) return result;
  const row = result.data[0];
  if (!row) return { ok: false, error: { code: "unknown", message: "The event was not recorded." } };
  return { ok: true, data: toActivityEventRecord(row) };
}
