"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Icon } from "@/components/dashboard/screen-kit";
import { PriorityBadge, UnreadDot } from "@/components/notifications/notification-parts";
import { listNotifications } from "@/lib/api/notifications";
import { formatRelative } from "@/lib/format";
import { CACHE } from "@/lib/query/cache";
import { queryKeys } from "@/lib/query/keys";
import { useMarkAllNotificationsRead, useUnreadNotificationCount } from "@/lib/query/notifications";

const PREVIEW_SIZE = 6;
const PREVIEW_FILTERS = { page: 1, page_size: PREVIEW_SIZE };

/**
 * Header bell: unread badge plus a dropdown of the latest notifications. The
 * panel anchors to the (sticky) header rather than the button, so on phones it
 * can span the screen instead of overflowing off the left edge.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const unread = useUnreadNotificationCount();
  const markAll = useMarkAllNotificationsRead();
  const count = unread.data ?? 0;

  const recent = useQuery({
    queryKey: queryKeys.notifications.list(PREVIEW_FILTERS),
    queryFn: ({ signal }) => listNotifications(PREVIEW_FILTERS, signal),
    enabled: open,
    ...CACHE.live,
  });

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const items = recent.data?.items ?? [];

  return (
    <div ref={ref}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications"}
        onClick={() => setOpen((value) => !value)}
        className="relative flex size-10 items-center justify-center rounded-lg text-muted transition hover:bg-subtle hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand"
      >
        <Icon name="bell" />
        {count > 0 && (
          <span
            aria-hidden
            className="absolute right-1 top-1 flex min-w-4.5 items-center justify-center rounded-full bg-brand px-1 text-[0.65rem] font-semibold leading-4.5 text-brand-foreground ring-2 ring-background"
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute inset-x-3 top-full z-40 mt-2 animate-pop-in overflow-hidden rounded-xl border border-border bg-surface shadow-card sm:inset-x-auto sm:right-4 sm:w-96 lg:right-6">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Notifications</h2>
            <button
              type="button"
              disabled={count === 0 || markAll.isPending}
              onClick={() => markAll.mutate()}
              className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium text-brand transition hover:bg-brand-soft disabled:cursor-not-allowed disabled:text-muted disabled:hover:bg-transparent"
            >
              <Icon name="checkAll" className="size-4" />
              Mark all read
            </button>
          </div>

          <div className="max-h-[min(24rem,65dvh)] overflow-y-auto overscroll-contain">
            {recent.isLoading ? (
              <div role="status" aria-label="Loading" className="animate-pulse divide-y divide-border">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="space-y-2 px-4 py-3">
                    <div className="h-4 w-2/3 rounded bg-subtle" />
                    <div className="h-3 w-full rounded bg-subtle" />
                  </div>
                ))}
              </div>
            ) : recent.isError ? (
              <p className="px-4 py-8 text-center text-sm text-muted">
                Couldn&apos;t load notifications.{" "}
                <button type="button" onClick={() => recent.refetch()} className="font-medium text-brand hover:underline">
                  Try again
                </button>
              </p>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-10 text-center">
                <span aria-hidden className="flex size-10 items-center justify-center rounded-full bg-subtle text-muted">
                  <Icon name="bell" />
                </span>
                <p className="mt-3 text-sm font-medium">You&apos;re all caught up</p>
                <p className="mt-0.5 text-xs text-muted">New notifications will appear here.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {items.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/notifications/${item.id}`}
                      onClick={() => setOpen(false)}
                      className={`flex items-start gap-3 px-4 py-3 transition hover:bg-subtle/60 ${item.is_read ? "" : "bg-brand-soft/30"}`}
                    >
                      <span className="mt-1.5 flex size-2 shrink-0">{!item.is_read && <UnreadDot />}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-3">
                          <span className={`line-clamp-1 text-sm ${item.is_read ? "font-medium" : "font-semibold"}`}>{item.title}</span>
                          <time dateTime={item.created_at} className="shrink-0 text-xs text-muted">{formatRelative(item.created_at)}</time>
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-xs text-muted">{item.description}</span>
                        {(item.priority === "HIGH" || item.priority === "URGENT") && (
                          <span className="mt-1.5 inline-block"><PriorityBadge priority={item.priority} /></span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-border px-4 py-3 text-center text-sm font-medium text-brand transition hover:bg-subtle/60"
          >
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
