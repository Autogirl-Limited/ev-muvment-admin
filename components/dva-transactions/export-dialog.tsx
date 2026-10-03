"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { DateRangePicker, dateLabel } from "@/components/ui/date-range-picker";
import { Modal, ModalActions } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/browser";
import {
  listDrivers,
  listDriversPage,
  listDvaTransactions,
  type DvaTransaction,
  type ListDvaTransactionsParams,
} from "@/lib/api/staff";
import { downloadBlob, toCsv, toXlsx, type Cell, type Sheet } from "@/lib/export/spreadsheet";
import { fullName, naira } from "@/lib/format";
import { useDebounced } from "@/lib/hooks/use-debounced";
import { queryKeys } from "@/lib/query/keys";

type Format = "xlsx" | "csv";

interface DriverInfo {
  name: string;
  username: string;
  phone: string | null;
}

interface Column {
  key: string;
  label: string;
  width: number;
  cell: (tx: DvaTransaction, driver: DriverInfo | undefined) => Cell;
  defaultOn?: boolean;
}

const fee = (tx: DvaTransaction) => (tx.settlement_amount == null ? null : tx.amount - tx.settlement_amount);

const COLUMNS: Column[] = [
  { key: "paid_at", label: "Paid at (Lagos)", width: 18, defaultOn: true, cell: (tx) => ({ kind: "date", value: tx.paid_at }) },
  { key: "amount", label: "Amount (NGN)", width: 14, defaultOn: true, cell: (tx) => ({ kind: "number", value: tx.amount, format: "money" }) },
  { key: "settlement", label: "Settled (NGN)", width: 14, defaultOn: true, cell: (tx) => ({ kind: "number", value: tx.settlement_amount, format: "money" }) },
  { key: "fee", label: "Fee (NGN)", width: 12, defaultOn: true, cell: (tx) => ({ kind: "number", value: fee(tx), format: "money" }) },
  { key: "driver", label: "Driver", width: 24, defaultOn: true, cell: (tx, driver) => ({ kind: "text", value: driver?.name ?? "" }) },
  { key: "driver_username", label: "Driver username", width: 18, cell: (_, driver) => ({ kind: "text", value: driver?.username }) },
  { key: "driver_phone", label: "Driver phone", width: 16, cell: (_, driver) => ({ kind: "text", value: driver?.phone }) },
  { key: "user_id", label: "Driver ID", width: 38, cell: (tx) => ({ kind: "text", value: tx.user_id }) },
  { key: "payer_name", label: "Payer name", width: 26, defaultOn: true, cell: (tx) => ({ kind: "text", value: tx.payer_name }) },
  { key: "payer_account", label: "Payer account", width: 15, defaultOn: true, cell: (tx) => ({ kind: "text", value: tx.payer_account_number }) },
  { key: "payer_bank", label: "Payer bank", width: 22, defaultOn: true, cell: (tx) => ({ kind: "text", value: tx.payer_bank_name ?? tx.payer_bank_code }) },
  { key: "payer_bank_code", label: "Bank code", width: 10, cell: (tx) => ({ kind: "text", value: tx.payer_bank_code }) },
  { key: "transaction_reference", label: "Transaction reference", width: 34, defaultOn: true, cell: (tx) => ({ kind: "text", value: tx.transaction_reference }) },
  { key: "payment_reference", label: "Payment reference", width: 30, cell: (tx) => ({ kind: "text", value: tx.payment_reference }) },
  { key: "narration", label: "Narration", width: 40, defaultOn: true, cell: (tx) => ({ kind: "text", value: tx.narration }) },
  { key: "currency", label: "Currency", width: 10, cell: (tx) => ({ kind: "text", value: tx.currency }) },
  { key: "virtual_account_id", label: "Virtual account ID", width: 38, cell: (tx) => ({ kind: "text", value: tx.virtual_account_id }) },
  { key: "id", label: "Transaction ID", width: 38, cell: (tx) => ({ kind: "text", value: tx.id }) },
  { key: "created_at", label: "Recorded at (Lagos)", width: 18, cell: (tx) => ({ kind: "date", value: tx.created_at }) },
];

const DEFAULT_COLUMNS = COLUMNS.filter((column) => column.defaultOn).map((column) => column.key);
const DRIVER_COLUMNS = new Set(["driver", "driver_username", "driver_phone"]);
const MAX_ROWS = 50_000;
const EXPORT_PAGE_SIZE = 100;
const CONCURRENCY = 4;
const PREFS_KEY = "dva-export-prefs";

interface Prefs {
  format: Format;
  columns: string[];
  summary: boolean;
}

function loadPrefs(): Prefs {
  const fallback: Prefs = { format: "xlsx", columns: DEFAULT_COLUMNS, summary: true };
  try {
    const saved = JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? "null") as Partial<Prefs> | null;
    if (!saved) return fallback;
    const known = new Set(COLUMNS.map((column) => column.key));
    const columns = (saved.columns ?? []).filter((key) => known.has(key));
    return {
      format: saved.format === "csv" ? "csv" : "xlsx",
      columns: columns.length ? columns : DEFAULT_COLUMNS,
      summary: saved.summary !== false,
    };
  } catch {
    return fallback;
  }
}

function savePrefs(prefs: Prefs) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {}
}

function parseAmount(text: string) {
  const value = Number(text.replace(/[,\s₦]/g, ""));
  return text.trim() && Number.isFinite(value) ? value : null;
}

/** Runs `tasks` with at most `limit` in flight, preserving result order. */
async function pooled<T>(tasks: Array<() => Promise<T>>, limit: number, onSettle: () => void) {
  const results = new Array<T>(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const index = next++;
      results[index] = await tasks[index]();
      onSettle();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

async function fetchAllDrivers(signal: AbortSignal) {
  const map = new Map<string, DriverInfo>();
  const add = (items: Awaited<ReturnType<typeof listDriversPage>>["items"]) =>
    items.forEach((driver) => map.set(driver.id, { name: fullName(driver), username: driver.username, phone: driver.phone_number }));
  const first = await listDriversPage(1, signal);
  add(first.items);
  const rest = Array.from({ length: Math.max(0, first.pagination.total_pages - 1) }, (_, index) => () => listDriversPage(index + 2, signal));
  (await pooled(rest, CONCURRENCY, () => {})).forEach((page) => add(page.items));
  return map;
}

function rangeText(from: string, to: string) {
  if (!from && !to) return "All time";
  if (from && to && from === to) return dateLabel(from);
  if (from && to) return `${dateLabel(from)} – ${dateLabel(to)}`;
  return from ? `From ${dateLabel(from)}` : `Until ${dateLabel(to)}`;
}

function fileName(from: string, to: string, driver: string | null, format: Format) {
  const range = !from && !to ? "all-time" : from === to ? from : `${from || "start"}_to_${to || "today"}`;
  const who = driver ? `_${driver.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}` : "";
  return `dva-transactions_${range}${who}.${format}`;
}

type Status =
  | { state: "idle" }
  | { state: "running"; step: string; done: number; total: number }
  | { state: "error"; message: string };

export interface ExportDialogProps {
  onClose: () => void;
  isAdmin: boolean;
  generatedBy: string;
  initial: {
    dateFrom: string;
    dateTo: string;
    userId: string;
    driverLabel: string | null;
    searchTerm: string;
  };
}

/** Mount only while open: each opening starts from the page's current filters. */
export function ExportDialog({ onClose, isAdmin, generatedBy, initial }: ExportDialogProps) {
  const toast = useToast();
  const [prefs] = useState(loadPrefs);
  const [format, setFormat] = useState<Format>(prefs.format);
  const [columns, setColumns] = useState<string[]>(prefs.columns);
  const [includeSummary, setIncludeSummary] = useState(prefs.summary);

  const [dateFrom, setDateFrom] = useState(initial.dateFrom);
  const [dateTo, setDateTo] = useState(initial.dateTo);
  const [userId, setUserId] = useState(initial.userId);
  const [driverLabel, setDriverLabel] = useState(initial.driverLabel);
  const [searchTerm, setSearchTerm] = useState(initial.searchTerm);
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");

  const [pickingDriver, setPickingDriver] = useState(false);
  const [driverQuery, setDriverQuery] = useState("");
  const debouncedDriverQuery = useDebounced(driverQuery);
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const debouncedSearch = useDebounced(searchTerm.trim());
  const filters = useMemo<Omit<ListDvaTransactionsParams, "page" | "page_size">>(
    () => ({
      userId: userId || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      searchTerm: debouncedSearch || undefined,
    }),
    [dateFrom, dateTo, debouncedSearch, userId],
  );

  const invalidRange = Boolean(dateFrom && dateTo && dateFrom > dateTo);
  const min = parseAmount(minAmount);
  const max = parseAmount(maxAmount);
  const invalidAmount = (minAmount.trim() !== "" && min === null) || (maxAmount.trim() !== "" && max === null) || (min !== null && max !== null && min > max);
  const amountFiltered = min !== null || max !== null;

  const countParams = useMemo(() => ({ ...filters, page: 1, page_size: 1 }), [filters]);
  const count = useQuery({
    queryKey: queryKeys.dvaTransactions.list(countParams),
    queryFn: ({ signal }) => listDvaTransactions(countParams, signal),
    enabled: !invalidRange,
  });
  const matching = count.data?.pagination.total_items;

  const drivers = useQuery({
    queryKey: queryKeys.users.drivers(debouncedDriverQuery),
    queryFn: ({ signal }) => listDrivers(debouncedDriverQuery, signal),
    enabled: isAdmin && pickingDriver,
    retry: false,
  });

  const running = status.state === "running";
  const tooMany = matching !== undefined && matching > MAX_ROWS;
  const canExport = !running && !invalidRange && !invalidAmount && columns.length > 0 && matching !== 0 && !count.isError;

  const toggleColumn = (key: string) =>
    setColumns((current) => (current.includes(key) ? current.filter((value) => value !== key) : COLUMNS.map((c) => c.key).filter((k) => k === key || current.includes(k))));

  const close = () => {
    abortRef.current?.abort();
    onClose();
  };

  const runExport = async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;
    savePrefs({ format, columns, summary: includeSummary });

    try {
      setStatus({ state: "running", step: "Fetching transactions", done: 0, total: matching ?? 0 });
      const params = { ...filters, searchTerm: searchTerm.trim() || undefined };
      const first = await listDvaTransactions({ ...params, page: 1, page_size: EXPORT_PAGE_SIZE }, signal);
      const totalPages = Math.min(first.pagination.total_pages, Math.ceil(MAX_ROWS / EXPORT_PAGE_SIZE));
      const total = Math.min(first.pagination.total_items, MAX_ROWS);
      let fetched = first.items.length;
      setStatus({ state: "running", step: "Fetching transactions", done: fetched, total });

      const pages = await pooled(
        Array.from({ length: Math.max(0, totalPages - 1) }, (_, index) => () =>
          listDvaTransactions({ ...params, page: index + 2, page_size: EXPORT_PAGE_SIZE }, signal).then((page) => {
            fetched += page.items.length;
            return page;
          }),
        ),
        CONCURRENCY,
        () => setStatus({ state: "running", step: "Fetching transactions", done: Math.min(fetched, total), total }),
      );

      // New payments can land mid-export and shift pages; de-duplicate by id.
      const seen = new Set<string>();
      const rows = [first, ...pages]
        .flatMap((page) => page.items)
        .filter((tx) => (seen.has(tx.id) ? false : (seen.add(tx.id), true)))
        .filter((tx) => (min === null || tx.amount >= min) && (max === null || tx.amount <= max))
        .slice(0, MAX_ROWS);

      if (!rows.length) {
        setStatus({ state: "error", message: "No transactions match these filters. Widen the date range or amount bounds." });
        return;
      }

      let driverMap = new Map<string, DriverInfo>();
      if (isAdmin && columns.some((key) => DRIVER_COLUMNS.has(key))) {
        setStatus({ state: "running", step: "Matching driver names", done: total, total });
        try {
          driverMap = await fetchAllDrivers(signal);
        } catch (error) {
          if (signal.aborted) throw error;
          // Names are a nicety; fall back to blank names rather than failing the export.
        }
      }
      const driverOf = (tx: DvaTransaction): DriverInfo | undefined =>
        driverMap.get(tx.user_id) ?? (userId === tx.user_id && driverLabel ? { name: driverLabel, username: "", phone: null } : undefined);

      setStatus({ state: "running", step: `Building ${format === "xlsx" ? "Excel" : "CSV"} file`, done: total, total });
      const chosen = COLUMNS.filter((column) => columns.includes(column.key));
      const sheet: Sheet = {
        name: "Transactions",
        header: chosen.map((column) => column.label),
        widths: chosen.map((column) => column.width),
        rows: rows.map((tx) => chosen.map((column) => column.cell(tx, driverOf(tx)))),
        table: true,
      };

      const name = fileName(dateFrom, dateTo, userId ? driverLabel : null, format);
      if (format === "csv") {
        downloadBlob(toCsv(sheet), name);
      } else {
        const sheets = [sheet];
        if (includeSummary) {
          const totalAmount = rows.reduce((sum, tx) => sum + tx.amount, 0);
          const settled = rows.reduce((sum, tx) => sum + (tx.settlement_amount ?? 0), 0);
          const text = (value: string): Cell => ({ kind: "text", value });
          const money = (value: number): Cell => ({ kind: "number", value, format: "money" });
          const integer = (value: number): Cell => ({ kind: "number", value, format: "integer" });
          sheets.push({
            name: "Summary",
            header: ["DVA transactions export", ""],
            widths: [26, 44],
            rows: [
              [text("Generated"), { kind: "date", value: new Date().toISOString() }],
              [text("Generated by"), text(generatedBy)],
              [text("Date range"), text(rangeText(dateFrom, dateTo))],
              [text("Driver"), text(userId ? (driverLabel ?? userId) : "All drivers")],
              [text("Search"), text(searchTerm.trim() || "None")],
              [text("Amount range"), text(amountFiltered ? `${min === null ? "Any" : naira(min)} – ${max === null ? "Any" : naira(max)}` : "Any")],
              [text(""), text("")],
              [text("Transactions"), integer(rows.length)],
              [text("Total received (NGN)"), money(totalAmount)],
              [text("Total settled (NGN)"), money(settled)],
              [text("Total fees (NGN)"), money(rows.reduce((sum, tx) => sum + (fee(tx) ?? 0), 0))],
              [text("Average transfer (NGN)"), money(totalAmount / rows.length)],
              [text("Drivers funded"), integer(new Set(rows.map((tx) => tx.user_id)).size)],
              ...(first.pagination.total_items > MAX_ROWS ? [[text("Note"), text(`Capped at the first ${MAX_ROWS.toLocaleString()} transactions.`)]] : []),
            ],
          });
        }
        downloadBlob(toXlsx(sheets), name);
      }

      toast.success(`Exported ${rows.length.toLocaleString()} transaction${rows.length === 1 ? "" : "s"} to ${format === "xlsx" ? "Excel" : "CSV"}.`);
      onClose();
    } catch (error) {
      if (signal.aborted) {
        setStatus({ state: "idle" });
        return;
      }
      setStatus({ state: "error", message: error instanceof ApiError ? error.message : "The export failed. Please try again." });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    setStatus({ state: "idle" });
  };

  const inputClass = "h-10 w-full rounded-lg border border-input bg-surface px-3 outline-none focus:border-brand focus:ring-3 focus:ring-brand/20 disabled:opacity-60";
  const percent = status.state === "running" && status.total > 0 ? Math.round((status.done / status.total) * 100) : 0;

  return (
    <Modal open onClose={close} title="Export transactions" size="lg">
      <div className="space-y-5">
        <fieldset disabled={running} className="space-y-5">
          {/* Format */}
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Format</p>
            <div role="radiogroup" aria-label="File format" className="grid grid-cols-2 gap-2">
              {([
                ["xlsx", "Excel", ".xlsx · formatted, with a summary sheet"],
                ["csv", "CSV", ".csv · plain text for any tool"],
              ] as const).map(([value, label, hint]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={format === value}
                  onClick={() => setFormat(value)}
                  className={`rounded-lg border p-3 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                    format === value ? "border-brand bg-brand/5 ring-1 ring-brand" : "border-border hover:bg-subtle"
                  }`}
                >
                  <span className="block text-sm font-semibold">{label}</span>
                  <span className="mt-0.5 block text-xs text-muted">{hint}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Filters */}
          <div className="space-y-3 rounded-lg border border-border p-3 sm:p-4">
            <p className="text-sm font-medium">What to include</p>

            <div className="space-y-1.5 text-sm">
              <span className="font-medium text-muted">Date range (Nigeria time)</span>
              <DateRangePicker
                from={dateFrom}
                to={dateTo}
                onApply={({ from, to }) => {
                  setDateFrom(from);
                  setDateTo(to);
                }}
                compact
              />
              {invalidRange && <p className="text-danger">The start date must be before or equal to the end date.</p>}
            </div>

            <div className="space-y-1.5 text-sm">
              <span className="font-medium text-muted">Driver</span>
              {pickingDriver ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      value={driverQuery}
                      onChange={(event) => setDriverQuery(event.target.value)}
                      placeholder="Search name, username, email or phone"
                      className={inputClass}
                    />
                    <Button variant="ghost" onClick={() => setPickingDriver(false)}>Cancel</Button>
                  </div>
                  <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border p-1">
                    {drivers.isLoading ? (
                      Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-12 animate-pulse rounded-md bg-subtle" />)
                    ) : drivers.data?.items.length ? (
                      drivers.data.items.map((driver) => (
                        <button
                          key={driver.id}
                          type="button"
                          onClick={() => {
                            setUserId(driver.id);
                            setDriverLabel(fullName(driver));
                            setPickingDriver(false);
                            setDriverQuery("");
                          }}
                          className="block w-full rounded-md px-3 py-2 text-left hover:bg-subtle"
                        >
                          <span className="block truncate font-medium">{fullName(driver)}</span>
                          <span className="block truncate text-xs text-muted">@{driver.username}{driver.phone_number ? ` · ${driver.phone_number}` : ""}</span>
                        </button>
                      ))
                    ) : (
                      <p className="p-4 text-center text-muted">No drivers found.</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex min-h-10 items-center gap-2 rounded-lg border border-input px-3 py-1.5">
                  <span className="min-w-0 flex-1 truncate">{userId ? (driverLabel ?? `Driver ...${userId.slice(-4)}`) : "All drivers"}</span>
                  {userId && (
                    <button type="button" onClick={() => { setUserId(""); setDriverLabel(null); }} className="rounded-md px-2 py-1 text-xs font-medium text-brand hover:bg-subtle">
                      All drivers
                    </button>
                  )}
                  {isAdmin && (
                    <button type="button" onClick={() => setPickingDriver(true)} className="rounded-md px-2 py-1 text-xs font-medium text-brand hover:bg-subtle">
                      {userId ? "Change" : "Choose driver"}
                    </button>
                  )}
                </div>
              )}
            </div>

            <label className="block space-y-1.5 text-sm">
              <span className="font-medium text-muted">Search</span>
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value.slice(0, 200))}
                placeholder="Payer, bank, reference or narration (optional)"
                className={inputClass}
              />
            </label>

            <div className="space-y-1.5 text-sm">
              <span className="font-medium text-muted">Amount (NGN)</span>
              <div className="grid grid-cols-2 gap-2">
                <input value={minAmount} onChange={(event) => setMinAmount(event.target.value)} inputMode="decimal" placeholder="Min" aria-label="Minimum amount" className={inputClass} />
                <input value={maxAmount} onChange={(event) => setMaxAmount(event.target.value)} inputMode="decimal" placeholder="Max" aria-label="Maximum amount" className={inputClass} />
              </div>
              {invalidAmount && <p className="text-danger">Enter valid amounts, with the minimum no higher than the maximum.</p>}
            </div>
          </div>

          {/* Columns */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">
                Columns <span className="font-normal text-muted">({columns.length} of {COLUMNS.length})</span>
              </p>
              <div className="flex gap-1 text-xs font-medium">
                <button type="button" onClick={() => setColumns(COLUMNS.map((column) => column.key))} className="rounded-md px-2 py-1 text-brand hover:bg-subtle">All</button>
                <button type="button" onClick={() => setColumns(DEFAULT_COLUMNS)} className="rounded-md px-2 py-1 text-brand hover:bg-subtle">Default</button>
                <button type="button" onClick={() => setColumns([])} className="rounded-md px-2 py-1 text-brand hover:bg-subtle">None</button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {COLUMNS.map((column) => {
                const on = columns.includes(column.key);
                return (
                  <button
                    key={column.key}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => toggleColumn(column.key)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                      on ? "border-brand bg-brand/10 text-foreground" : "border-border text-muted hover:bg-subtle"
                    }`}
                  >
                    {on && (
                      <svg viewBox="0 0 24 24" className="size-3.5 text-brand" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
                        <path d="m5 12 4 4L19 6" />
                      </svg>
                    )}
                    {column.label}
                  </button>
                );
              })}
            </div>
            {!columns.length && <p className="text-sm text-danger">Choose at least one column.</p>}
            {!isAdmin && columns.some((key) => DRIVER_COLUMNS.has(key)) && (
              <p className="text-xs text-muted">Driver name, username and phone are only filled in for admins.</p>
            )}
          </div>

          {format === "xlsx" && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={includeSummary} onChange={(event) => setIncludeSummary(event.target.checked)} className="mt-0.5 size-4 accent-brand" />
              <span>
                Add a summary sheet
                <span className="block text-xs text-muted">Filters used, totals received, settled and fees.</span>
              </span>
            </label>
          )}
        </fieldset>

        {/* Live match count / progress */}
        {status.state === "running" ? (
          <div className="space-y-2 rounded-lg bg-subtle/60 p-3 text-sm">
            <div className="flex justify-between gap-3">
              <span className="font-medium">{status.step}...</span>
              <span className="tabular-nums text-muted">
                {status.done.toLocaleString()} / {status.total.toLocaleString()}
              </span>
            </div>
            <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-2 overflow-hidden rounded-full bg-border">
              <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${percent}%` }} />
            </div>
          </div>
        ) : status.state === "error" ? (
          <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">{status.message}</p>
        ) : (
          <div aria-live="polite" className="rounded-lg bg-subtle/60 p-3 text-sm">
            {invalidRange ? (
              <span className="text-muted">Fix the date range to see how many transactions match.</span>
            ) : count.isLoading || count.isFetching ? (
              <span className="text-muted">Counting matching transactions...</span>
            ) : count.isError ? (
              <span className="text-danger">Couldn&apos;t count transactions. Check your connection and try again.</span>
            ) : matching === 0 ? (
              <span className="text-muted">No transactions match these filters.</span>
            ) : (
              <>
                <span className="font-semibold tabular-nums">{(matching ?? 0).toLocaleString()}</span>{" "}
                transaction{matching === 1 ? "" : "s"} match{matching === 1 ? "es" : ""}
                {amountFiltered && <span className="text-muted"> before the amount filter</span>}.
                {tooMany && (
                  <span className="mt-1 block text-danger">
                    Only the first {MAX_ROWS.toLocaleString()} will be exported. Narrow the date range to get the rest.
                  </span>
                )}
              </>
            )}
          </div>
        )}

        <ModalActions>
          {running ? (
            <Button variant="secondary" onClick={cancel} className="col-span-2 sm:col-span-1">Cancel export</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={close}>Close</Button>
              <Button onClick={runExport} disabled={!canExport}>
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
                </svg>
                Export {format === "xlsx" ? "Excel" : "CSV"}
              </Button>
            </>
          )}
        </ModalActions>
      </div>
    </Modal>
  );
}
