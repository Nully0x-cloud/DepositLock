import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Notification } from "@/types/database";
import { mapRepositoryError, type RepositoryResult } from "./errors";
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
  options: { unreadOnly?: boolean; limit?: number } = {},
): Promise<RepositoryResult<NotificationRecord[]>> {
  let query = client
    .from("notifications")
    .select("*")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(options.limit ?? 12, 1), 100));

  if (options.unreadOnly) query = query.is("read_at", null);

  const result = await fromResult<Notification[]>(query);
  if (!result.ok) return result;
  return { ok: true, data: result.data.map(toNotificationRecord) };
}

export async function getUnreadNotificationCount(
  client: Client,
  profileId: string,
): Promise<RepositoryResult<number>> {
  const { count, error } = await client
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .is("read_at", null);
  if (error) return { ok: false, error: mapRepositoryError(error) };
  return { ok: true, data: count ?? 0 };
}

/** Marks your own notification as read. */
export async function markNotificationRead(
  client: Client,
  id: string,
  readAt: string = new Date().toISOString(),
): Promise<RepositoryResult<NotificationRecord>> {
  const result = await fromResult<Notification[]>(
    client.from("notifications").update({ read_at: readAt }).eq("id", id).is("read_at", null).select("*"),
    { emptyAsMissing: true },
  );
  if (!result.ok) return result;
  return { ok: true, data: toNotificationRecord(result.data[0]) };
}

/** Marks the caller's current unread inbox as read; RLS still scopes the write. */
export async function markAllNotificationsRead(
  client: Client,
  profileId: string,
  readAt: string = new Date().toISOString(),
): Promise<RepositoryResult<number>> {
  const result = await fromResult<Notification[]>(
    client
      .from("notifications")
      .update({ read_at: readAt })
      .eq("profile_id", profileId)
      .is("read_at", null)
      .select("id"),
  );
  if (!result.ok) return result;
  return { ok: true, data: result.data.length };
}
