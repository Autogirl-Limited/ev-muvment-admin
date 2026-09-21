"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getUnreadNotificationCount, markAllNotificationsRead, markNotificationRead } from "@/lib/api/notifications";
import { CACHE } from "./cache";
import { queryKeys } from "./keys";

/** Unread total for the header badge. The realtime socket bumps it; this is the source of truth on load and focus. */
export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: queryKeys.notifications.unreadCount,
    queryFn: ({ signal }) => getUnreadNotificationCount(signal),
    select: (data) => data.unread_count,
    refetchOnWindowFocus: true,
    ...CACHE.live,
  });
}

/** Marking read changes the badge, every list and the detail view, so refetch the whole family. */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all }),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all }),
  });
}
