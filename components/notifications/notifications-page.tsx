"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { ConfigPageHeader, EmptyState, ErrorState, Icon, SearchInput, SkeletonRows } from "@/components/dashboard/screen-kit";
import { PRIORITIES, PRIORITY_LABEL, PriorityBadge, UnreadDot } from "@/components/notifications/notification-parts";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/browser";
import { listNotifications, type ListNotificationsParams, type NotificationPriority } from "@/lib/api/notifications";
import { formatDateTime, formatRelative } from "@/lib/format";
import { useSearchState, useUrlState } from "@/lib/hooks/use-url-state";
import { CACHE } from "@/lib/query/cache";
import { queryKeys } from "@/lib/query/keys";
import { useMarkAllNotificationsRead, useUnreadNotificationCount } from "@/lib/query/notifications";

const PAGE_SIZE = 20;

export function NotificationsPage() {
  const url = useUrlState();
  const search = useSearchState(url, "q");
  const toast = useToast();
  const unread = useUnreadNotificationCount();
  const markAll = useMarkAllNotificationsRead();

  const read = ["unread", "read"].includes(url.get("read")) ? url.get("read") : "";
  const priority = (PRIORITIES.includes(url.get("priority") as NotificationPriority) ? url.get("priority") : "") as NotificationPriority | "";

  const filters = useMemo<ListNotificationsParams>(
    () => ({
      page: url.page,
      page_size: PAGE_SIZE,
      isRead: read === "unread" ? false : read === "read" ? true : undefined,
      priority: priority || undefined,
      searchTerm: search.committed || undefined,
    }),
    [priority, read, search.committed, url.page],
  );

  const list = useQuery({
    queryKey: queryKeys.notifications.list(filters),
    queryFn: ({ signal }) => listNotifications(filters, signal),
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: true,
    ...CACHE.live,
  });

  useEffect(() => {
    const totalPages = list.data?.pagination.total_pages ?? 1;
    if (list.data && url.page > Math.max(1, totalPages)) url.set({ page: 1 });
  }, [list.data, url]);

  const items = list.data?.items ?? [];
  const unreadCount = unread.data ?? 0;
  const isFiltered = Boolean(search.text || read || priority);
  const clear = () => {
    search.setText("");
    url.set({ q: "", read: "", priority: "", page: 1 });
  };
  const markAllRead = () =>
    markAll.mutate(undefined, {
      onSuccess: () => toast.success("All notifications marked as read."),
      onError: (error) => toast.error(error instanceof ApiError ? error.message : "Couldn't mark notifications as read."),
    });

  return (
    <div className="space-y-5">
      <ConfigPageHeader
        icon="bell"
        showBackLink={false}
        title="Notifications"
        description={unreadCount > 0 ? `You have ${unreadCount} unread ${unreadCount === 1 ? "notification" : "notifications"}.` : "You're all caught up."}
        actions={
          <Button variant="secondary" onClick={markAllRead} loading={markAll.isPending} disabled={unreadCount === 0}>
            <Icon name="checkAll" className="size-4" />
            Mark all as read
          </Button>
        }
      />

      <section className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-card">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_11rem_11rem_auto]">
          <SearchInput value={search.text} onChange={search.setText} placeholder="Search notifications" label="Search notifications" />
          <Select label="Status" hideLabel value={read} onChange={(event) => url.set({ read: event.target.value, page: 1 })}>
            <option value="">All notifications</option>
            <option value="unread">Unread</option>
            <option value="read">Read</option>
          </Select>
          <Select label="Priority" hideLabel value={priority} onChange={(event) => url.set({ priority: event.target.value, page: 1 })}>
            <option value="">All priorities</option>
            {PRIORITIES.map((item) => <option key={item} value={item}>{PRIORITY_LABEL[item]}</option>)}
          </Select>
          <Button variant="secondary" onClick={clear} disabled={!isFiltered}>Clear</Button>
        </div>
        <p className="text-xs text-muted">New notifications appear here as they arrive.</p>
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        {list.isLoading ? (
          <SkeletonRows rows={6} columns={3} />
        ) : list.isError ? (
          <ErrorState message={list.error.message} onRetry={() => list.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            icon="bell"
            title={isFiltered ? "No notifications match" : "No notifications yet"}
            action={isFiltered ? <Button variant="secondary" onClick={clear}>Reset filters</Button> : undefined}
          >
            {isFiltered ? "Try another search or remove a filter." : "Account activity, wallet updates and alerts will show up here."}
          </EmptyState>
        ) : (
          <>
            <ul className="divide-y divide-border">
              {items.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/notifications/${item.id}`}
                    className={`flex items-start gap-3 px-4 py-4 transition hover:bg-subtle/50 sm:gap-4 sm:px-6 ${item.is_read ? "" : "bg-brand-soft/25"}`}
                  >
                    <span className="mt-2 flex size-2 shrink-0">{!item.is_read && <UnreadDot />}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                        <p className={`text-sm ${item.is_read ? "font-medium" : "font-semibold"}`}>
                          {item.title}
                          {!item.is_read && <span className="sr-only"> (unread)</span>}
                        </p>
                        <time dateTime={item.created_at} title={formatDateTime(item.created_at)} className="shrink-0 text-xs text-muted">
                          {formatRelative(item.created_at)}
                        </time>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-muted">{item.description}</p>
                      <div className="mt-2"><PriorityBadge priority={item.priority} /></div>
                    </div>
                    <Icon name="chevronRight" className="mt-1 hidden size-4 shrink-0 text-muted sm:block" />
                  </Link>
                </li>
              ))}
            </ul>
            <Pagination pagination={list.data?.pagination} onPage={(page) => url.set({ page })} noun="notifications" />
          </>
        )}
      </section>
    </div>
  );
}
