"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ConfigPageHeader, EmptyState, ErrorState, SearchInput, SkeletonRows } from "@/components/dashboard/screen-kit";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DriverLink } from "@/components/people/people-parts";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Modal, ModalActions } from "@/components/ui/modal";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { ApiError } from "@/lib/api/browser";
import { type DriverOption, listDriverOptions } from "@/lib/api/configuration";
import type { Paginated } from "@/lib/api/staff";
import {
  getTopupPreview,
  getWalletAllocation,
  getWalletStats,
  isAmbiguousLotGridsTimeout,
  listWalletAllocations,
  recordFreeGrant,
  retryWalletAllocation,
  type AllocationStatus,
  type AllocationType,
  type WalletAllocation,
} from "@/lib/api/wallet";
import { LAGOS, formatDateTime, fullName, naira } from "@/lib/format";
import { useDebounced } from "@/lib/hooks/use-debounced";
import { useUrlState } from "@/lib/hooks/use-url-state";
import { queryKeys } from "@/lib/query/keys";
import { useCurrentUser } from "@/lib/query/user";
import { useToast } from "@/components/ui/toast";

const STATUSES: AllocationStatus[] = ["PENDING_PAYMENT", "AWAITING_ALLOCATION", "COMPLETED", "CANCELLED", "EXPIRED"];
const TYPES: AllocationType[] = ["PAID_TOPUP", "FREE_GRANT"];
const PAGE_SIZE = 20;

const STATUS_LABELS: Record<AllocationStatus, string> = {
  PENDING_PAYMENT: "Pending payment",
  AWAITING_ALLOCATION: "Awaiting allocation",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
};

const TYPE_LABELS: Record<AllocationType, string> = {
  PAID_TOPUP: "Paid top-up",
  FREE_GRANT: "Free grant",
};

function lagosDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: LAGOS, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function labelStatus(status: AllocationStatus) {
  return STATUS_LABELS[status];
}

function statusTone(status: AllocationStatus) {
  if (status === "COMPLETED") return "success" as const;
  if (status === "CANCELLED" || status === "EXPIRED") return "danger" as const;
  if (status === "AWAITING_ALLOCATION") return "brand" as const;
  return "neutral" as const;
}

function amountCell(amount: number) {
  return <span className="tabular-nums font-semibold">{naira(amount)}</span>;
}

function driverLabel(driver?: DriverOption | null) {
  return driver ? fullName(driver) : "";
}

function shortId(id: string) {
  return id.slice(0, 8);
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
    </div>
  );
}

export function EVWalletPage() {
  const user = useCurrentUser();
  const isAdmin = user.user_type === "ADMIN";
  const url = useUrlState();
  const queryClient = useQueryClient();
  const [freeGrantOpen, setFreeGrantOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [retryTarget, setRetryTarget] = useState<WalletAllocation | null>(null);

  const allDates = url.get("range") === "all";
  const dateFrom = allDates ? "" : url.get("dateFrom") || lagosDate();
  const dateTo = allDates ? "" : url.get("dateTo") || lagosDate();
  const status = url.get("status") as AllocationStatus | "";
  const type = url.get("type") as AllocationType | "";
  const userId = url.get("userId");

  const statsFilters = useMemo(
    () => ({ userId: userId || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined }),
    [dateFrom, dateTo, userId],
  );
  const ledgerFilters = useMemo(
    () => ({
      page: url.page,
      page_size: PAGE_SIZE,
      status: STATUSES.includes(status as AllocationStatus) ? (status as AllocationStatus) : undefined,
      type: TYPES.includes(type as AllocationType) ? (type as AllocationType) : undefined,
      userId: userId || undefined,
    }),
    [status, type, url.page, userId],
  );

  const statsQuery = useQuery({
    queryKey: queryKeys.walletAllocations.stats(statsFilters),
    queryFn: ({ signal }) => getWalletStats(statsFilters, signal),
  });

  const queueQuery = useQuery({
    queryKey: queryKeys.walletAllocations.queue,
    queryFn: ({ signal }) => listWalletAllocations({ page: 1, page_size: 100, status: "AWAITING_ALLOCATION" }, signal),
    enabled: isAdmin,
    refetchInterval: 60_000,
  });

  const ledgerQuery = useQuery({
    queryKey: queryKeys.walletAllocations.list(ledgerFilters),
    queryFn: ({ signal }) => listWalletAllocations(ledgerFilters, signal),
    enabled: isAdmin,
  });

  const driverMapQuery = useQuery({
    queryKey: queryKeys.users.assignableDrivers("__wallet_names__"),
    queryFn: ({ signal }) => listDriverOptions("", signal),
    staleTime: 5 * 60_000,
    enabled: isAdmin,
  });

  const driverMap = useMemo(() => new Map((driverMapQuery.data?.items ?? []).map((driver) => [driver.id, driver])), [driverMapQuery.data]);
  const queue = useMemo(
    () => [...(queueQuery.data?.items ?? [])].sort((a, b) => new Date(a.paid_at ?? a.created_at).getTime() - new Date(b.paid_at ?? b.created_at).getTime()),
    [queueQuery.data],
  );
  const queueTotal = queue.reduce((sum, allocation) => sum + allocation.amount, 0);

  const refreshWallet = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.walletAllocations.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
  };

  const applyRange = ({ from, to }: { from: string; to: string }) => {
    if (!from) return url.set({ range: "all", dateFrom: null, dateTo: null });
    url.set({ range: null, dateFrom: from, dateTo: to });
  };

  return (
    <div className="mx-auto max-w-7xl">
      <ConfigPageHeader
        title="EV Wallet"
        icon="bolt"
        showBackLink={false}
        description="Track wallet credits, free grants and paid top-ups. Credit is sent to LotGrids automatically; only failed allocations need attention."
        actions={
          <>
            <DateRangePicker compact align="end" from={dateFrom} to={dateTo} onApply={applyRange} className="min-w-full sm:min-w-0 sm:w-72" />
            {isAdmin && <Button onClick={() => setFreeGrantOpen(true)}>Free grant</Button>}
          </>
        }
      />

      {statsQuery.isError ? (
        <ErrorState message={errorMessage(statsQuery.error, "Wallet stats are unavailable.")} onRetry={() => statsQuery.refetch()} />
      ) : (
        <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total credited" value={statsQuery.isLoading ? "..." : naira(statsQuery.data?.total_credited ?? 0)} hint={`${statsQuery.data?.total_count ?? 0} allocations`} />
          <StatCard label="Pending" value={statsQuery.isLoading ? "..." : naira(statsQuery.data?.pending_amount ?? 0)} hint={`${statsQuery.data?.pending_count ?? 0} waiting`} />
          <StatCard label="Free grants" value={statsQuery.isLoading ? "..." : naira(statsQuery.data?.total_free_grants ?? 0)} hint={userId ? "Selected driver" : `${statsQuery.data?.unique_drivers ?? 0} drivers`} />
          <StatCard label="kWh allocated" value={statsQuery.isLoading ? "..." : `${(statsQuery.data?.total_kwh_allocated ?? 0).toLocaleString()} kWh`} hint={`Avg ${naira(statsQuery.data?.average_topup_amount ?? 0)}`} />
        </section>
      )}

      {!isAdmin && (
        <Alert>
          Your role can view EV Wallet performance stats. Admin-only failed allocations, ledger details, free grants and retries are hidden.
        </Alert>
      )}

      {isAdmin && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(20rem,25rem)_minmax(0,1fr)]">
          <AllocationQueue
            allocations={queue}
            total={queueTotal}
            loading={queueQuery.isLoading}
            error={queueQuery.error}
            driverMap={driverMap}
            onReload={() => queueQuery.refetch()}
            onRetry={setRetryTarget}
          />
          <Ledger
            data={ledgerQuery.data}
            loading={ledgerQuery.isLoading}
            error={ledgerQuery.error}
            status={status}
            type={type}
            driver={userId ? driverMap.get(userId) : undefined}
            driverMap={driverMap}
            onRetry={() => ledgerQuery.refetch()}
            onPage={(page) => url.set({ page })}
            onFilter={(updates) => url.set(updates)}
            onOpen={setDetailId}
          />
        </div>
      )}

      {isAdmin && <FreeGrantDialog open={freeGrantOpen} onClose={() => setFreeGrantOpen(false)} onChanged={refreshWallet} />}
      {isAdmin && <AllocationDetail id={detailId} onClose={() => setDetailId(null)} driver={detailId ? driverMap.get(ledgerQuery.data?.items.find((item) => item.id === detailId)?.user_id ?? "") : undefined} />}
      {isAdmin && <RetryAllocationDialog allocation={retryTarget} onClose={() => setRetryTarget(null)} onChanged={refreshWallet} />}
    </div>
  );
}

function AllocationQueue({
  allocations,
  total,
  loading,
  error,
  driverMap,
  onReload,
  onRetry,
}: {
  allocations: WalletAllocation[];
  total: number;
  loading: boolean;
  error: unknown;
  driverMap: Map<string, DriverOption>;
  onReload: () => void;
  onRetry: (allocation: WalletAllocation) => void;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface">
      <div className="border-b border-border p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Failed allocations</h2>
            <p className="mt-1 text-sm text-muted">Paid top-ups that LotGrids didn&apos;t accept. Fix the cause (usually the fleet wallet balance), then retry. Oldest first.</p>
          </div>
          <Badge tone="brand">{naira(total)}</Badge>
        </div>
      </div>
      {loading ? (
        <SkeletonRows rows={4} columns={2} />
      ) : error ? (
        <ErrorState message={errorMessage(error, "Failed allocations unavailable.")} onRetry={onReload} />
      ) : allocations.length === 0 ? (
        <EmptyState icon="check" title="Nothing needs attention">Paid top-ups are allocated to LotGrids automatically. Any that fail will appear here.</EmptyState>
      ) : (
        <div className="divide-y divide-border">
          {allocations.map((allocation) => {
            const driver = driverMap.get(allocation.user_id);
            return (
              <div key={allocation.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold"><DriverLink id={allocation.user_id}>{driver ? driverLabel(driver) : `Driver ${shortId(allocation.user_id)}`}</DriverLink></p>
                    <p className="mt-1 text-xs text-muted">{allocation.paid_at ? `Paid ${formatDateTime(allocation.paid_at)}` : `Created ${formatDateTime(allocation.created_at)}`}</p>
                  </div>
                  {amountCell(allocation.amount)}
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-sm text-muted tabular-nums">{allocation.kwh_equivalent.toLocaleString()} kWh</span>
                  <Button onClick={() => onRetry(allocation)} className="h-9 px-3">Retry allocation</Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Ledger({
  data,
  loading,
  error,
  status,
  type,
  driver,
  driverMap,
  onRetry,
  onPage,
  onFilter,
  onOpen,
}: {
  data: Paginated<WalletAllocation> | undefined;
  loading: boolean;
  error: unknown;
  status: string;
  type: string;
  driver?: DriverOption;
  driverMap: Map<string, DriverOption>;
  onRetry: () => void;
  onPage: (page: number) => void;
  onFilter: (updates: Record<string, string | number | null>) => void;
  onOpen: (id: string) => void;
}) {
  const [driverPickerOpen, setDriverPickerOpen] = useState(false);

  return (
    <section className="rounded-lg border border-border bg-surface">
      <div className="space-y-3 border-b border-border p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="font-semibold">Wallet ledger</h2>
            <p className="mt-1 text-sm text-muted">Server filters by status, type and driver.</p>
          </div>
          <Button variant="secondary" onClick={() => onFilter({ status: null, type: null, userId: null, page: null })}>Clear filters</Button>
        </div>
        <div className="grid gap-2 md:grid-cols-4">
          <Select label="Status" hideLabel value={status} onChange={(event) => onFilter({ status: event.target.value || null })}>
            <option value="">All statuses</option>
            {STATUSES.map((item) => <option key={item} value={item}>{labelStatus(item)}</option>)}
          </Select>
          <Select label="Type" hideLabel value={type} onChange={(event) => onFilter({ type: event.target.value || null })}>
            <option value="">All types</option>
            {TYPES.map((item) => <option key={item} value={item}>{TYPE_LABELS[item]}</option>)}
          </Select>
          <Button variant="secondary" onClick={() => setDriverPickerOpen(true)}>{driver ? driverLabel(driver) : "Choose driver"}</Button>
          {status === "EXPIRED" && <Alert tone="info">Expired allocations may still change after gateway reconciliation.</Alert>}
        </div>
      </div>

      {loading ? (
        <SkeletonRows rows={6} columns={5} />
      ) : error ? (
        <ErrorState message={errorMessage(error, "Ledger unavailable.")} onRetry={onRetry} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState icon="bolt" title="No allocations found">Adjust the filters or date range to inspect a different slice.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-subtle/60 text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Driver</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.items.map((allocation) => {
                const found = driverMap.get(allocation.user_id);
                return (
                  <tr key={allocation.id} onClick={() => onOpen(allocation.id)} className="cursor-pointer transition hover:bg-subtle/70">
                    <td className="px-4 py-3">
                      <p className="font-medium"><DriverLink id={allocation.user_id}>{found ? driverLabel(found) : `Driver ${shortId(allocation.user_id)}`}</DriverLink></p>
                      <p className="mt-0.5 text-xs text-muted">{shortId(allocation.id)}</p>
                    </td>
                    <td className="px-4 py-3">{TYPE_LABELS[allocation.type]}</td>
                    <td className="px-4 py-3"><Badge tone={statusTone(allocation.status)}>{labelStatus(allocation.status)}</Badge></td>
                    <td className="px-4 py-3 text-right">{amountCell(allocation.amount)}</td>
                    <td className="px-4 py-3 text-muted">{formatDateTime(allocation.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pagination pagination={data?.pagination} noun="allocations" onPage={onPage} />
      <DriverPickerModal
        open={driverPickerOpen}
        onClose={() => setDriverPickerOpen(false)}
        onPick={(picked) => {
          onFilter({ userId: picked.id });
          setDriverPickerOpen(false);
        }}
      />
    </section>
  );
}

function DriverPickerModal({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (driver: DriverOption) => void }) {
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search.trim());
  const query = useQuery({
    queryKey: queryKeys.users.assignableDrivers(debounced),
    queryFn: ({ signal }) => listDriverOptions(debounced, signal),
    enabled: open,
  });

  return (
    <Modal open={open} onClose={onClose} title="Choose driver" size="lg">
      <SearchInput value={search} onChange={setSearch} placeholder="Search by driver name, username or phone" />
      <div className="max-h-[22rem] overflow-y-auto rounded-lg border border-border">
        {query.isLoading ? (
          <SkeletonRows rows={5} columns={2} />
        ) : query.data?.items.length ? (
          <div className="divide-y divide-border">
            {query.data.items.map((driver) => (
              <button key={driver.id} type="button" onClick={() => onPick(driver)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-subtle">
                <span>
                  <span className="block font-medium">{driverLabel(driver)}</span>
                  <span className="block text-sm text-muted">{driver.vehicle ? driver.vehicle.name : "No vehicle assigned"}</span>
                </span>
                {!driver.vehicle && <Badge tone="danger">No vehicle</Badge>}
              </button>
            ))}
          </div>
        ) : (
          <EmptyState icon="search" title="No drivers found" />
        )}
      </div>
    </Modal>
  );
}

/** Records a free grant. Pass `presetDriver` (e.g. from a driver page) to skip the driver search. */
export function FreeGrantDialog({ open, onClose, onChanged, presetDriver }: { open: boolean; onClose: () => void; onChanged: () => void; presetDriver?: DriverOption }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<DriverOption | null>(null);
  const driver = presetDriver ?? picked;
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A timed-out grant may have moved money already, so block another attempt until the admin has checked.
  const [ambiguous, setAmbiguous] = useState(false);
  const debounced = useDebounced(search.trim());
  const numericAmount = Math.floor(Number(amount));

  const driversQuery = useQuery({
    queryKey: queryKeys.users.assignableDrivers(debounced),
    queryFn: ({ signal }) => listDriverOptions(debounced, signal),
    enabled: open && !presetDriver,
  });

  const previewQuery = useQuery({
    queryKey: ["wallet-topup-preview", numericAmount],
    queryFn: ({ signal }) => getTopupPreview(numericAmount, signal),
    enabled: open && Number.isFinite(numericAmount) && numericAmount > 0,
  });

  const grantMutation = useMutation({
    mutationFn: () => recordFreeGrant({ user_id: driver!.id, amount: numericAmount, notes: notes.trim() || undefined }),
    onSuccess: () => {
      toast.success("Free grant allocated and wallet credited.");
      queryClient.invalidateQueries({ queryKey: queryKeys.walletAllocations.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      onChanged();
      setConfirmOpen(false);
      onClose();
      setPicked(null);
      setAmount("");
      setNotes("");
      setError(null);
      setAmbiguous(false);
    },
    onError: (err) => {
      const message = errorMessage(err, "Could not allocate this grant.");
      if (err instanceof ApiError && err.status === 502 && isAmbiguousLotGridsTimeout(message)) {
        setAmbiguous(true);
        setError(`${message}. Do not retry yet: the money may already have moved. Check the driver's balance and the ledger first.`);
        // The transfer may have gone through; pull fresh balances and ledger.
        onChanged();
      } else {
        setError(message);
      }
      setConfirmOpen(false);
    },
  });

  const invalid = ambiguous || !driver || !driver.vehicle || !Number.isFinite(numericAmount) || numericAmount <= 0 || notes.length > 500;

  return (
    <>
      <Modal
        open={open && !confirmOpen}
        onClose={
          grantMutation.isPending
            ? () => {}
            : () => {
                setAmbiguous(false);
                setError(null);
                onClose();
              }
        }
        title="Free grant"
        size="lg"
      >
        <div className="space-y-4">
          <Alert>Free grants move money from the LotGrids fleet wallet to the driver&apos;s LotGrids wallet and credit it here immediately. They cannot be reversed from this screen.</Alert>
          {presetDriver ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-subtle/50 px-4 py-3">
              <span>
                <span className="block font-medium">{driverLabel(presetDriver)}</span>
                <span className="block text-sm text-muted">{presetDriver.vehicle ? presetDriver.vehicle.name : "No vehicle assigned"}</span>
              </span>
              {!presetDriver.vehicle && <Badge tone="danger">No vehicle</Badge>}
            </div>
          ) : (
            <>
          <SearchInput value={search} onChange={setSearch} placeholder="Search driver" />
          <div className="max-h-48 overflow-y-auto rounded-lg border border-border">
            {driversQuery.isLoading ? (
              <SkeletonRows rows={3} columns={2} />
            ) : driversQuery.data?.items.length ? (
              <div className="divide-y divide-border">
                {driversQuery.data.items.map((item) => (
                  <button key={item.id} type="button" onClick={() => setPicked(item)} className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-subtle ${driver?.id === item.id ? "bg-brand-soft" : ""}`}>
                    <span>
                      <span className="block font-medium">{driverLabel(item)}</span>
                      <span className="block text-sm text-muted">{item.vehicle ? item.vehicle.name : "No vehicle assigned"}</span>
                    </span>
                    {!item.vehicle && <Badge tone="danger">No vehicle</Badge>}
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState icon="search" title="No drivers found" />
            )}
          </div>
            </>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm font-medium">
              Amount
              <input type="number" min="1" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-brand focus:ring-3 focus:ring-brand/20" placeholder="Whole naira" />
            </label>
            <div className="rounded-lg border border-border bg-subtle px-3 py-2 text-sm">
              <p className="text-muted">Preview</p>
              <p className="mt-1 font-semibold">{previewQuery.data ? `${previewQuery.data.kwh_equivalent.toLocaleString()} kWh at ${naira(previewQuery.data.rate_per_kwh, 2)}/kWh` : "Enter an amount"}</p>
            </div>
          </div>
          <label className="text-sm font-medium">
            Notes
            <textarea value={notes} onChange={(event) => setNotes(event.target.value.slice(0, 500))} rows={3} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-brand focus:ring-3 focus:ring-brand/20" />
            <span className="mt-1 block text-xs text-muted">{notes.length}/500</span>
          </label>
          {driver && !driver.vehicle && <Alert tone="error">This driver has no assigned vehicle. The API will reject free grants until a vehicle is assigned.</Alert>}
          {error && <Alert tone="error">{error}</Alert>}
        </div>
        <ModalActions>
          <Button variant="secondary" onClick={() => { setAmbiguous(false); setError(null); onClose(); }} disabled={grantMutation.isPending}>Cancel</Button>
          <Button onClick={() => { setError(null); setConfirmOpen(true); }} disabled={invalid}>Review grant</Button>
        </ModalActions>
      </Modal>
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Confirm free grant"
        confirmLabel="Allocate grant"
        tone="primary"
        loading={grantMutation.isPending}
        error={error}
        onConfirm={() => {
          setError(null);
          grantMutation.mutate();
        }}
      >
        <p>
          Send {naira(numericAmount || 0)} from the LotGrids fleet wallet to {driver ? driverLabel(driver) : "this driver"}. This credits their EV wallet immediately and cannot be undone.
        </p>
      </ConfirmDialog>
    </>
  );
}

function AllocationDetail({ id, onClose, driver }: { id: string | null; onClose: () => void; driver?: DriverOption }) {
  const query = useQuery({
    queryKey: queryKeys.walletAllocations.detail(id ?? ""),
    queryFn: ({ signal }) => getWalletAllocation(id!, signal),
    enabled: Boolean(id),
  });
  const allocation = query.data;

  return (
    <Modal open={Boolean(id)} onClose={onClose} title="Allocation details" size="lg">
      {query.isLoading ? (
        <SkeletonRows rows={5} columns={2} />
      ) : query.isError || !allocation ? (
        <ErrorState message={errorMessage(query.error, "Allocation unavailable.")} onRetry={() => query.refetch()} />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-muted">{driver ? driverLabel(driver) : `Driver ${shortId(allocation.user_id)}`}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{naira(allocation.amount)}</p>
            </div>
            <Badge tone={statusTone(allocation.status)}>{labelStatus(allocation.status)}</Badge>
          </div>
          <dl className="grid gap-3 sm:grid-cols-2">
            <Detail label="Type" value={TYPE_LABELS[allocation.type]} />
            <Detail label="kWh equivalent" value={`${allocation.kwh_equivalent.toLocaleString()} kWh`} />
            <Detail label="Rate" value={naira(allocation.rate_per_kwh, 2)} />
            <Detail label="Created" value={formatDateTime(allocation.created_at)} />
            <Detail label="Paid" value={allocation.paid_at ? formatDateTime(allocation.paid_at) : "Not paid"} />
            {allocation.type === "PAID_TOPUP" && (
              <Detail
                label="LotGrids allocation"
                value={
                  allocation.status !== "COMPLETED"
                    ? allocation.status === "AWAITING_ALLOCATION" ? "Not allocated yet" : "Not allocated"
                    : allocation.confirmed_by
                      ? `Retried by an admin${allocation.confirmed_at ? ` · ${formatDateTime(allocation.confirmed_at)}` : ""}`
                      : "Automatic"
                }
              />
            )}
            <Detail label="Payment reference" value={allocation.payment_reference ?? "None"} />
            <Detail label="Checkout reference" value={allocation.checkout_transaction_reference ?? "None"} />
            <Detail label="Checkout account" value={allocation.checkout_account_number ? `${allocation.checkout_account_name ?? ""} ${allocation.checkout_account_number}`.trim() : "None"} />
            <Detail label="Checkout bank" value={allocation.checkout_bank_name ?? "None"} />
          </dl>
          {allocation.notes && <Alert>{allocation.notes}</Alert>}
        </div>
      )}
    </Modal>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-subtle px-3 py-2">
      <dt className="text-xs font-medium uppercase tracking-wider text-muted">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium">{value}</dd>
    </div>
  );
}

function RetryAllocationDialog({ allocation, onClose, onChanged }: { allocation: WalletAllocation | null; onClose: () => void; onChanged: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => retryWalletAllocation(allocation!.id),
    onSuccess: (updated) => {
      toast.success("Allocation completed and wallet credited.");
      queryClient.setQueryData(queryKeys.walletAllocations.detail(updated.id), updated);
      onChanged();
      setError(null);
      onClose();
    },
    onError: (err) => {
      const message = errorMessage(err, "Could not retry this allocation.");
      // 409 means it was already handled (or is no longer awaiting); refetch to show its real state.
      if (err instanceof ApiError && err.status === 409) onChanged();
      setError(message);
    },
  });

  return (
    <ConfirmDialog
      open={Boolean(allocation)}
      onClose={() => {
        setError(null);
        onClose();
      }}
      title="Retry LotGrids allocation"
      confirmLabel="Retry allocation"
      tone="primary"
      loading={mutation.isPending}
      error={error}
      onConfirm={() => {
        setError(null);
        mutation.mutate();
      }}
    >
      <p>
        {allocation ? naira(allocation.amount) : "This amount"} was paid but could not be allocated to the driver on LotGrids. Make sure the fleet wallet on the LotGrids Partner Dashboard has enough balance, then retry. The driver&apos;s wallet is credited as soon as it goes through.
      </p>
    </ConfirmDialog>
  );
}
