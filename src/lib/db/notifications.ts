import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Notification } from "@/types/database";
import type { RepositoryResult } from "./errors";
import { fromResult } from "./from-result";
import type { NotificationRecord } from "./models";

type Client = SupabaseClient<Database>;

export function toNotificationRecord(row: Notification): NotificationRecord {
  return {
    id: row.id,
    profileId: row.profile_id,
    tenancyId: row.tenancy_id,
    type: row.type,
    title: row.title,
    body: row.body,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

/**
 * Notifications addressed to a profile. RLS already scopes rows to
 * `auth.uid()`, so the profile argument is a convenience filter, not the
 * security boundary.
 */
export async function listNotificationsForProfile(
  client: Client,
  profileId: string,
  options: { unreadOnly?: boolean } = {},
): Promise<RepositoryResult<NotificationRecord[]>> {
  let query = client
    .from("notifications")
    .select("*")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });

  if (options.unreadOnly) query = query.is("read_at", null);

  const result = await fromResult<Notification[]>(query);
  if (!result.ok) return result;
  return { ok: true, data: result.data.map(toNotificationRecord) };
}

/** Marks your own notification as read. */
export async function markNotificationRead(
  client: Client,
  id: string,
  readAt: string = new Date().toISOString(),
): Promise<RepositoryResult<NotificationRecord>> {
  const result = await fromResult<Notification[]>(
    client.from("notifications").update({ read_at: readAt }).eq("id", id).select("*"),
    { emptyAsMissing: true },
  );
  if (!result.ok) return result;
  return { ok: true, data: toNotificationRecord(result.data[0]) };
}
