"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { AccessDenied } from "@/components/dashboard/access-denied";
import { ConfigPageHeader, EmptyState, ErrorState, Icon } from "@/components/dashboard/screen-kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listPendingDropOffs, type DropOffStatus, type PendingDropOff } from "@/lib/api/drop-off-monitor";
import { fullName } from "@/lib/format";
import { queryKeys } from "@/lib/query/keys";
import { useCurrentUser } from "@/lib/query/user";

const STATUS_TONE: Record<DropOffStatus, "danger" | "brand" | "neutral"> = {
  OVERDUE: "danger",
  DUE_SOON: "brand",
  UPCOMING: "neutral",
};

function timeLabel(item: PendingDropOff, nowOffsetSeconds: number) {
  // Render a live countdown between polls by subtracting elapsed seconds from the last known minutes_to_due.
  const minutes = item.minutes_to_due - Math.floor(nowOffsetSeconds / 60);
  if (minutes <= 0) return `Overdue by ${Math.abs(minutes)} min`;
  if (minutes <= 60) return `Due in ${minutes} min`;
  return new Intl.DateTimeFormat("en-NG", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" }).format(new Date(item.due_at));
}

function statusFor(item: PendingDropOff, nowOffsetSeconds: number): DropOffStatus {
  const minutes = item.minutes_to_due - Math.floor(nowOffsetSeconds / 60);
  if (minutes <= 0) return "OVERDUE";
  if (minutes <= 60) return "DUE_SOON";
  return "UPCOMING";
}

export function DropOffMonitorPage() {
  const user = useCurrentUser();
  const isStaff = user.user_type === "ADMIN" || user.user_type === "ACCOUNT_OFFICER" || user.user_type === "RELATIONSHIP_OFFICER";

  const monitor = useQuery({
    queryKey: queryKeys.dropOffMonitor,
    queryFn: ({ signal }) => listPendingDropOffs(signal),
    enabled: isStaff,
    // No push event for this list itself (only the resulting notifications are real-time) — poll while open.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  // Recompute the elapsed-since-last-fetch offset every 15s, so the countdown ticks down between polls.
  const [nowOffsetSeconds, setNowOffsetSeconds] = useState(0);
  useEffect(() => {
    const fetchedAt = monitor.dataUpdatedAt;
    const recompute = () => setNowOffsetSeconds(fetchedAt ? Math.max(0, Math.round((Date.now() - fetchedAt) / 1000)) : 0);
    recompute();
    const timer = window.setInterval(recompute, 15_000);
    return () => window.clearInterval(timer);
  }, [monitor.dataUpdatedAt]);

  if (!isStaff) return <AccessDenied />;

  const items = monitor.data ?? [];
  const sorted = [...items].sort((a, b) => a.minutes_to_due - b.minutes_to_due);
  const overdueCount = sorted.filter((item) => statusFor(item, nowOffsetSeconds) === "OVERDUE").length;
  const dueSoonCount = sorted.filter((item) => statusFor(item, nowOffsetSeconds) === "DUE_SOON").length;

  return (
    <div>
      <ConfigPageHeader
        icon="car"
        title="Drop-off monitor"
        description="Every vehicle that hasn't been dropped off yet today, most urgent first. Refreshes automatically; there's up to a ~5-minute delay before an alert fires once a vehicle crosses a threshold."
        showBackLink={false}
        actions={<Button variant="secondary" onClick={() => monitor.refetch()} loading={monitor.isRefetching}>Refresh</Button>}
      />

      {items.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-3">
          {overdueCount > 0 && <Badge tone="danger" dot>{overdueCount} overdue</Badge>}
          {dueSoonCount > 0 && <Badge tone="brand" dot>{dueSoonCount} due soon</Badge>}
          <Badge tone="neutral">{items.length} pending in total</Badge>
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        {monitor.isLoading ? (
          <div role="status" aria-label="Loading" className="animate-pulse divide-y divide-border">
            {Array.from({ length: 5 }).map((_, row) => <div key={row} className="h-20 bg-subtle/40" />)}
          </div>
        ) : monitor.isError ? (
          <ErrorState message={monitor.error.message} onRetry={() => monitor.refetch()} />
        ) : sorted.length === 0 ? (
          <EmptyState icon="check" title="All vehicles dropped off">Nothing is pending drop-off right now.</EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {sorted.map((item) => {
              const status = statusFor(item, nowOffsetSeconds);
              return (
                <li key={item.vehicle.id} className={`flex flex-col gap-3 px-4 py-4 sm:px-6 md:flex-row md:items-center md:justify-between ${status === "OVERDUE" ? "bg-danger-soft/30" : ""}`}>
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{item.vehicle.name}</p>
                      <span className="font-mono text-xs text-muted">{item.vehicle.plate_number}</span>
                      <Badge tone={STATUS_TONE[status]} dot>{timeLabel(item, nowOffsetSeconds)}</Badge>
                      {item.checklist_status === "IN_PROGRESS" ? (
                        <Badge tone="brand">In progress</Badge>
                      ) : (
                        <Badge tone="neutral">Not started</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted">
                      {item.vehicle.location_state}
                      {item.vehicle.state ? ` · ${item.vehicle.state.name}` : ""} · {item.vehicle.vehicle_make.name} {item.vehicle.vehicle_model.name}
                    </p>
                    <p className="text-sm">{fullName(item.driver)} · @{item.driver.username}</p>
                  </div>
                  {item.driver.phone_number && (
                    <a
                      href={`tel:${item.driver.phone_number}`}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:bg-subtle"
                    >
                      <Icon name="phone" className="size-4" />
                      Call {item.driver.first_name}
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
