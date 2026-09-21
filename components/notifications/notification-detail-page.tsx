"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { ConfigPageHeader, EmptyState, ErrorState, Icon } from "@/components/dashboard/screen-kit";
import { PriorityBadge, linkTarget } from "@/components/notifications/notification-parts";
import { Badge } from "@/components/ui/badge";
import { ApiError } from "@/lib/api/browser";
import { getNotification } from "@/lib/api/notifications";
import { formatDateTime, formatRelative } from "@/lib/format";
import { CACHE } from "@/lib/query/cache";
import { queryKeys } from "@/lib/query/keys";
import { useMarkNotificationRead } from "@/lib/query/notifications";

export function NotificationDetailPage({ id }: { id: string }) {
  const detail = useQuery({
    queryKey: queryKeys.notifications.detail(id),
    queryFn: ({ signal }) => getNotification(id, signal),
    ...CACHE.live,
  });
  const { mutate: markRead } = useMarkNotificationRead();
  const notification = detail.data;
  const needsRead = notification ? !notification.is_read : false;

  // Opening a notification is what reads it. Refetching after this flips `is_read`, so it fires once.
  useEffect(() => {
    if (needsRead) markRead(id);
  }, [id, markRead, needsRead]);

  const link = linkTarget(notification?.web_url ?? null);

  return (
    <div className="mx-auto max-w-3xl">
      <ConfigPageHeader
        icon="bell"
        title="Notification"
        backHref="/notifications"
        backLabel="Notifications"
        description="Review the full message and any related links."
      />

      {detail.isLoading ? (
        <div className="h-56 animate-pulse rounded-2xl border border-border bg-subtle/40" />
      ) : detail.isError ? (
        <section className="rounded-2xl border border-border bg-surface shadow-card">
          {detail.error instanceof ApiError && detail.error.status === 404 ? (
            <EmptyState
              icon="bell"
              title="Notification not found"
              action={<Link href="/notifications" className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium transition hover:bg-subtle">Back to notifications</Link>}
            >
              It may have been removed, or it belongs to another account.
            </EmptyState>
          ) : (
            <ErrorState message={detail.error.message} onRetry={() => detail.refetch()} />
          )}
        </section>
      ) : notification ? (
        <article className="space-y-5 rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <PriorityBadge priority={notification.priority} />
            <Badge tone={notification.is_read ? "neutral" : "brand"} dot={!notification.is_read}>
              {notification.is_read ? "Read" : "New"}
            </Badge>
          </div>

          <div>
            <h2 className="text-xl font-semibold tracking-tight">{notification.title}</h2>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
              <Icon name="clock" className="size-4" />
              <time dateTime={notification.created_at}>{formatDateTime(notification.created_at)}</time>
              <span aria-hidden>·</span>
              <span>{formatRelative(notification.created_at)}</span>
            </p>
          </div>

          <p className="whitespace-pre-line break-words text-sm leading-relaxed">{notification.description}</p>

          {link && (
            <div className="border-t border-border pt-4">
              {link.external ? (
                <a
                  href={link.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-medium text-brand-foreground transition hover:brightness-110"
                >
                  Open related page
                  <Icon name="external" className="size-4" />
                </a>
              ) : (
                <Link
                  href={link.href}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-medium text-brand-foreground transition hover:brightness-110"
                >
                  Open related page
                  <Icon name="arrowRight" className="size-4" />
                </Link>
              )}
            </div>
          )}
        </article>
      ) : null}
    </div>
  );
}
