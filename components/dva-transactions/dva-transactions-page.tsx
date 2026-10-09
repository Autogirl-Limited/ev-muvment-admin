"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";

import { AccessDenied } from "@/components/dashboard/access-denied";
import { Icon, SearchInput } from "@/components/dashboard/screen-kit";
import { Button } from "@/components/ui/button";
import { ExportDialog } from "@/components/dva-transactions/export-dialog";
import { DriverLink } from "@/components/people/people-parts";
import { DateRangePicker, lagosToday } from "@/components/ui/date-range-picker";
import { Modal, ModalActions } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
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
import { useRoster } from "@/lib/query/users";

const PAGE_SIZE = 20;
const LAGOS = "Africa/Lagos";

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

function payerBank(tx: DvaTransaction) {
  return tx.payer_bank_name ?? tx.payer_bank_code ?? null;
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

function StatCard({ label, value, sub, loading, className = "" }: { label: string; value: string; sub?: string; loading?: boolean; className?: string }) {
  return (
    <div className={`min-w-0 rounded-lg border border-border bg-surface p-3.5 shadow-card sm:p-4 ${className}`}>
      <p className="truncate text-[0.7rem] font-medium uppercase tracking-wide text-muted sm:text-xs">{label}</p>
      {loading ? (
        <div className="mt-2 h-7 w-24 animate-pulse rounded bg-subtle" />
      ) : (
        <p className="mt-1.5 truncate text-lg font-semibold tabular-nums sm:mt-2 sm:text-2xl" title={value}>{value}</p>
      )}
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  );
}

function TransactionSkeletonCards() {
  return (
    <div className="grid grid-cols-1 gap-3 p-3 lg:hidden">
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
      className="block w-full min-w-0 rounded-lg border border-border bg-surface p-4 text-left shadow-card transition hover:border-brand/50 hover:bg-subtle/40 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{driver}</p>
          <p className="mt-0.5 text-xs text-muted">{formatDateTime(tx.paid_at)}</p>
        </div>
        <p className="shrink-0 text-right text-lg font-semibold tabular-nums text-success">{naira(tx.amount)}</p>
      </div>
      <dl className="mt-3 grid grid-cols-1 gap-2 text-sm">
        <div className="min-w-0 rounded-lg bg-subtle/70 px-3 py-2.5">
          <dt className="text-xs text-muted">Payer</dt>
          <dd className="mt-0.5 line-clamp-2 font-medium [overflow-wrap:anywhere]">{dash(tx.payer_name)}</dd>
          <dd className="mt-0.5 text-xs text-muted [overflow-wrap:anywhere]">
            <span className="font-mono">{dash(tx.payer_account_number)}</span> · {dash(payerBank(tx))}
          </dd>
        </div>
        <div className="min-w-0 rounded-lg bg-subtle/70 px-3 py-2.5">
          <dt className="text-xs text-muted">Reference</dt>
          <dd className="mt-0.5 truncate font-mono text-xs">{tx.transaction_reference}</dd>
          {tx.narration && <dd className="mt-1 line-clamp-2 text-xs text-muted [overflow-wrap:anywhere]">{tx.narration}</dd>}
        </div>
      </dl>
    </button>
  );
}

function BulkResultCard({ result }: { result: BulkResyncResponse["results"][number] }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 break-all font-mono text-xs">{result.user_id}</p>
        <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${result.succeeded ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
          {result.succeeded ? "Succeeded" : "Failed"}
        </span>
      </div>
      {result.error && <p className="mt-2 text-muted [overflow-wrap:anywhere]">{result.error}</p>}
    </div>
  );
}

export function DvaTransactionsPage() {
  const user = useCurrentUser();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const toast = useToast();
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
    if (typeof window === "undefined") return lagosToday();
    return new URLSearchParams(window.location.search).get("dateFrom") ?? lagosToday();
  });
  const [dateTo, setDateTo] = useState(() => {
    if (typeof window === "undefined") return lagosToday();
    return new URLSearchParams(window.location.search).get("dateTo") ?? lagosToday();
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resyncedAccount, setResyncedAccount] = useState<VirtualAccount | null>(null);
  const [confirmAll, setConfirmAll] = useState("");
  const [bulkResult, setBulkResult] = useState<BulkResyncResponse | null>(null);
  const [driverFinderOpen, setDriverFinderOpen] = useState(false);
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const [resyncMode, setResyncMode] = useState<"choose" | "all" | "one">("choose");
  const [exportOpen, setExportOpen] = useState(false);

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

  // Names for every driver (admin only), so labels don't depend on what the driver finder searched.
  const roster = useRoster("DRIVER", isAdmin);

  const detail = useQuery({
    queryKey: queryKeys.dvaTransactions.detail(selectedId ?? ""),
    queryFn: ({ signal }) => getDvaTransaction(selectedId!, signal),
    enabled: Boolean(selectedId),
  });

  const singleResync = useMutation({
    mutationFn: (id: string) => resyncDriverDva(id),
    onSuccess: (account) => {
      setResyncedAccount(account);
      toast.success("Driver bank account recreated. Tell the driver to use the new account numbers.");
      setMaintenanceOpen(false);
      setResyncMode("choose");
      setDriverSearch("");
      queryClient.invalidateQueries({ queryKey: queryKeys.dvaTransactions.all });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not recreate this driver's account."),
  });

  const bulkResync = useMutation({
    mutationFn: () => resyncAllDriverDvas(),
    onSuccess: (result) => {
      setBulkResult(result);
      toast.success(`Resynced ${result.succeeded}/${result.total} driver bank accounts.`);
      setConfirmAll("");
      setMaintenanceOpen(false);
      setResyncMode("choose");
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Bulk resync failed or timed out. Refresh driver records before retrying."),
  });

  if (!isStaff) return <AccessDenied />;

  const invalidRange = dateFrom && dateTo && dateFrom > dateTo;
  const driverNames = new Map(
    [...(roster.data ?? []), ...(drivers.data?.items ?? [])].map((driver) => [
      driver.id,
      `${driver.first_name} ${driver.last_name}`.trim() || driver.username,
    ]),
  );
  const pagination = transactions.data?.pagination;
  const rangeStart = pagination && pagination.total_items ? (pagination.page - 1) * pagination.page_size + 1 : 0;
  const rangeEnd = pagination ? Math.min(pagination.page * pagination.page_size, pagination.total_items) : 0;

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

  return (
    <div className="min-w-0 space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3.5">
          <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
            <Icon name="bank" className="size-6" />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Successful inbound transfers into driver virtual accounts, reconciled by Nigeria-day ranges.
            </p>
          </div>
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-2 sm:flex sm:items-center lg:shrink-0 lg:justify-end">
          <DateRangePicker from={dateFrom} to={dateTo} onApply={applyDateRange} align="end" className="min-w-0 sm:w-80" />
          {isAdmin && (
            <Button variant="secondary" onClick={openMaintenance} className="h-12 sm:shrink-0">
              <Icon name="refresh" className="size-4" />
              DVA maintenance
            </Button>
          )}
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard className="col-span-2 lg:col-span-1" label="Total received" loading={stats.isLoading} value={naira(stats.data?.total_amount ?? 0)} />
        <StatCard label="Settled after fees" loading={stats.isLoading} value={naira(stats.data?.total_settlement_amount ?? 0)} />
        <StatCard label="Transactions" loading={stats.isLoading} value={(stats.data?.transaction_count ?? 0).toLocaleString()} />
        <StatCard label="Drivers funded" loading={stats.isLoading} value={(stats.data?.unique_drivers_funded ?? 0).toLocaleString()} />
        <StatCard label="Average transfer" loading={stats.isLoading} value={naira(Math.round(stats.data?.average_transaction_amount ?? 0))} sub={debouncedSearch.trim() ? "Totals ignore the search" : undefined} />
      </section>

      <section className="min-w-0 overflow-hidden rounded-lg border border-border bg-surface shadow-card">
        <div className="space-y-3 border-b border-border p-3 sm:p-4">
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <SearchInput label="Search transactions" value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Payer, bank, reference or narration" />
            <div className={`grid gap-2 ${isAdmin ? "grid-cols-3" : "grid-cols-2"} lg:flex`}>
              {isAdmin && (
                <Button variant="secondary" onClick={() => setDriverFinderOpen(true)} className="min-w-0 px-3">
                  <Icon name="user" className="size-4 shrink-0" />
                  <span className="truncate">Driver</span>
                </Button>
              )}
              <Button variant="secondary" onClick={() => transactions.refetch()} loading={transactions.isRefetching} className="min-w-0 px-3">
                {!transactions.isRefetching && <Icon name="refresh" className="size-4 shrink-0" />}
                <span className="truncate">Refresh</span>
              </Button>
              <Button variant="secondary" onClick={() => setExportOpen(true)} className="min-w-0 px-3">
                <Icon name="download" className="size-4 shrink-0" />
                <span className="truncate">Export</span>
              </Button>
            </div>
          </div>
          {invalidRange && <p className="text-sm text-danger">The start date must be before or equal to the end date.</p>}
          {selectedDriverLabel && (
            <div className="flex min-w-0 items-center gap-2 rounded-lg bg-subtle/60 py-1.5 pl-3 pr-1.5 text-sm">
              <Icon name="user" className="size-4 shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate">
                <span className="text-muted">Driver: </span>
                <span className="font-medium">{selectedDriverLabel}</span>
              </span>
              <button type="button" onClick={() => { setUserId(""); setPage(1); }} className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-brand hover:bg-surface">
                Clear
              </button>
            </div>
          )}
        </div>

        {transactions.isLoading ? (
          <TransactionSkeletonCards />
        ) : transactions.data?.items.length ? (
          <div className="grid grid-cols-1 gap-3 p-3 lg:hidden">
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
          <div className="p-3 lg:hidden">
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted">
              No transactions match these filters.
            </div>
          </div>
        )}

        <div className="hidden overflow-x-auto lg:block">
          {/* Fixed layout: long payer names, banks and narrations truncate (full text on hover) instead of widening the table. */}
          <table className="w-full min-w-[56rem] table-fixed text-left text-sm">
            <thead className="bg-subtle/70 text-xs uppercase text-muted">
              <tr>
                <th className="w-44 px-4 py-3 font-semibold">Paid</th>
                <th className="w-32 px-4 py-3 text-right font-semibold">Amount</th>
                <th className="px-4 py-3 font-semibold">Payer</th>
                <th className="w-44 px-4 py-3 font-semibold">Driver</th>
                <th className="w-52 px-4 py-3 font-semibold">Reference</th>
                <th className="hidden w-48 px-4 py-3 font-semibold xl:table-cell">Narration</th>
              </tr>
            </thead>
            <tbody>
              {transactions.isLoading ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <tr key={index} className="animate-pulse border-t border-border">
                    {Array.from({ length: 6 }).map((__, cell) => (
                      <td key={cell} className={`px-4 py-4 ${cell === 5 ? "hidden xl:table-cell" : ""}`}><div className="h-4 w-3/4 rounded bg-subtle" /></td>
                    ))}
                  </tr>
                ))
              ) : transactions.data?.items.length ? (
                transactions.data.items.map((tx) => {
                  const bankLine = `${dash(tx.payer_account_number)} · ${dash(payerBank(tx))}`;
                  const driverLabel = driverNames.get(tx.user_id) ?? shortId(tx.user_id);
                  return (
                    <tr key={tx.id} onClick={() => setSelectedId(tx.id)} className="cursor-pointer border-t border-border transition hover:bg-subtle/60">
                      <td className="whitespace-nowrap px-4 py-3">{formatDateTime(tx.paid_at)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums">{naira(tx.amount)}</td>
                      <td className="px-4 py-3">
                        <p className="truncate" title={tx.payer_name ?? undefined}>{dash(tx.payer_name)}</p>
                        <p className="truncate text-xs text-muted" title={bankLine}>{bankLine}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="truncate" title={driverLabel}><DriverLink id={tx.user_id}>{driverLabel}</DriverLink></p>
                      </td>
                      <td className="truncate px-4 py-3 font-mono text-xs" title={tx.transaction_reference}>{tx.transaction_reference}</td>
                      <td className="hidden truncate px-4 py-3 xl:table-cell" title={tx.narration ?? undefined}>{dash(tx.narration)}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted">No transactions match these filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-border p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <p className="text-sm text-muted">
            {pagination?.total_items ? `Showing ${rangeStart}-${rangeEnd} of ${pagination.total_items.toLocaleString()}` : "No transactions"}
            <span className="hidden sm:inline"> · {updatedAt ? `Updated ${formatDateTime(updatedAt.toISOString())}` : "Not updated yet"}</span>
          </p>
          <div className="flex items-center gap-2">
            <Button variant="secondary" disabled={!pagination?.has_prev} onClick={() => setPage((v) => Math.max(1, v - 1))} className="flex-1 sm:flex-none">Previous</Button>
            {pagination && pagination.total_pages > 1 && (
              <span className="shrink-0 px-1 text-sm tabular-nums text-muted">{pagination.page} / {pagination.total_pages}</span>
            )}
            <Button variant="secondary" disabled={!pagination?.has_next} onClick={() => setPage((v) => v + 1)} className="flex-1 sm:flex-none">Next</Button>
          </div>
        </div>
      </section>

      <Modal open={Boolean(selectedId)} onClose={() => setSelectedId(null)} title="Transaction details">
        {detail.isLoading ? (
          <div className="h-40 animate-pulse rounded-lg bg-subtle" />
        ) : selected ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-success-soft p-4">
              <p className="text-2xl font-semibold tabular-nums text-success">{naira(selected.amount)}</p>
              <p className="mt-1 text-sm text-muted">Paid {formatDateTime(selected.paid_at)}</p>
            </div>
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              {[
                ["Driver", driverNames.get(selected.user_id) ?? shortId(selected.user_id)],
                ["User ID", selected.user_id],
                ["Settlement", selected.settlement_amount == null ? "-" : naira(selected.settlement_amount)],
                ["Fee", fee == null ? "-" : naira(fee)],
                ["Payer", dash(selected.payer_name)],
                ["Payer account", dash(selected.payer_account_number)],
                ["Payer bank", dash(payerBank(selected))],
                ["Bank code", dash(selected.payer_bank_code)],
                ["Virtual account", dash(selected.virtual_account_id)],
                ["Payment ref", dash(selected.payment_reference)],
                ["Recorded", formatDateTime(selected.created_at)],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0 rounded-lg bg-subtle/60 p-3">
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd className="mt-1 font-medium [overflow-wrap:anywhere]">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-muted">Transaction reference</p>
                  <p className="break-all font-mono text-sm">{selected.transaction_reference}</p>
                </div>
                <CopyButton value={selected.transaction_reference} label="Copy transaction reference" />
              </div>
            </div>
            {selected.narration && (
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted">Narration</p>
                <p className="mt-1 text-sm [overflow-wrap:anywhere]">{selected.narration}</p>
              </div>
            )}
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
                    className="flex w-full min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3 text-left transition hover:border-brand/50 hover:bg-subtle"
                  >
                    <span className="min-w-0 flex-1">
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

      {exportOpen && (
        <ExportDialog
          onClose={() => setExportOpen(false)}
          isAdmin={isAdmin}
          generatedBy={`${user.first_name} ${user.last_name}`.trim() || user.username}
          initial={{ dateFrom, dateTo, userId, driverLabel: userId ? (driverNames.get(userId) ?? null) : null, searchTerm: search.trim() }}
        />
      )}

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
