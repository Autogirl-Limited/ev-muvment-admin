"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { MATCH_LABELS, money, StatusBadge, VarianceText } from "@/components/bolt-reconciliations/parts";
import { EmptyState, Icon, SearchInput } from "@/components/dashboard/screen-kit";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ModalActions } from "@/components/ui/modal";
import type { BoltRow, Reconciliation, ReconciliationEntry } from "@/lib/api/bolt-reconciliations";
import { listDrivers } from "@/lib/api/staff";
import { fullName } from "@/lib/format";
import { useDebounced } from "@/lib/hooks/use-debounced";
import { CACHE } from "@/lib/query/cache";
import { queryKeys } from "@/lib/query/keys";

export function entryName(entry: ReconciliationEntry) {
  return entry.driver ? fullName(entry.driver) : entry.bolt.driver_name || entry.bolt.email || entry.bolt.phone || `Row ${entry.row_number}`;
}

/** Plain-language reading of one entry, for the drawer header. */
function explain(entry: ReconciliationEntry): string {
  const cash = money(entry.collected_cash);
  const paid = money(entry.dva_amount);
  switch (entry.status) {
    case "SHORT":
      return `Collected ${cash} in cash on Bolt but only ${paid} reached their DVA, so ${money(Math.abs(entry.variance ?? 0))} is missing.`;
    case "OVER":
      return `Collected ${cash} in cash on Bolt and paid ${paid} into their DVA, ${money(entry.variance ?? 0)} more than needed.`;
    case "BALANCED":
      return `Collected ${cash} in cash and paid ${paid} into their DVA. That's within ₦1, so it balances.`;
    case "NO_CASH":
      return "No cash was collected on Bolt and nothing was paid in, so there's nothing to check.";
    case "UNMATCHED":
      return `Bolt says ${cash} was collected, but this row's email and phone don't belong to any driver here. Link it to the right driver to check it.`;
    case "DUPLICATE":
      return "This driver appears more than once in the report. Their cash from every row is compared on their first row.";
    case "NOT_IN_REPORT":
      return `Received ${paid} into their DVA during this period but isn't in the Bolt report. Check whether they drove under another Bolt account.`;
  }
}

function Figure({ label, children, sub, tone = "" }: { label: string; children: ReactNode; sub?: ReactNode; tone?: string }) {
  return (
    <div className="rounded-xl bg-subtle/60 p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${tone}`}>{children}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium">{children ?? <span className="text-muted">-</span>}</dd>
    </div>
  );
}

const num = (value: number | null, suffix = "") => (value === null ? null : `${new Intl.NumberFormat("en-NG", { maximumFractionDigits: 2 }).format(value)}${suffix}`);
const cash = (value: number | null) => (value === null ? null : money(value));

function hours(minutes: number | null) {
  if (minutes === null) return null;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}

function BoltFacts({ bolt }: { bolt: BoltRow }) {
  return (
    <dl className="divide-y divide-border">
      <Fact label="Name on Bolt">{bolt.driver_name}</Fact>
      <Fact label="Email on Bolt">{bolt.email}</Fact>
      <Fact label="Phone on Bolt">{bolt.phone}</Fact>
      <Fact label="Bolt driver ID">{bolt.bolt_driver_id}</Fact>
      <Fact label="Finished rides">{num(bolt.finished_rides)}</Fact>
      <Fact label="Online time">{hours(bolt.online_time_minutes)}</Fact>
      <Fact label="Gross earnings (cash)">{cash(bolt.gross_earnings_cash)}</Fact>
      <Fact label="Gross earnings (in-app)">{cash(bolt.gross_earnings_in_app)}</Fact>
      <Fact label="Gross earnings (total)">{cash(bolt.gross_earnings_total)}</Fact>
      <Fact label="Commission">{cash(bolt.commission_fees)}</Fact>
      <Fact label="Net earnings">{cash(bolt.net_earnings)}</Fact>
      <Fact label="Rating">{num(bolt.average_driver_rating)}</Fact>
    </dl>
  );
}

/** Everything about one row: the numbers, why it has its status, Bolt's data, and what to do next. */
export function EntryDetail({
  entry,
  report,
  isAdmin,
  onLink,
  onUnlink,
  unlinking,
}: {
  entry: ReconciliationEntry;
  report: Reconciliation;
  isAdmin: boolean;
  onLink: () => void;
  onUnlink: () => void;
  unlinking: boolean;
}) {
  const [showRaw, setShowRaw] = useState(false);
  const linkable = isAdmin && entry.row_number !== null;
  const dvaHref = entry.driver
    ? `/dva-transactions?userId=${entry.driver.id}&dateFrom=${report.period_start}&dateTo=${report.period_end}`
    : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={entry.status} />
        <span className="text-xs text-muted">
          {MATCH_LABELS[entry.match_method]}
          {entry.row_number !== null && ` · row ${entry.row_number} of the file`}
        </span>
      </div>

      <p className="text-sm">{explain(entry)}</p>

      <div className="grid grid-cols-3 gap-2">
        <Figure label="Collected on Bolt">{money(entry.collected_cash)}</Figure>
        <Figure label="Paid into DVA" sub={`${entry.dva_transaction_count} ${entry.dva_transaction_count === 1 ? "transfer" : "transfers"}`}>
          {money(entry.dva_amount)}
        </Figure>
        <Figure label="Difference">
          <VarianceText value={entry.variance} />
        </Figure>
      </div>

      {entry.driver ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3.5">
          <div className="min-w-0">
            <p className="text-xs text-muted">Driver</p>
            <p className="truncate font-medium">{fullName(entry.driver)}</p>
            <p className="truncate text-xs text-muted">{[entry.driver.email, entry.driver.phone_number].filter(Boolean).join(" · ") || `@${entry.driver.username}`}</p>
          </div>
          {isAdmin && (
            <Link href={`/drivers/${entry.driver.id}`} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand hover:underline">
              Profile
              <Icon name="arrowRight" className="size-3.5" />
            </Link>
          )}
        </div>
      ) : (
        <Alert tone="info">This row isn&apos;t tied to a driver yet, so their DVA can&apos;t be checked.</Alert>
      )}

      <div className="grid gap-2 sm:flex sm:flex-wrap">
        {linkable && (
          <Button variant={entry.status === "UNMATCHED" ? "primary" : "secondary"} onClick={onLink}>
            <Icon name="link" className="size-4" />
            {entry.driver ? "Link to a different driver" : "Link driver"}
          </Button>
        )}
        {linkable && entry.match_method === "MANUAL" && (
          <Button variant="secondary" onClick={onUnlink} loading={unlinking}>
            <Icon name="unlink" className="size-4" />
            Remove manual link
          </Button>
        )}
        {dvaHref && (
          <Link
            href={dvaHref}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-medium transition hover:bg-subtle pointer-coarse:h-11"
          >
            View DVA transfers
            <Icon name="arrowRight" className="size-4" />
          </Link>
        )}
      </div>

      {entry.status !== "NOT_IN_REPORT" && (
        <section>
          <h3 className="text-sm font-semibold">From the Bolt report</h3>
          <BoltFacts bolt={entry.bolt} />
          {entry.raw_row && (
            <div className="mt-2">
              <button type="button" onClick={() => setShowRaw((value) => !value)} aria-expanded={showRaw} className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
                <Icon name="chevronRight" className={`size-3.5 transition ${showRaw ? "rotate-90" : ""}`} />
                {showRaw ? "Hide" : "Show"} every column from the file
              </button>
              {showRaw && (
                <dl className="mt-2 max-h-72 divide-y divide-border overflow-y-auto rounded-xl border border-border px-3">
                  {Object.entries(entry.raw_row).map(([key, value]) => (
                    <Fact key={key} label={key}>{value === null || value === "" ? null : String(value)}</Fact>
                  ))}
                </dl>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/** First word of Bolt's name; full names rarely match ours ("Rasheed Ayinde Adewole" vs "Rasheed Adewole"). */
function firstSearch(entry: ReconciliationEntry) {
  return entry.bolt.driver_name?.trim().split(/\s+/)[0] ?? entry.bolt.email ?? "";
}

export function LinkDriverDialog({
  entry,
  onCancel,
  onPick,
  pending,
  error,
}: {
  entry: ReconciliationEntry;
  onCancel: () => void;
  onPick: (driver: { id: string; name: string }) => void;
  pending: string | null;
  error: string | null;
}) {
  const [search, setSearch] = useState(() => firstSearch(entry));
  const term = useDebounced(search.trim());
  const drivers = useQuery({
    queryKey: queryKeys.users.drivers(term),
    queryFn: ({ signal }) => listDrivers(term, signal),
    placeholderData: keepPreviousData,
    ...CACHE.live,
  });

  const hints = [
    ["Name", entry.bolt.driver_name],
    ["Email", entry.bolt.email],
    ["Phone", entry.bolt.phone],
  ].filter((pair): pair is [string, string] => Boolean(pair[1]));
  const people = drivers.data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-subtle/60 p-3.5">
        <p className="text-xs font-medium uppercase text-muted">On the Bolt report</p>
        <dl className="mt-1.5 space-y-1 text-sm">
          {hints.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3">
              <dt className="text-muted">{label}</dt>
              <dd className="flex min-w-0 items-center gap-2">
                <span className="truncate font-medium">{value}</span>
                <button type="button" onClick={() => setSearch(value)} className="shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium text-brand hover:bg-surface">
                  Search
                </button>
              </dd>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">Collected cash</dt>
            <dd className="font-semibold tabular-nums">{money(entry.collected_cash)}</dd>
          </div>
        </dl>
      </div>

      <SearchInput value={search} onChange={setSearch} placeholder="Search drivers by name, username, email or phone" label="Search drivers" />

      {error && <Alert tone="error">{error}</Alert>}

      <div className="max-h-[min(22rem,45dvh)] overflow-y-auto rounded-xl border border-border">
        {drivers.isLoading ? (
          <div role="status" aria-label="Loading drivers" className="animate-pulse divide-y divide-border">
            {[0, 1, 2, 3].map((row) => <div key={row} className="h-16 bg-subtle/40" />)}
          </div>
        ) : drivers.isError ? (
          <div className="p-4"><Alert tone="error">{drivers.error.message}</Alert></div>
        ) : people.length === 0 ? (
          <EmptyState icon="user" title="No drivers found">Try their email or phone from the report, or part of their name.</EmptyState>
        ) : (
          <ul className={`divide-y divide-border ${drivers.isPlaceholderData ? "opacity-60" : ""}`}>
            {people.map((driver) => {
              const current = entry.driver?.id === driver.id;
              const emailMatch = Boolean(entry.bolt.email && driver.email && entry.bolt.email.toLowerCase() === driver.email.toLowerCase());
              const phoneMatch = Boolean(entry.bolt.phone && driver.phone_number && entry.bolt.phone.replace(/\D/g, "").slice(-10) === driver.phone_number.replace(/\D/g, "").slice(-10));
              return (
                <li key={driver.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      <span className="truncate">{fullName(driver)}</span>
                      {(emailMatch || phoneMatch) && (
                        <span className="rounded-full bg-success-soft px-2 py-0.5 text-[0.7rem] font-medium text-success">
                          Same {emailMatch ? "email" : "phone"}
                        </span>
                      )}
                      {!driver.is_active && <span className="rounded-full bg-subtle px-2 py-0.5 text-[0.7rem] text-muted">Deactivated</span>}
                    </p>
                    <p className="truncate text-xs text-muted">@{driver.username}{driver.email ? ` · ${driver.email}` : ""}{driver.phone_number ? ` · ${driver.phone_number}` : ""}</p>
                  </div>
                  <Button
                    variant={current ? "ghost" : "secondary"}
                    disabled={current || pending !== null}
                    loading={pending === driver.id}
                    onClick={() => onPick({ id: driver.id, name: fullName(driver) })}
                    className="shrink-0"
                  >
                    {current ? "Linked" : "Link"}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="text-xs text-muted">
        Linking re-runs the whole report so totals stay right. Re-runs keep this link. Tip: update the driver&apos;s email or phone on their profile so next time&apos;s report matches automatically.
      </p>

      <ModalActions>
        <span className="hidden sm:block sm:flex-1" />
        <Button variant="secondary" onClick={onCancel} disabled={pending !== null} className="col-span-2">Cancel</Button>
      </ModalActions>
    </div>
  );
}
