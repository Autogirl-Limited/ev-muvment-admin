"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";

import { AccessDenied } from "@/components/dashboard/access-denied";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DriverLink } from "@/components/people/people-parts";
import { DateRangePicker, lagosToday } from "@/components/ui/date-range-picker";
import { Modal } from "@/components/ui/modal";
import {
  getChargeSession,
  getChargeSessionStats,
  listChargeSessions,
  netAmount,
  type ChargeSession,
  type ChargeSessionStatus,
} from "@/lib/api/charge-sessions";
import { listDrivers } from "@/lib/api/staff";
import { kwh } from "@/lib/format";
import { queryKeys } from "@/lib/query/keys";
import { useCurrentUser } from "@/lib/query/user";

const PAGE_SIZE = 20;
const LAGOS = "Africa/Lagos";
/** Admins don't receive `charge_session.updated`, so poll while a session is still waiting on its LotGrids outcome. */
const STARTED_POLL_MS = 30_000;

const STATUS_META: Record<ChargeSessionStatus, { label: string; tone: "brand" | "success" | "neutral" }> = {
  STARTED: { label: "Charging", tone: "brand" },
  COMPLETED: { label: "Completed", tone: "success" },
  INTERRUPTED: { label: "Stopped early", tone: "neutral" },
};

function StatusBadge({ status }: { status: ChargeSessionStatus }) {
  const meta = STATUS_META[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={meta.tone} dot>{meta.label}</Badge>;
}

function formatDuration(fromIso: string, toIso: string) {
  const minutes = Math.max(0, Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60_000));
  if (minutes < 1) return "Under a minute";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function estimatedKwh(value: number | null) {
  return value === null ? "-" : `≈ ${kwh(value)}`;
}

/** Debited amount, with the refund called out underneath when a session stopped early. */
function AmountCell({ session }: { session: ChargeSession }) {
  return (
    <>
      <span className="font-semibold tabular-nums">{naira(session.amount)}</span>
      {session.refund_amount ? (
        <span className="block text-xs text-success tabular-nums">−{naira(session.refund_amount)} refunded</span>
      ) : null}
    </>
  );
}

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: LAGOS,
  }).format(new Date(iso));
}

function naira(value: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);
}

function dash(value: string | number | null | undefined) {
  return value === null || value === undefined || value === "" ? "-" : value;
}

function shortId(id: string) {
  return `Driver ...${id.slice(-4)}`;
}

/** Prefer the driver embedded on the session (2026-09-22); fall back to the id-lookup map for older rows. */
function driverLabel(session: ChargeSession, fallback: Map<string, string>) {
  if (session.driver) return `${session.driver.first_name} ${session.driver.last_name}`.trim() || shortId(session.user_id);
  return fallback.get(session.user_id) ?? shortId(session.user_id);
}

function useDebounced(value: string, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [delay, value]);
  return debounced;
}

function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={label}
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1400);
      }}
      className="inline-flex size-8 items-center justify-center rounded-lg text-muted transition hover:bg-subtle hover:text-foreground"
    >
      <span className="sr-only">{label}</span>
      {copied ? (
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="m5 12 4 4L19 6" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-card">
      <p className="text-xs font-medium uppercase text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  );
}

function SessionSkeletonCards() {
  return (
    <div className="grid gap-3 p-3 md:hidden">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="animate-pulse rounded-lg border border-border bg-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="h-5 w-28 rounded bg-subtle" />
              <div className="h-3 w-36 rounded bg-subtle" />
            </div>
            <div className="h-8 w-24 rounded bg-subtle" />
          </div>
          <div className="mt-4 grid gap-2">
            <div className="h-12 rounded-lg bg-subtle" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SessionCard({ session, driver, onOpen }: { session: ChargeSession; driver: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-lg border border-border bg-surface p-4 text-left shadow-card transition active:scale-[0.99] hover:border-brand/50 hover:bg-subtle/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{driver}</p>
          <p className="mt-0.5 text-xs text-muted">{formatDateTime(session.created_at)}</p>
          <div className="mt-2"><StatusBadge status={session.status} /></div>
        </div>
        <div className="shrink-0 text-right text-lg">
          <AmountCell session={session} />
        </div>
      </div>
      <div className="mt-4 grid gap-2 text-sm">
        <div className="rounded-lg bg-subtle/70 p-3">
          <p className="text-xs text-muted">Energy</p>
          <p className="mt-1 font-semibold tabular-nums">{estimatedKwh(session.energy_kwh)}</p>
        </div>
        <div className="rounded-lg bg-subtle/70 p-3">
          <p className="text-xs text-muted">Charger</p>
          <p className="mt-1 truncate font-mono text-xs">{session.charger_id}</p>
          <p className="text-xs text-muted">Connector {session.connector_id}</p>
        </div>
      </div>
    </button>
  );
}

export function ChargeSessionsPage() {
  const user = useCurrentUser();
  const router = useRouter();
  const pathname = usePathname();
  const [page, setPage] = useState(() => {
    if (typeof window === "undefined") return 1;
    const value = Number(new URLSearchParams(window.location.search).get("page"));
    return Number.isFinite(value) && value > 0 ? value : 1;
  });
  const [driverSearch, setDriverSearch] = useState("");
  const debouncedDriverSearch = useDebounced(driverSearch);
  const [userId, setUserId] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("userId") ?? "";
  });
  const [dateFrom, setDateFrom] = useState(() => {
    if (typeof window === "undefined") return lagosToday();
    return new URLSearchParams(window.location.search).get("dateFrom") ?? lagosToday();
  });
  const [dateTo, setDateTo] = useState(() => {
    if (typeof window === "undefined") return lagosToday();
    return new URLSearchParams(window.location.search).get("dateTo") ?? lagosToday();
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [driverFinderOpen, setDriverFinderOpen] = useState(false);

  const isStaff = user.user_type === "ADMIN" || user.user_type === "ACCOUNT_OFFICER" || user.user_type === "RELATIONSHIP_OFFICER";
  const isAdmin = user.user_type === "ADMIN";

  const filters = useMemo(
    () => ({
      page,
      page_size: PAGE_SIZE,
      userId: userId || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }),
    [dateFrom, dateTo, page, userId],
  );

  const statsFilters = useMemo(
    () => ({ userId: userId || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined }),
    [dateFrom, dateTo, userId],
  );

  useEffect(() => {
    const params = new URLSearchParams();
    if (page > 1) params.set("page", String(page));
    if (userId) params.set("userId", userId);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    const next = params.toString() ? `${pathname}?${params}` : pathname;
    router.replace(next, { scroll: false });
  }, [dateFrom, dateTo, page, pathname, router, userId]);

  const sessions = useQuery({
    queryKey: queryKeys.chargeSessions.list(filters),
    queryFn: ({ signal }) => listChargeSessions(filters, signal),
    enabled: isStaff && (!dateFrom || !dateTo || dateFrom <= dateTo),
    refetchOnWindowFocus: true,
    refetchInterval: (query) =>
      query.state.data?.items.some((session) => session.status === "STARTED") ? STARTED_POLL_MS : false,
  });

  const stats = useQuery({
    queryKey: queryKeys.chargeSessions.stats(statsFilters),
    queryFn: ({ signal }) => getChargeSessionStats(statsFilters, signal),
    enabled: isStaff && (!dateFrom || !dateTo || dateFrom <= dateTo),
  });

  const drivers = useQuery({
    queryKey: queryKeys.users.drivers(debouncedDriverSearch),
    queryFn: ({ signal }) => listDrivers(debouncedDriverSearch, signal),
    enabled: isAdmin && driverFinderOpen,
    retry: false,
  });

  const detail = useQuery({
    queryKey: queryKeys.chargeSessions.detail(selectedId ?? ""),
    queryFn: ({ signal }) => getChargeSession(selectedId!, signal),
    enabled: Boolean(selectedId),
    refetchInterval: (query) => (query.state.data?.status === "STARTED" ? STARTED_POLL_MS : false),
  });

  if (!isStaff) return <AccessDenied />;

  const invalidRange = dateFrom && dateTo && dateFrom > dateTo;
  const driverNames = new Map(
    drivers.data?.items.map((driver) => [
      driver.id,
      `${driver.first_name} ${driver.last_name}`.trim() || driver.username,
    ]),
  );

  const selected = detail.data;
  const updatedAt = sessions.dataUpdatedAt ? new Date(sessions.dataUpdatedAt) : null;
  const selectedDriverLabel = userId ? (driverNames.get(userId) ?? shortId(userId)) : null;

  const applyDateRange = ({ from, to }: { from: string; to: string }) => {
    setDateFrom(from);
    setDateTo(to);
    setPage(1);
  };

  const chooseDriver = (id: string) => {
    setUserId(id);
    setPage(1);
    setDriverFinderOpen(false);
  };

  const exportCsv = async () => {
    setNotice("Preparing CSV export...");
    const rows: ChargeSession[] = [];
    let exportPage = 1;
    let keepGoing = true;
    while (keepGoing && rows.length < 5000) {
      const result = await listChargeSessions({ ...filters, page: exportPage, page_size: 100 });
      rows.push(...result.items);
      keepGoing = result.pagination.has_next;
      exportPage += 1;
    }
    const header = [
      "id", "created_at", "ended_at", "status", "user_id", "charger_id", "connector_id", "amount",
      "actual_dispensed_value", "refund_amount", "net_amount", "remaining_balance", "energy_kwh", "lotgrids_session_id",
    ];
    const csv = [
      header.join(","),
      ...rows.map((session) => {
        const row: Record<string, unknown> = { ...session, net_amount: netAmount(session) };
        return header.map((key) => JSON.stringify(String(row[key] ?? ""))).join(",");
      }),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `charge-sessions-${lagosToday()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice(`Exported ${rows.length} sessions${rows.length >= 5000 ? " (capped at 5,000)" : ""}.`);
  };

  return (
    <div className="space-y-6">
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Charge sessions</h1>
          <p className="mt-1 text-sm text-muted">
            Every debit that started a charge, with its outcome and any refund — the money-out ledger, mirroring wallet top-ups.
          </p>
        </div>
        <div className="grid gap-2 sm:flex sm:items-center lg:justify-end">
          <DateRangePicker from={dateFrom} to={dateTo} onApply={applyDateRange} align="end" className="sm:w-80" />
        </div>
      </div>

      {notice && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-surface p-3 text-sm shadow-card">
          <p>{notice}</p>
          <button type="button" onClick={() => setNotice(null)} className="text-muted hover:text-foreground">Dismiss</button>
        </div>
      )}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Net spent" value={stats.isLoading ? "..." : naira(stats.data?.total_amount ?? 0)} sub="After refunds for sessions stopped early" />
        <StatCard label="Sessions" value={stats.isLoading ? "..." : String(stats.data?.session_count ?? 0)} />
        <StatCard label="Unique drivers" value={stats.isLoading ? "..." : String(stats.data?.unique_drivers ?? 0)} />
        <StatCard label="Average spend" value={stats.isLoading ? "..." : naira(Math.round(stats.data?.average_amount ?? 0))} sub="Net, per session" />
      </section>

      <section className="rounded-lg border border-border bg-surface shadow-card">
        <div className="space-y-3 border-b border-border p-4">
          <div className="grid gap-3 lg:grid-cols-[auto_auto_auto_1fr] lg:items-end">
            {isAdmin && <Button variant="secondary" onClick={() => setDriverFinderOpen(true)}>Find driver</Button>}
            <Button variant="secondary" onClick={() => sessions.refetch()} loading={sessions.isRefetching}>Refresh</Button>
            <Button variant="secondary" onClick={exportCsv} disabled={!sessions.data?.pagination.total_items}>CSV</Button>
          </div>
          {invalidRange && <p className="text-sm text-danger">The start date must be before or equal to the end date.</p>}
          {selectedDriverLabel && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-subtle/60 px-3 py-2 text-sm">
              <span className="text-muted">Driver:</span>
              <span className="font-medium">{selectedDriverLabel}</span>
              <button type="button" onClick={() => { setUserId(""); setPage(1); }} className="ml-auto rounded-md px-2 py-1 text-xs font-medium text-brand hover:bg-surface">
                Clear
              </button>
            </div>
          )}
        </div>

        {sessions.isLoading ? (
          <SessionSkeletonCards />
        ) : sessions.data?.items.length ? (
          <div className="grid gap-3 p-3 md:hidden">
            {sessions.data.items.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                driver={driverLabel(session, driverNames)}
                onOpen={() => setSelectedId(session.id)}
              />
            ))}
          </div>
        ) : (
          <div className="p-3 md:hidden">
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted">
              No charge sessions match these filters.
            </div>
          </div>
        )}

        <div className="no-scrollbar hidden overflow-x-auto md:block">
          <table className="w-full min-w-[72rem] text-left text-sm">
            <thead className="bg-subtle/70 text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Started</th>
                <th className="px-4 py-3 font-semibold">Driver</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Charger</th>
                <th className="px-4 py-3 font-semibold">Amount</th>
                <th className="px-4 py-3 font-semibold">Energy</th>
                <th className="px-4 py-3 font-semibold">Balance after debit</th>
                <th className="px-4 py-3 font-semibold">Session ref</th>
              </tr>
            </thead>
            <tbody>
              {sessions.isLoading ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <tr key={index} className="animate-pulse border-t border-border">
                    {Array.from({ length: 8 }).map((__, cell) => <td key={cell} className="px-4 py-4"><div className="h-4 w-28 rounded bg-subtle" /></td>)}
                  </tr>
                ))
              ) : sessions.data?.items.length ? (
                sessions.data.items.map((session) => (
                  <tr key={session.id} onClick={() => setSelectedId(session.id)} className="cursor-pointer border-t border-border transition hover:bg-subtle/60">
                    <td className="px-4 py-3">{formatDateTime(session.created_at)}</td>
                    <td className="px-4 py-3"><DriverLink id={session.user_id}>{driverLabel(session, driverNames)}</DriverLink></td>
                    <td className="px-4 py-3"><StatusBadge status={session.status} /></td>
                    <td className="max-w-48 px-4 py-3" title={session.charger_id}>
                      <span className="block truncate font-mono text-xs">{session.charger_id}</span>
                      <span className="block text-xs text-muted">Connector {session.connector_id}</span>
                    </td>
                    <td className="px-4 py-3"><AmountCell session={session} /></td>
                    <td className="px-4 py-3 tabular-nums">{estimatedKwh(session.energy_kwh)}</td>
                    <td className="px-4 py-3 tabular-nums">{naira(session.remaining_balance)}</td>
                    <td className="max-w-40 truncate px-4 py-3 font-mono text-xs">{session.lotgrids_session_id}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted">No charge sessions match these filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted">{sessions.data?.pagination.total_items ?? 0} total · {updatedAt ? `Updated ${formatDateTime(updatedAt.toISOString())}` : "Not updated yet"}</p>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={!sessions.data?.pagination.has_prev} onClick={() => setPage((v) => Math.max(1, v - 1))}>Previous</Button>
            <Button variant="secondary" disabled={!sessions.data?.pagination.has_next} onClick={() => setPage((v) => v + 1)}>Next</Button>
          </div>
        </div>
      </section>

      <Modal open={Boolean(selectedId)} onClose={() => setSelectedId(null)} title="Session details">
        {detail.isLoading ? (
          <div className="h-40 animate-pulse rounded-lg bg-subtle" />
        ) : selected ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-subtle/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-muted">{selected.status === "STARTED" ? "Debited" : "Net paid"}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">
                    {naira(selected.status === "STARTED" ? selected.amount : netAmount(selected))}
                  </p>
                </div>
                <StatusBadge status={selected.status} />
              </div>
              <p className="mt-2 text-sm text-muted">
                Started {formatDateTime(selected.created_at)}
                {selected.ended_at && ` · ended ${formatDateTime(selected.ended_at)} (${formatDuration(selected.created_at, selected.ended_at)})`}
              </p>
            </div>

            {selected.status !== "STARTED" && (
              <div className="rounded-lg border border-border p-3 text-sm">
                <p className="mb-2 text-xs font-medium uppercase text-muted">Outcome</p>
                <dl className="space-y-1.5">
                  {[
                    ["Debited at start", naira(selected.amount)],
                    ["Dispensed", selected.actual_dispensed_value === null ? "-" : naira(selected.actual_dispensed_value)],
                    ["Refunded to wallet", naira(selected.refund_amount ?? 0)],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-3">
                      <dt className="text-muted">{label}</dt>
                      <dd className="tabular-nums">{value}</dd>
                    </div>
                  ))}
                  <div className="flex justify-between gap-3 border-t border-border pt-1.5 font-semibold">
                    <dt>Net paid</dt>
                    <dd className="tabular-nums">{naira(netAmount(selected))}</dd>
                  </div>
                </dl>
              </div>
            )}

            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              {[
                ["Driver", driverLabel(selected, driverNames)],
                ["User ID", selected.user_id],
                ...(selected.driver?.phone_number ? [["Phone", selected.driver.phone_number]] : []),
                ["Charger", selected.charger_id],
                ["Connector", selected.connector_id],
                ["Energy (estimated)", estimatedKwh(selected.energy_kwh)],
                ["Balance after debit", naira(selected.remaining_balance)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-subtle/60 p-3">
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd className="mt-1 break-words font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-muted">LotGrids session ID</p>
                  <p className="truncate font-mono text-sm">{selected.lotgrids_session_id}</p>
                </div>
                <CopyButton value={selected.lotgrids_session_id} label="Copy session ID" />
              </div>
            </div>
            <p className="rounded-lg bg-subtle p-3 text-sm text-muted">
              {selected.status === "STARTED"
                ? "Still charging, or LotGrids hasn't reported the outcome yet. This refreshes automatically; if it stays here long after the driver unplugged, check the LotGrids webhook."
                : selected.status === "INTERRUPTED"
                  ? "Stopped before the full amount was dispensed. The undispensed part was refunded to the driver's EV wallet automatically."
                  : "Dispensed in full, so no refund was due."}{" "}
              Energy is priced from the net spend at the rate in force when the session started, not a meter reading.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted">Session not found.</p>
        )}
      </Modal>

      <Modal open={driverFinderOpen} onClose={() => setDriverFinderOpen(false)} title="Find driver" size="lg">
        <div className="space-y-4">
          <label className="space-y-1.5 text-sm">
            <span className="font-medium">Search drivers</span>
            <input
              value={driverSearch}
              onChange={(event) => setDriverSearch(event.target.value)}
              placeholder="Search name, username, email or phone"
              className="h-10 w-full rounded-lg border border-input bg-surface px-3 outline-none focus:border-brand focus:ring-3 focus:ring-brand/20"
            />
          </label>

          {selectedDriverLabel && (
            <div className="flex items-center gap-2 rounded-lg bg-subtle/60 px-3 py-2 text-sm">
              <span className="text-muted">Current filter:</span>
              <span className="font-medium">{selectedDriverLabel}</span>
              <button type="button" onClick={() => { setUserId(""); setPage(1); setDriverFinderOpen(false); }} className="ml-auto text-xs font-medium text-brand hover:underline">
                Clear
              </button>
            </div>
          )}

          <div className="max-h-[60dvh] space-y-2 overflow-y-auto pr-1">
            {drivers.isLoading ? (
              Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-16 animate-pulse rounded-lg bg-subtle" />)
            ) : drivers.data?.items.length ? (
              drivers.data.items.map((driver) => {
                const name = `${driver.first_name} ${driver.last_name}`.trim() || driver.username;
                return (
                  <button
                    key={driver.id}
                    type="button"
                    onClick={() => chooseDriver(driver.id)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3 text-left transition hover:border-brand/50 hover:bg-subtle"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{name}</span>
                      <span className="block truncate text-xs text-muted">@{driver.username} · {dash(driver.email)} · {dash(driver.phone_number)}</span>
                    </span>
                    <span className="shrink-0 text-xs font-medium text-brand">Select</span>
                  </button>
                );
              })
            ) : (
              <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted">No drivers found.</div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
