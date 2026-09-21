"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";

import { AccessDenied } from "@/components/dashboard/access-denied";
import { PageHeader } from "@/components/dashboard/page-header";
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
  const [resyncUserId, setResyncUserId] = useState("");
  const [resyncedAccount, setResyncedAccount] = useState<VirtualAccount | null>(null);
  const [confirmAll, setConfirmAll] = useState("");
  const [bulkResult, setBulkResult] = useState<BulkResyncResponse | null>(null);

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

  const setPreset = (preset: "today" | "yesterday" | "7" | "month" | "all") => {
    const today = lagosToday();
    if (preset === "all") {
      setDateFrom("");
      setDateTo("");
    } else if (preset === "today") {
      setDateFrom(today);
      setDateTo(today);
    } else if (preset === "yesterday") {
      const yesterday = addDays(today, -1);
      setDateFrom(yesterday);
      setDateTo(yesterday);
    } else if (preset === "7") {
      setDateFrom(addDays(today, -6));
      setDateTo(today);
    } else {
      setDateFrom(monthStart(today));
      setDateTo(today);
    }
    setPage(1);
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
      <PageHeader
        title="DVA transactions"
        description="Track successful inbound transfers into driver virtual accounts, reconcile by Nigeria-day ranges, and maintain DVAs when provider records drift."
      />

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
        <div className="space-y-4 border-b border-border p-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setPreset("today")}>Today</Button>
            <Button variant="secondary" onClick={() => setPreset("yesterday")}>Yesterday</Button>
            <Button variant="secondary" onClick={() => setPreset("7")}>Last 7 days</Button>
            <Button variant="secondary" onClick={() => setPreset("month")}>This month</Button>
            <Button variant="ghost" onClick={() => setPreset("all")}>All time</Button>
          </div>
          <div className="grid gap-3 lg:grid-cols-[repeat(5,minmax(0,1fr))]">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">From</span>
              <input type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} className="h-10 w-full rounded-lg border border-input bg-surface px-3 outline-none focus:border-brand focus:ring-3 focus:ring-brand/20" />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">To</span>
              <input type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} className="h-10 w-full rounded-lg border border-input bg-surface px-3 outline-none focus:border-brand focus:ring-3 focus:ring-brand/20" />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Search</span>
              <input value={search} onChange={(event) => { setSearch(event.target.value.slice(0, 200)); setPage(1); }} placeholder="Payer name, reference or narration" className="h-10 w-full rounded-lg border border-input bg-surface px-3 outline-none focus:border-brand focus:ring-3 focus:ring-brand/20" />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Driver ID</span>
              <input value={userId} onChange={(event) => { setUserId(event.target.value.trim()); setPage(1); }} placeholder="Filter by user id" className="h-10 w-full rounded-lg border border-input bg-surface px-3 font-mono text-xs outline-none focus:border-brand focus:ring-3 focus:ring-brand/20" />
            </label>
            <div className="flex items-end gap-2">
              <Button variant="secondary" onClick={() => transactions.refetch()} loading={transactions.isRefetching}>Refresh</Button>
              <Button variant="secondary" onClick={exportCsv} disabled={!transactions.data?.pagination.total_items}>CSV</Button>
            </div>
          </div>
          {invalidRange && <p className="text-sm text-danger">The start date must be before or equal to the end date.</p>}
          {isAdmin && (
            <div className="rounded-lg bg-subtle/50 p-3">
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">Find driver</span>
                <input value={driverSearch} onChange={(event) => setDriverSearch(event.target.value)} placeholder="Search driver directory" className="h-10 w-full rounded-lg border border-input bg-surface px-3 outline-none focus:border-brand focus:ring-3 focus:ring-brand/20" />
              </label>
              {drivers.data?.items.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {drivers.data.items.slice(0, 8).map((driver) => (
                    <button key={driver.id} type="button" onClick={() => { setUserId(driver.id); setPage(1); }} className="rounded-full border border-border bg-surface px-3 py-1 text-xs hover:bg-subtle">
                      {driverNames.get(driver.id)} · @{driver.username}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
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
                  <td colSpan={6} className="px-4 py-12 text-center text-muted">No DVA transactions match these filters.</td>
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

      {isAdmin && (
        <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-base font-semibold">DVA maintenance</h2>
              <p className="mt-1 text-sm text-muted">Recreating accounts changes driver bank numbers. Old numbers stop working while transaction history remains.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input value={resyncUserId} onChange={(event) => setResyncUserId(event.target.value.trim())} placeholder="Driver user id" className="h-10 rounded-lg border border-input bg-surface px-3 font-mono text-xs outline-none focus:border-brand focus:ring-3 focus:ring-brand/20 sm:w-80" />
              <Button variant="danger" disabled={!resyncUserId} loading={singleResync.isPending} onClick={() => singleResync.mutate(resyncUserId)}>Recreate one</Button>
              <Button variant="danger" disabled={confirmAll !== "RESYNC"} loading={bulkResync.isPending} onClick={() => bulkResync.mutate()}>Resync all</Button>
            </div>
          </div>
          <label className="mt-3 block text-sm">
            <span className="text-muted">Type RESYNC to enable bulk resync.</span>
            <input value={confirmAll} onChange={(event) => setConfirmAll(event.target.value)} className="mt-1 h-10 w-full max-w-xs rounded-lg border border-input bg-surface px-3 outline-none focus:border-brand focus:ring-3 focus:ring-brand/20" />
          </label>
        </section>
      )}

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

      <Modal open={Boolean(resyncedAccount)} onClose={() => setResyncedAccount(null)} title="New bank account">
        {resyncedAccount && <DvaCard account={resyncedAccount} />}
      </Modal>

      <Modal open={Boolean(bulkResult)} onClose={() => setBulkResult(null)} title="Bulk resync result">
        {bulkResult && (
          <div className="space-y-4">
            <p className="text-sm text-muted">{bulkResult.succeeded} succeeded, {bulkResult.failed} failed, {bulkResult.total} total.</p>
            <div className="max-h-80 overflow-auto rounded-lg border border-border">
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
