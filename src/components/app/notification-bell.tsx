"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, Check, RefreshCw } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useNotifications } from "@/hooks/use-notifications";
import { notificationHref, notificationTimeLabel, notificationTitle } from "@/lib/notifications/presentation";
import { cn } from "@/lib/utils";

export function NotificationBell() {
  const pathname = usePathname();
  const result = useNotifications(pathname);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = "app-notification-panel";

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  if (result.status === "unauthenticated") return null;
  const unreadCount = result.status === "ready" ? result.unreadCount : 0;

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="relative grid size-11 shrink-0 place-items-center rounded-full border border-line bg-parchment text-ink transition-colors hover:bg-sand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
      >
        <Bell aria-hidden className="size-[18px]" strokeWidth={1.8} />
        {unreadCount > 0 ? (
          <span aria-hidden className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-forest px-1 text-[0.625rem] font-semibold leading-none text-cream ring-2 ring-cream">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
        <span className="sr-only" aria-live="polite">{unreadCount} unread notifications</span>
      </button>

      {open ? (
        <section
          id={panelId}
          aria-label="Recent notifications"
          className="absolute right-0 top-[calc(100%+0.65rem)] z-[60] w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-line bg-parchment shadow-[0_18px_55px_-24px_rgba(30,33,31,0.4)]"
        >
          <header className="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-3.5">
            <div>
              <h2 className="text-sm font-semibold text-ink">Notifications</h2>
              <p className="mt-0.5 text-xs text-muted" aria-live="polite">
                {unreadCount === 0 ? "All caught up" : `${unreadCount} unread`}
              </p>
            </div>
            {result.status === "ready" ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={result.refresh}
                  aria-label="Refresh notifications"
                  className="grid size-10 place-items-center rounded-lg text-muted hover:bg-cream-raised hover:text-forest focus-visible:outline-2 focus-visible:outline-forest"
                >
                  <RefreshCw aria-hidden className="size-4" />
                </button>
                {unreadCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => void result.markAllRead()}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-forest hover:bg-cream-raised focus-visible:outline-2 focus-visible:outline-forest"
                  >
                    <Check aria-hidden className="size-3.5" /> Mark all read
                  </button>
                ) : null}
              </div>
            ) : null}
          </header>

          {result.status === "loading" ? (
            <div aria-busy="true" className="space-y-3 p-4">
              {[0, 1, 2].map((item) => <div key={item} className="h-14 animate-pulse rounded-xl bg-cream-raised" />)}
              <p className="sr-only">Loading notifications…</p>
            </div>
          ) : result.status === "error" ? (
            <div className="p-4">
              <p role="alert" className="text-sm leading-relaxed text-dispute">{result.message}</p>
              <button type="button" onClick={result.retry} className="mt-3 inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-forest focus-visible:outline-2 focus-visible:outline-forest">
                <RefreshCw aria-hidden className="size-4" /> Retry
              </button>
            </div>
          ) : result.status === "ready" && result.notifications.length > 0 ? (
            <ul className="max-h-[min(65vh,28rem)] divide-y divide-line-soft overflow-y-auto">
              {result.notifications.map((notification) => (
                <li key={notification.id}>
                  <Link
                    href={notificationHref(notification)}
                    onClick={() => {
                      if (!notification.readAt) void result.markRead(notification.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "block min-h-11 px-4 py-3.5 transition-colors hover:bg-cream-raised focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-forest",
                      notification.readAt ? "" : "bg-cream-raised/65",
                    )}
                  >
                    <span className="flex items-start gap-3">
                      <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", notification.readAt ? "bg-line" : "bg-forest")} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span className="text-sm font-semibold text-ink">{notificationTitle(notification)}</span>
                          <time dateTime={notification.createdAt} className="shrink-0 text-[0.6875rem] tabular-nums text-subtle">
                            {notificationTimeLabel(notification.createdAt)}
                          </time>
                        </span>
                        {notification.body ? <span className="mt-1 block text-xs leading-relaxed text-muted">{notification.body}</span> : null}
                        {!notification.readAt ? <span className="sr-only">Unread. </span> : null}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-5 py-8 text-center">
              <span aria-hidden className="mx-auto grid size-10 place-items-center rounded-full bg-cream-raised text-forest"><Bell className="size-4" /></span>
              <p className="mt-3 text-sm font-semibold text-ink">No notifications yet</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">Tenancy invitations, deposit updates and settlement activity will appear here.</p>
            </div>
          )}

          <footer className="border-t border-line-soft px-4 py-2.5">
            <Link href="/app/tenancies" onClick={() => setOpen(false)} className="inline-flex min-h-10 items-center text-xs font-semibold text-forest hover:underline focus-visible:outline-2 focus-visible:outline-forest">
              View my tenancies
            </Link>
          </footer>
        </section>
      ) : null}
    </div>
  );
}
