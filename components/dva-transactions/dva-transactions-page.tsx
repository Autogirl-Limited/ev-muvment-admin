"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";

import { AccessDenied } from "@/components/dashboard/access-denied";
import { Button } from "@/components/ui/button";
import { Modal, ModalActions } from "@/components/ui/modal";
import { ApiError } from "@/lib/api/browser";
import {
  getDvaTransaction,
  getDvaStats,
  listDrivers,
  listDvaTransactions,
  resyncAllDriverDvas,
  resyncDriverDva,
  type DvaTransaction,
  type VirtualAccount,
  type BulkResyncResponse,
} from "@/lib/api/staff";
import { queryKeys } from "@/lib/query/keys";
import { useCurrentUser } from "@/lib/query/user";

const PAGE_SIZE = 20;
const LAGOS = "Africa/Lagos";

function lagosToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: LAGOS }).format(new Date());
}

function addDays(dateText: string, days: number) {
  const [year, month, day] = dateText.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12));
  return date.toISOString().slice(0, 10);
}

function monthStart(dateText: string) {
  return `${dateText.slice(0, 8)}01`;
}

function monthLabel(month: string) {
  const [year, value] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-NG", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, value - 1, 1)));
}

function daysInMonth(month: string) {
  const [year, value] = month.split("-").map(Number);
  return new Date(Date.UTC(year, value, 0)).getUTCDate();
}

function weekdayOffset(month: string) {
  const [year, value] = month.split("-").map(Number);
  return new Date(Date.UTC(year, value - 1, 1)).getUTCDay();
}

function shiftMonth(month: string, delta: number) {
  const [year, value] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, value - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

function dateLabel(date: string) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

function rangeLabel(from: string, to: string) {
  if (!from && !to) return "All time";
  if (from && to && from === to) return dateLabel(from);
  if (from && to) return `${dateLabel(from)} to ${dateLabel(to)}`;
  if (from) return `From ${dateLabel(from)}`;
  return `Until ${dateLabel(to)}`;
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

function DvaCard({ account }: { account: VirtualAccount }) {
  const banks = account.banks.length
    ? account.banks
    : [{ bank_name: account.bank_name, bank_code: account.bank_code, account_number: account.account_number }];

  return (
    <div className="rounded-lg border border-border bg-subtle/45 p-4">
      <p className="text-sm font-semibold">{account.account_name}</p>
      <div className="mt-3 grid gap-2">
        {banks.map((bank) => (
          <div key={`${bank.bank_code}-${bank.account_number}`} className="flex items-center justify-between gap-3 rounded-lg bg-surface px-3 py-2">
            <div>
              <p className="text-sm font-medium">{bank.bank_name}</p>
              <p className="font-mono text-sm text-muted">{bank.account_number}</p>
            </div>
            <CopyButton value={bank.account_number} label={`Copy ${bank.bank_name} account number`} />
          </div>
        ))}
      </div>
    </div>
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

function DateRangePicker({
  from,
  to,
  onApply,
}: {
  from: string;
  to: string;
  onApply: (range: { from: string; to: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const [month, setMonth] = useState((from || lagosToday()).slice(0, 7));
  const days = Array.from({ length: daysInMonth(month) }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`);
  const offset = weekdayOffset(month);
  const today = lagosToday();

  const pick = (day: string) => {
    if (!draftFrom || (draftFrom && draftTo)) {
      setDraftFrom(day);
      setDraftTo("");
    } else if (day < draftFrom) {
      setDraftFrom(day);
      setDraftTo(draftFrom);
    } else {
      setDraftTo(day);
    }
  };

  const setPreset = (preset: "today" | "yesterday" | "7" | "month" | "all") => {
    if (preset === "all") {
      setDraftFrom("");
      setDraftTo("");
      return;
    }
    if (preset === "today") {
      setDraftFrom(today);
      setDraftTo(today);
      setMonth(today.slice(0, 7));
      return;
    }
    if (preset === "yesterday") {
      const yesterday = addDays(today, -1);
      setDraftFrom(yesterday);
      setDraftTo(yesterday);
      setMonth(yesterday.slice(0, 7));
      return;
    }
    if (preset === "7") {
      setDraftFrom(addDays(today, -6));
      setDraftTo(today);
      setMonth(today.slice(0, 7));
      return;
    }
    setDraftFrom(monthStart(today));
    setDraftTo(today);
    setMonth(today.slice(0, 7));
  };

  const apply = () => {
    onApply({ from: draftFrom, to: draftTo || draftFrom });
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setDraftFrom(from);
          setDraftTo(to);
          setMonth((from || lagosToday()).slice(0, 7));
          setOpen((value) => !value);
        }}
        className="flex h-10 w-full items-center justify-between gap-3 rounded-lg border border-input bg-surface px-3 text-left text-sm transition hover:bg-subtle focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/20 pointer-coarse:h-11 pointer-coarse:text-base"
      >
        <span className="min-w-0">
          <span className="block text-xs text-muted">Date range</span>
          <span className="block truncate font-medium">{rangeLabel(from, to)}</span>
        </span>
        <span aria-hidden className="text-muted">v</span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-20 mt-2 overflow-hidden rounded-xl border border-border bg-surface shadow-card sm:right-auto sm:w-[42rem]">
          <div className="grid gap-0 sm:grid-cols-[12rem_minmax(0,1fr)]">
            <div className="border-b border-border bg-subtle/50 p-3 sm:border-b-0 sm:border-r">
              <p className="px-1 text-xs font-semibold uppercase text-muted">Quick ranges</p>
              <div className="mt-2 grid gap-1">
                {[
                  ["today", "Today"],
                  ["yesterday", "Yesterday"],
                  ["7", "Last 7 days"],
                  ["month", "This month"],
                  ["all", "All time"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPreset(id as "today" | "yesterday" | "7" | "month" | "all")}
                    className="rounded-lg px-3 py-2 text-left text-sm font-medium transition hover:bg-surface"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-3">
              <div className="flex items-center justify-between gap-3">
                <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} className="size-9 rounded-lg text-muted hover:bg-subtle" aria-label="Previous month">
                  &lt;
                </button>
                <p className="font-semibold">{monthLabel(month)}</p>
                <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} className="size-9 rounded-lg text-muted hover:bg-subtle" aria-label="Next month">
                  &gt;
                </button>
              </div>

              <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-1">
                {Array.from({ length: offset }).map((_, index) => <span key={`blank-${index}`} />)}
                {days.map((day) => {
                  const selected = day === draftFrom || day === draftTo;
                  const ranged = draftFrom && draftTo && day > draftFrom && day < draftTo;
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => pick(day)}
                      className={`h-9 rounded-lg text-sm font-medium transition ${
                        selected
                          ? "bg-brand text-brand-foreground"
                          : ranged
                            ? "bg-brand-soft text-brand"
                            : day === today
                              ? "bg-subtle text-foreground"
                              : "hover:bg-subtle"
                      }`}
                    >
                      {Number(day.slice(-2))}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted">{rangeLabel(draftFrom, draftTo)}</p>
                <div className="grid grid-cols-2 gap-2 sm:flex">
                  <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button onClick={apply} disabled={Boolean(draftFrom) !== Boolean(draftTo || draftFrom)}>Apply</Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TransactionSkeletonCards() {
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
            <div className="h-12 rounded-lg bg-subtle" />
          </div>
        </div>
      ))}
    </div>
  );
}

function TransactionCard({
  tx,
  driver,
  onOpen,
}: {
  tx: DvaTransaction;
  driver: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-lg border border-border bg-surface p-4 text-left shadow-card transition active:scale-[0.99] hover:border-brand/50 hover:bg-subtle/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{driver}</p>
          <p className="mt-0.5 text-xs text-muted">{formatDateTime(tx.paid_at)}</p>
        </div>
        <p className="shrink-0 text-right text-lg font-semibold tabular-nums">{naira(tx.amount)}</p>
      </div>
      <div className="mt-4 grid gap-2 text-sm">
        <div className="rounded-lg bg-subtle/70 p-3">
          <p className="text-xs text-muted">Payer</p>
          <p className="mt-1 truncate font-medium">{dash(tx.payer_name)}</p>
          <p className="truncate text-xs text-muted">{dash(tx.payer_account_number)} · {dash(tx.payer_bank_code)}</p>
        </div>
        <div className="rounded-lg bg-subtle/70 p-3">
          <p className="text-xs text-muted">Reference</p>
          <p className="mt-1 truncate font-mono text-xs">{tx.transaction_reference}</p>
          <p className="mt-1 line-clamp-2 text-xs text-muted">{dash(tx.narration)}</p>
        </div>
      </div>
    </button>
  );
}

function BulkResultCard({ result }: { result: BulkResyncResponse["results"][number] }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="break-all font-mono text-xs">{result.user_id}</p>
        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${result.succeeded ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
          {result.succeeded ? "Succeeded" : "Failed"}
        </span>
      </div>
      {result.error && <p className="mt-2 text-muted">{result.error}</p>}
    </div>
  );
}

export function DvaTransactionsPage() {
  const user = useCurrentUser();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(() => {
    if (typeof window === "undefined") return 1;
    const value = Number(new URLSearchParams(window.location.search).get("page"));
    return Number.isFinite(value) && value > 0 ? value : 1;
  });
  const [search, setSearch] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("searchTerm") ?? "";
  });
  const debouncedSearch = useDebounced(search);
  const [driverSearch, setDriverSearch] = useState("");
  const debouncedDriverSearch = useDebounced(driverSearch);
  const [userId, setUserId] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("userId") ?? "";
  });
  const [dateFrom, setDateFrom] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("dateFrom") ?? "";
  });
  const [dateTo, setDateTo] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("dateTo") ?? "";
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resyncedAccount, setResyncedAccount] = useState<VirtualAccount | null>(null);
  const [confirmAll, setConfirmAll] = useState("");
  const [bulkResult, setBulkResult] = useState<BulkResyncResponse | null>(null);
  const [driverFinderOpen, setDriverFinderOpen] = useState(false);
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const [resyncMode, setResyncMode] = useState<"choose" | "all" | "one">("choose");

  const isStaff = user.user_type === "ADMIN" || user.user_type === "ACCOUNT_OFFICER" || user.user_type === "RELATIONSHIP_OFFICER";
  const isAdmin = user.user_type === "ADMIN";

  const filters = useMemo(
    () => ({
      page,
      page_size: PAGE_SIZE,
      userId: userId || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      searchTerm: debouncedSearch.trim() || undefined,
    }),
    [dateFrom, dateTo, debouncedSearch, page, userId],
  );

  const statsFilters = useMemo(() => ({ dateFrom: dateFrom || undefined, dateTo: dateTo || undefined }), [dateFrom, dateTo]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (page > 1) params.set("page", String(page));
    if (userId) params.set("userId", userId);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (debouncedSearch.trim()) params.set("searchTerm", debouncedSearch.trim());
    const next = params.toString() ? `${pathname}?${params}` : pathname;
    router.replace(next, { scroll: false });
  }, [dateFrom, dateTo, debouncedSearch, page, pathname, router, userId]);

  const transactions = useQuery({
    queryKey: queryKeys.dvaTransactions.list(filters),
    queryFn: ({ signal }) => listDvaTransactions(filters, signal),
    enabled: isStaff && (!dateFrom || !dateTo || dateFrom <= dateTo),
    refetchOnWindowFocus: true,
  });

  const stats = useQuery({
    queryKey: queryKeys.dvaTransactions.stats(statsFilters),
    queryFn: ({ signal }) => getDvaStats(statsFilters, signal),
    enabled: isStaff && (!dateFrom || !dateTo || dateFrom <= dateTo),
  });

  const drivers = useQuery({
    queryKey: queryKeys.users.drivers(debouncedDriverSearch),
    queryFn: ({ signal }) => listDrivers(debouncedDriverSearch, signal),
    enabled: isAdmin,
    retry: false,
  });

  const detail = useQuery({
    queryKey: queryKeys.dvaTransactions.detail(selectedId ?? ""),
    queryFn: ({ signal }) => getDvaTransaction(selectedId!, signal),
    enabled: Boolean(selectedId),
  });

  const singleResync = useMutation({
    mutationFn: (id: string) => resyncDriverDva(id),
    onSuccess: (account) => {
      setResyncedAccount(account);
      setNotice("Driver bank account recreated. Tell the driver to use the new account numbers.");
      setMaintenanceOpen(false);
      setResyncMode("choose");
      setDriverSearch("");
      queryClient.invalidateQueries({ queryKey: queryKeys.dvaTransactions.all });
    },
    onError: (error) => setNotice(error instanceof ApiError ? error.message : "Could not recreate this driver's account."),
  });

  const bulkResync = useMutation({
    mutationFn: () => resyncAllDriverDvas(),
    onSuccess: (result) => {
      setBulkResult(result);
      setNotice(`Resynced ${result.succeeded}/${result.total} driver bank accounts.`);
      setConfirmAll("");
      setMaintenanceOpen(false);
      setResyncMode("choose");
    },
    onError: (error) => setNotice(error instanceof ApiError ? error.message : "Bulk resync failed or timed out. Refresh driver records before retrying."),
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
  const fee = selected?.settlement_amount == null ? null : selected.amount - selected.settlement_amount;
  const updatedAt = transactions.dataUpdatedAt ? new Date(transactions.dataUpdatedAt) : null;
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

  const openMaintenance = () => {
    setMaintenanceOpen(true);
    setResyncMode("choose");
    setConfirmAll("");
    setDriverSearch("");
  };

  const exportCsv = async () => {
    setNotice("Preparing CSV export...");
    const rows: DvaTransaction[] = [];
    let exportPage = 1;
    let keepGoing = true;
    while (keepGoing && rows.length < 5000) {
      const result = await listDvaTransactions({ ...filters, page: exportPage, page_size: 100 });
      rows.push(...result.items);
      keepGoing = result.pagination.has_next;
      exportPage += 1;
    }
    const header = ["id", "paid_at", "user_id", "amount", "settlement_amount", "payer_name", "payer_account_number", "payer_bank_code", "transaction_reference", "payment_reference", "narration"];
    const csv = [
      header.join(","),
      ...rows.map((tx) =>
        header.map((key) => JSON.stringify(String(tx[key as keyof DvaTransaction] ?? ""))).join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `dva-transactions-${lagosToday()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice(`Exported ${rows.length} transactions${rows.length >= 5000 ? " (capped at 5,000)" : ""}.`);
  };

  return (
    <div className="space-y-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
          <p className="mt-1 text-sm text-muted">
            Track successful inbound transfers into driver virtual accounts and reconcile by Nigeria-day ranges.
          </p>
        </div>
        {isAdmin && (
          <Button variant="secondary" onClick={openMaintenance} className="sm:shrink-0">
            DVA maintenance
          </Button>
        )}
      </div>

      {notice && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-surface p-3 text-sm shadow-card">
          <p>{notice}</p>
          <button type="button" onClick={() => setNotice(null)} className="text-muted hover:text-foreground">Dismiss</button>
        </div>
      )}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total received" value={stats.isLoading ? "..." : naira(stats.data?.total_amount ?? 0)} />
        <StatCard label="Settled after fees" value={stats.isLoading ? "..." : naira(stats.data?.total_settlement_amount ?? 0)} />
        <StatCard label="Transactions" value={stats.isLoading ? "..." : String(stats.data?.transaction_count ?? 0)} />
        <StatCard label="Drivers funded" value={stats.isLoading ? "..." : String(stats.data?.unique_drivers_funded ?? 0)} />
        <StatCard label="Average transfer" value={stats.isLoading ? "..." : naira(Math.round(stats.data?.average_transaction_amount ?? 0))} sub={userId || debouncedSearch ? "Totals cover all drivers" : undefined} />
      </section>

      <section className="rounded-lg border border-border bg-surface shadow-card">
        <div className="space-y-3 border-b border-border p-4">
          <div className="grid gap-3 xl:grid-cols-[minmax(18rem,0.9fr)_minmax(18rem,1.2fr)_auto_auto_auto] xl:items-end">
            <DateRangePicker from={dateFrom} to={dateTo} onApply={applyDateRange} />
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Search</span>
              <input value={search} onChange={(event) => { setSearch(event.target.value.slice(0, 200)); setPage(1); }} placeholder="Payer name, reference or narration" className="h-10 w-full rounded-lg border border-input bg-surface px-3 outline-none focus:border-brand focus:ring-3 focus:ring-brand/20" />
            </label>
            {isAdmin && <Button variant="secondary" onClick={() => setDriverFinderOpen(true)}>Find driver</Button>}
            <Button variant="secondary" onClick={() => transactions.refetch()} loading={transactions.isRefetching}>Refresh</Button>
            <Button variant="secondary" onClick={exportCsv} disabled={!transactions.data?.pagination.total_items}>CSV</Button>
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

        {transactions.isLoading ? (
          <TransactionSkeletonCards />
        ) : transactions.data?.items.length ? (
          <div className="grid gap-3 p-3 md:hidden">
            {transactions.data.items.map((tx) => (
              <TransactionCard
                key={tx.id}
                tx={tx}
                driver={driverNames.get(tx.user_id) ?? shortId(tx.user_id)}
                onOpen={() => setSelectedId(tx.id)}
              />
            ))}
          </div>
        ) : (
          <div className="p-3 md:hidden">
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted">
              No transactions match these filters.
            </div>
          </div>
        )}

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[68rem] text-left text-sm">
            <thead className="bg-subtle/70 text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Paid</th>
                <th className="px-4 py-3 font-semibold">Amount</th>
                <th className="px-4 py-3 font-semibold">Payer</th>
                <th className="px-4 py-3 font-semibold">Driver</th>
                <th className="px-4 py-3 font-semibold">Reference</th>
                <th className="px-4 py-3 font-semibold">Narration</th>
              </tr>
            </thead>
            <tbody>
              {transactions.isLoading ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <tr key={index} className="animate-pulse border-t border-border">
                    {Array.from({ length: 6 }).map((__, cell) => <td key={cell} className="px-4 py-4"><div className="h-4 w-28 rounded bg-subtle" /></td>)}
                  </tr>
                ))
              ) : transactions.data?.items.length ? (
                transactions.data.items.map((tx) => (
                  <tr key={tx.id} onClick={() => setSelectedId(tx.id)} className="cursor-pointer border-t border-border transition hover:bg-subtle/60">
                    <td className="px-4 py-3">{formatDateTime(tx.paid_at)}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{naira(tx.amount)}</td>
                    <td className="px-4 py-3">
                      <p>{dash(tx.payer_name)}</p>
                      <p className="text-xs text-muted">{dash(tx.payer_account_number)} · {dash(tx.payer_bank_code)}</p>
                    </td>
                    <td className="px-4 py-3">{driverNames.get(tx.user_id) ?? shortId(tx.user_id)}</td>
                    <td className="max-w-56 truncate px-4 py-3 font-mono text-xs">{tx.transaction_reference}</td>
                    <td className="max-w-48 truncate px-4 py-3">{dash(tx.narration)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted">No transactions match these filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted">{transactions.data?.pagination.total_items ?? 0} total · {updatedAt ? `Updated ${formatDateTime(updatedAt.toISOString())}` : "Not updated yet"}</p>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={!transactions.data?.pagination.has_prev} onClick={() => setPage((v) => Math.max(1, v - 1))}>Previous</Button>
            <Button variant="secondary" disabled={!transactions.data?.pagination.has_next} onClick={() => setPage((v) => v + 1)}>Next</Button>
          </div>
        </div>
      </section>

      <Modal open={Boolean(selectedId)} onClose={() => setSelectedId(null)} title="Transaction details">
        {detail.isLoading ? (
          <div className="h-40 animate-pulse rounded-lg bg-subtle" />
        ) : selected ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-success-soft p-4">
              <p className="text-2xl font-semibold text-success">{naira(selected.amount)}</p>
              <p className="mt-1 text-sm text-muted">Paid {formatDateTime(selected.paid_at)}</p>
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              {[
                ["Driver", driverNames.get(selected.user_id) ?? shortId(selected.user_id)],
                ["User ID", selected.user_id],
                ["Settlement", selected.settlement_amount == null ? "-" : naira(selected.settlement_amount)],
                ["Fee", fee == null ? "-" : naira(fee)],
                ["Payer", dash(selected.payer_name)],
                ["Payer account", dash(selected.payer_account_number)],
                ["Bank code", dash(selected.payer_bank_code)],
                ["Virtual account", dash(selected.virtual_account_id)],
                ["Payment ref", dash(selected.payment_reference)],
                ["Recorded", formatDateTime(selected.created_at)],
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
                  <p className="text-xs text-muted">Transaction reference</p>
                  <p className="truncate font-mono text-sm">{selected.transaction_reference}</p>
                </div>
                <CopyButton value={selected.transaction_reference} label="Copy transaction reference" />
              </div>
            </div>
            {!selected.virtual_account_id && (
              <p className="rounded-lg bg-subtle p-3 text-sm text-muted">The account this was paid into has since been replaced.</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted">Transaction not found.</p>
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

      <Modal
        open={maintenanceOpen}
        onClose={() => {
          setMaintenanceOpen(false);
          setResyncMode("choose");
          setConfirmAll("");
        }}
        title="DVA maintenance"
        size="lg"
      >
        <div className="space-y-4">
          {resyncMode === "choose" && (
            <>
              <p className="text-sm text-muted">Recreating driver bank accounts changes the account numbers they should use. Transaction history remains available.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <button type="button" onClick={() => setResyncMode("one")} className="rounded-lg border border-border bg-surface p-4 text-left transition hover:border-brand/50 hover:bg-subtle">
                  <p className="font-semibold">Resync one driver</p>
                  <p className="mt-1 text-sm text-muted">Search for a driver and recreate only their virtual account.</p>
                </button>
                <button type="button" onClick={() => setResyncMode("all")} className="rounded-lg border border-danger/30 bg-danger-soft p-4 text-left transition hover:brightness-95">
                  <p className="font-semibold text-danger">Resync all drivers</p>
                  <p className="mt-1 text-sm">Use only when provider records are broadly out of sync.</p>
                </button>
              </div>
            </>
          )}

          {resyncMode === "all" && (
            <>
              <button type="button" onClick={() => setResyncMode("choose")} className="text-sm font-medium text-brand hover:underline">Back</button>
              <div className="rounded-lg border border-danger/30 bg-danger-soft p-4 text-sm">
                <p className="font-semibold text-danger">Resync every driver virtual account?</p>
                <p className="mt-1">Old account numbers may stop working. Type RESYNC to confirm this bulk operation.</p>
              </div>
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">Confirmation</span>
                <input
                  value={confirmAll}
                  onChange={(event) => setConfirmAll(event.target.value)}
                  className="h-10 w-full rounded-lg border border-input bg-surface px-3 outline-none focus:border-danger focus:ring-3 focus:ring-danger/20"
                  placeholder="Type RESYNC"
                />
              </label>
              <ModalActions>
                <Button variant="secondary" onClick={() => setResyncMode("choose")} disabled={bulkResync.isPending}>Back</Button>
                <Button variant="danger" disabled={confirmAll !== "RESYNC"} loading={bulkResync.isPending} onClick={() => bulkResync.mutate()}>Resync all</Button>
              </ModalActions>
            </>
          )}

          {resyncMode === "one" && (
            <>
              <button type="button" onClick={() => setResyncMode("choose")} className="text-sm font-medium text-brand hover:underline">Back</button>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">Search drivers</span>
                <input
                  value={driverSearch}
                  onChange={(event) => setDriverSearch(event.target.value)}
                  placeholder="Search name, username, email or phone"
                  className="h-10 w-full rounded-lg border border-input bg-surface px-3 outline-none focus:border-brand focus:ring-3 focus:ring-brand/20"
                />
              </label>
              <div className="max-h-[55dvh] space-y-2 overflow-y-auto pr-1">
                {drivers.isLoading ? (
                  Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-16 animate-pulse rounded-lg bg-subtle" />)
                ) : drivers.data?.items.length ? (
                  drivers.data.items.map((driver) => {
                    const name = `${driver.first_name} ${driver.last_name}`.trim() || driver.username;
                    return (
                      <div key={driver.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{name}</p>
                          <p className="truncate text-xs text-muted">@{driver.username} · {dash(driver.email)} · {dash(driver.phone_number)}</p>
                        </div>
                        <Button variant="danger" loading={singleResync.isPending} onClick={() => singleResync.mutate(driver.id)} className="shrink-0">
                          Resync
                        </Button>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted">No drivers found.</div>
                )}
              </div>
            </>
          )}
        </div>
      </Modal>

      <Modal open={Boolean(resyncedAccount)} onClose={() => setResyncedAccount(null)} title="New bank account">
        {resyncedAccount && <DvaCard account={resyncedAccount} />}
      </Modal>

      <Modal open={Boolean(bulkResult)} onClose={() => setBulkResult(null)} title="Bulk resync result">
        {bulkResult && (
          <div className="space-y-4">
            <p className="text-sm text-muted">{bulkResult.succeeded} succeeded, {bulkResult.failed} failed, {bulkResult.total} total.</p>
            <div className="grid gap-2 sm:hidden">
              {bulkResult.results.map((result) => <BulkResultCard key={result.user_id} result={result} />)}
            </div>
            <div className="hidden max-h-80 overflow-auto rounded-lg border border-border sm:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-subtle text-xs uppercase text-muted">
                  <tr><th className="px-3 py-2">Driver</th><th className="px-3 py-2">Result</th><th className="px-3 py-2">Error</th></tr>
                </thead>
                <tbody>
                  {bulkResult.results.map((result) => (
                    <tr key={result.user_id} className="border-t border-border">
                      <td className="px-3 py-2 font-mono text-xs">{result.user_id}</td>
                      <td className="px-3 py-2">{result.succeeded ? "Succeeded" : "Failed"}</td>
                      <td className="px-3 py-2 text-muted">{result.error ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ModalActions>
              <Button variant="secondary" onClick={() => setBulkResult(null)}>Close</Button>
            </ModalActions>
          </div>
        )}
      </Modal>
    </div>
  );
}
