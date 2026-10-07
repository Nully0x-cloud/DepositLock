"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getSupabaseBrowserClient,
  getUnreadNotificationCount,
  isRepositoryError,
  listNotificationsForProfile,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/db";
import type { NotificationRecord } from "@/lib/db/models";
import { useRequireAuth } from "@/hooks/use-require-auth";

export type NotificationsResult =
  | { status: "loading"; retry(): void }
  | { status: "unauthenticated"; retry(): void }
  | { status: "error"; message: string; retry(): void }
  | {
      status: "ready";
      notifications: NotificationRecord[];
      unreadCount: number;
      refresh(): void;
      markRead(id: string): Promise<void>;
      markAllRead(): Promise<void>;
    };

type LoadedNotifications = {
  key: string | null;
  notifications: NotificationRecord[];
  unreadCount: number;
  error: string | null;
};

const FRIENDLY_ERROR = "Notifications are temporarily unavailable. Try again.";

function errorMessage(cause: unknown): string {
  if (isRepositoryError(cause)) {
    if (cause.code === "permission_denied") return "You do not have access to these notifications.";
    return FRIENDLY_ERROR;
  }
  return FRIENDLY_ERROR;
}

export function useNotifications(pathname: string): NotificationsResult {
  const auth = useRequireAuth();
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<LoadedNotifications>({
    key: null,
    notifications: [],
    unreadCount: 0,
    error: null,
  });

  const retry = useCallback(() => setVersion((value) => value + 1), []);

  useEffect(() => {
    if (!auth.configured || !auth.ready || !auth.authenticated || !auth.userId) return;
    const key = `${auth.userId}:${version}`;
    let cancelled = false;
    void (async () => {
      try {
        const client = getSupabaseBrowserClient();
        if (!client) throw new Error(FRIENDLY_ERROR);
        const [recent, unread] = await Promise.all([
          listNotificationsForProfile(client, auth.userId!, { limit: 12 }),
          getUnreadNotificationCount(client, auth.userId!),
        ]);
        if (!recent.ok) throw recent.error;
        if (!unread.ok) throw unread.error;
        if (!cancelled) {
          setState({ key, notifications: recent.data, unreadCount: unread.data, error: null });
        }
      } catch (cause) {
        if (!cancelled) setState({ key, notifications: [], unreadCount: 0, error: errorMessage(cause) });
      }
    })();
    return () => { cancelled = true; };
  }, [auth.authenticated, auth.configured, auth.ready, auth.userId, pathname, version]);

  const currentKey = auth.configured && auth.ready && auth.authenticated && auth.userId
    ? `${auth.userId}:${version}`
    : null;

  const markRead = useCallback(async (id: string) => {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    const result = await markNotificationRead(client, id);
    if (!result.ok && result.error.code !== "not_found") {
      setState((current) => ({ ...current, error: FRIENDLY_ERROR }));
    }
    retry();
  }, [retry]);

  const markAllRead = useCallback(async () => {
    if (!auth.userId) return;
    const client = getSupabaseBrowserClient();
    if (!client) return;
    const result = await markAllNotificationsRead(client, auth.userId);
    if (!result.ok) {
      setState((current) => ({ ...current, error: FRIENDLY_ERROR }));
      return;
    }
    retry();
  }, [auth.userId, retry]);

  const refresh = useMemo(() => retry, [retry]);
  if (!auth.configured) return { status: "error", message: "Notifications are unavailable until Supabase is configured.", retry };
  if (!auth.ready) return { status: "loading", retry };
  if (!auth.authenticated) return { status: "unauthenticated", retry };
  if (state.key !== currentKey) return { status: "loading", retry };
  if (state.error) return { status: "error", message: state.error, retry };
  return {
    status: "ready",
    notifications: state.notifications,
    unreadCount: state.unreadCount,
    refresh,
    markRead,
    markAllRead,
  };
}
