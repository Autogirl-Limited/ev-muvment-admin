import { apiFetch } from "@/lib/api/browser";
import { toQuery } from "@/lib/api/configuration";
import type { Paginated } from "@/lib/api/staff";

export type NotificationPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

/** Named `AppNotification` so it never shadows the DOM `Notification` global. */
export interface AppNotification {
  id: string;
  created_at: string;
  updated_at: string;
  title: string;
  description: string;
  priority: NotificationPriority;
  web_url: string | null;
  mobile_app_url: string | null;
  is_read: boolean;
}

export interface ListNotificationsParams {
  page: number;
  page_size: number;
  isRead?: boolean;
  priority?: NotificationPriority;
  searchTerm?: string;
}

export function listNotifications(params: ListNotificationsParams, signal?: AbortSignal) {
  return apiFetch<Paginated<AppNotification>>(`/notifications${toQuery({ ...params })}`, { signal });
}

export function getUnreadNotificationCount(signal?: AbortSignal) {
  return apiFetch<{ unread_count: number }>("/notifications/unread-count", { signal });
}

export function getNotification(id: string, signal?: AbortSignal) {
  return apiFetch<AppNotification>(`/notifications/${id}`, { signal });
}

export function markNotificationRead(id: string) {
  return apiFetch<AppNotification>(`/notifications/${id}/read`, { method: "PATCH" });
}

export function markAllNotificationsRead() {
  return apiFetch<unknown>("/notifications/read-all", { method: "POST" });
}
