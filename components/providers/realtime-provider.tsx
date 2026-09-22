"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";

import type { ChecklistResponse } from "@/lib/api/daily-checklists";
import type { AppNotification } from "@/lib/api/notifications";
import type { DvaTransaction } from "@/lib/api/staff";
import type { WalletAllocation } from "@/lib/api/wallet";
import { queryKeys } from "@/lib/query/keys";
import { useToast } from "@/components/ui/toast";

interface TokenResponse {
  url: string;
}

function naira(value: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(value);
}

async function realtimeUrl(signal?: AbortSignal) {
  const response = await fetch("/api/realtime-token", { cache: "no-store", signal });
  if (!response.ok) throw new Error("Realtime unavailable");
  return ((await response.json()) as TokenResponse).url;
}

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const seenDvaIds = useRef(new Set<string>());
  const seenChecklistUpdates = useRef(new Set<string>());
  const seenNotificationIds = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;
    let socket: WebSocket | null = null;
    let retryMs = 1000;
    let retryTimer: number | null = null;
    const abort = new AbortController();

    const scheduleReconnect = () => {
      if (cancelled) return;
      retryTimer = window.setTimeout(connect, retryMs);
      retryMs = Math.min(retryMs * 2, 30_000);
    };

    const onEvent = (event: string, data: unknown) => {
      switch (event) {
        case "dva_transaction.created": {
          const tx = data as DvaTransaction;
          queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
          queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
          if (!seenDvaIds.current.has(tx.id)) {
            seenDvaIds.current.add(tx.id);
            toast.info(`${naira(tx.amount)} received${tx.payer_name ? ` from ${tx.payer_name}` : ""}.`);
          }
          queryClient.invalidateQueries({ queryKey: queryKeys.dvaTransactions.all });
          break;
        }
        case "daily_checklist.updated": {
          const checklist = data as ChecklistResponse;
          const key = `${checklist.id}:${checklist.analysis?.status ?? checklist.status}:${checklist.submitted_at ?? ""}`;
          if (!seenChecklistUpdates.current.has(key)) {
            seenChecklistUpdates.current.add(key);
            const driver = `${checklist.driver.first_name} ${checklist.driver.last_name}`.trim() || checklist.driver.username;
            toast.info(`${driver}'s ${checklist.phase === "PICK_UP" ? "pick-up" : "drop-off"} checklist updated.`);
          }
          queryClient.setQueryData(queryKeys.dailyChecklists.detail(checklist.id), checklist);
          queryClient.invalidateQueries({ queryKey: queryKeys.dailyChecklists.all });
          // A submitted checklist flips the driver's shift status.
          queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
          break;
        }
        case "checklist_settings.updated":
          queryClient.invalidateQueries({ queryKey: queryKeys.checklistSettings });
          break;
        case "energy_rate.updated":
          queryClient.invalidateQueries({ queryKey: queryKeys.energyRate.all });
          break;
        case "vehicle.assigned":
        case "vehicle.unassigned":
        case "vehicle.updated":
          queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
          queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
          queryClient.invalidateQueries({ queryKey: queryKeys.me });
          break;
        case "wallet_allocation.created":
        case "wallet_allocation.updated": {
          const allocation = data as WalletAllocation;
          if (allocation?.id) queryClient.setQueryData(queryKeys.walletAllocations.detail(allocation.id), allocation);
          queryClient.invalidateQueries({ queryKey: queryKeys.walletAllocations.all });
          queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
          queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
          toast.info(
            allocation?.status === "AWAITING_ALLOCATION"
              ? `${naira(allocation.amount)} was paid but isn't allocated on LotGrids yet. Retry it from EV Wallet if it stays that way.`
              : "Wallet allocation updated.",
          );
          break;
        }
        case "notification.created": {
          const notification = data as AppNotification;
          if (!notification?.id || seenNotificationIds.current.has(notification.id)) break;
          seenNotificationIds.current.add(notification.id);
          // Bump the badge straight away; the invalidation below reconciles it with the server.
          if (!notification.is_read) {
            queryClient.setQueryData<{ unread_count: number }>(queryKeys.notifications.unreadCount, (current) =>
              current ? { unread_count: current.unread_count + 1 } : current,
            );
          }
          queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
          toast.info(notification.title);
          break;
        }
        default:
          break;
      }
    };

    async function connect() {
      try {
        const url = await realtimeUrl(abort.signal);
        if (cancelled) return;
        socket = new WebSocket(url);
        socket.onopen = () => {
          retryMs = 1000;
          queryClient.invalidateQueries({ queryKey: queryKeys.dvaTransactions.all });
          queryClient.invalidateQueries({ queryKey: queryKeys.dailyChecklists.all });
          queryClient.invalidateQueries({ queryKey: queryKeys.walletAllocations.all });
          // The socket buffers nothing while it is down, so re-sync anything missed.
          queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
        };
        socket.onmessage = (message) => {
          try {
            const payload = JSON.parse(message.data) as { event?: string; data?: unknown };
            if (payload.event) onEvent(payload.event, payload.data);
          } catch {}
        };
        socket.onclose = (event) => {
          socket = null;
          if (cancelled) return;
          if (event.code === 4401) {
            retryMs = 1000;
            queryClient.invalidateQueries({ queryKey: queryKeys.me });
          }
          scheduleReconnect();
        };
        socket.onerror = () => socket?.close();
      } catch {
        scheduleReconnect();
      }
    }

    connect();
    return () => {
      cancelled = true;
      abort.abort();
      if (retryTimer) window.clearTimeout(retryTimer);
      socket?.close(1000);
    };
  }, [queryClient, toast]);

  return <>{children}</>;
}
