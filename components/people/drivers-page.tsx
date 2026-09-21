"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";

import { AccessDenied } from "@/components/dashboard/access-denied";
import { ConfigPageHeader, EmptyState, ErrorState, Icon, SearchInput, SkeletonRows } from "@/components/dashboard/screen-kit";
import { ActiveBadge, Avatar, ShiftBadge } from "@/components/people/people-parts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import type { ManagedUser } from "@/lib/api/users";
import { fullName, naira } from "@/lib/format";
import { useSearchState, useUrlState } from "@/lib/hooks/use-url-state";
import { paginate } from "@/lib/paginate";
import { useCurrentUser } from "@/lib/query/user";
import { useRoster } from "@/lib/query/users";

const PAGE_SIZE = 20;
// The bank column only earns its space from xl up; below that the row stays readable without it.
const ROW_GRID = "md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.2fr)_6.5rem_7.5rem_6rem] xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1.1fr)_6.5rem_7.5rem_minmax(0,1.1fr)_6rem]";

type View = "all" | "on-shift" | "no-vehicle" | "no-bank" | "inactive";
type Sort = "newest" | "name" | "wallet";

const VIEWS: Record<View, { label: string; test: (driver: ManagedUser) => boolean }> = {
  all: { label: "All drivers", test: () => true },
  "on-shift": { label: "On shift", test: (driver) => driver.shift },
  "no-vehicle": { label: "No vehicle", test: (driver) => driver.is_active && driver.vehicle === null },
  "no-bank": { label: "No bank account", test: (driver) => driver.virtual_account === null },
  inactive: { label: "Inactive", test: (driver) => !driver.is_active },
};

const SORTS: Record<Sort, { label: string; compare: (a: ManagedUser, b: ManagedUser) => number }> = {
  newest: { label: "Newest first", compare: (a, b) => b.created_at.localeCompare(a.created_at) },
  name: { label: "Name A to Z", compare: (a, b) => fullName(a).localeCompare(fullName(b)) },
  wallet: { label: "Wallet: high to low", compare: (a, b) => b.ev_wallet_balance - a.ev_wallet_balance },
};

function matches(driver: ManagedUser, term: string) {
  const haystack = [fullName(driver), driver.username, driver.email, driver.phone_number, driver.vehicle?.name, driver.virtual_account?.account_number].filter(Boolean).join(" ").toLowerCase();
  return term
    .toLowerCase()
    .split(/\s+/)
    .every((part) => haystack.includes(part));
}

export function DriversPage() {
  const me = useCurrentUser();
  const isAdmin = me.user_type === "ADMIN";
  const url = useUrlState();
  const search = useSearchState(url, "q");
  const roster = useRoster("DRIVER", isAdmin);

  const view = (Object.keys(VIEWS).includes(url.get("view")) ? url.get("view") : "all") as View;
  const sort = (Object.keys(SORTS).includes(url.get("sort")) ? url.get("sort") : "newest") as Sort;

  const drivers = useMemo(() => roster.data ?? [], [roster.data]);
  const counts = useMemo(() => Object.fromEntries((Object.keys(VIEWS) as View[]).map((key) => [key, drivers.filter(VIEWS[key].test).length])) as Record<View, number>, [drivers]);

  const filtered = useMemo(() => {
    const term = search.committed.trim();
    return drivers
      .filter(VIEWS[view].test)
      .filter((driver) => !term || matches(driver, term))
      .sort(SORTS[sort].compare);
  }, [drivers, search.committed, sort, view]);
  const { slice, pagination } = paginate(filtered, url.page, PAGE_SIZE);

  useEffect(() => {
    if (roster.data && url.page > pagination.total_pages) url.set({ page: 1 });
  }, [pagination.total_pages, roster.data, url]);

  if (!isAdmin) return <AccessDenied />;

  const isFiltered = Boolean(search.text || view !== "all" || sort !== "newest");
  const clear = () => {
    search.setText("");
    url.set({ q: "", view: "", sort: "", page: 1 });
  };

  const stats: Array<{ key: View; label: string; hint: string; tone: string }> = [
    { key: "all", label: "Total drivers", hint: "Everyone on the platform", tone: "" },
    { key: "on-shift", label: "On shift", hint: "Between pick-up and drop-off", tone: "text-brand" },
    { key: "no-vehicle", label: "No vehicle", hint: "Active, waiting for a vehicle", tone: counts["no-vehicle"] ? "text-danger" : "" },
    { key: "no-bank", label: "No bank account", hint: "Can't receive transfers yet", tone: counts["no-bank"] ? "text-danger" : "" },
    { key: "inactive", label: "Inactive", hint: "Deactivated accounts", tone: "" },
  ];

  return (
    <div className="space-y-5">
      <ConfigPageHeader
        icon="users"
        showBackLink={false}
        title="Drivers"
        description="Everyone driving for Autogirl: their vehicle, shift, wallet and bank account in one place."
        actions={
          <Link href="/admin/driver-applications" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-medium transition hover:bg-subtle pointer-coarse:h-11 pointer-coarse:text-base">
            <Icon name="clipboard" className="size-4" />
            Driver applications
          </Link>
        }
      />

      <section aria-label="Driver summary" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {stats.map((stat) => {
          const active = view === stat.key;
          return (
            <button
              key={stat.key}
              type="button"
              aria-pressed={active}
              onClick={() => url.set({ view: stat.key === "all" ? "" : stat.key, page: 1 })}
              className={`rounded-xl border p-4 text-left shadow-card transition focus-visible:outline-2 focus-visible:outline-brand ${
                active ? "border-brand bg-brand-soft/40 ring-1 ring-brand" : "border-border bg-surface hover:border-brand/50"
              } ${stat.key === "all" ? "col-span-2 lg:col-span-1" : ""}`}
            >
              <span className="block text-xs font-medium uppercase text-muted">{stat.label}</span>
              <span className={`mt-2 block text-2xl font-semibold tabular-nums ${stat.tone}`}>{roster.isLoading ? "…" : counts[stat.key]}</span>
              <span className="mt-1 hidden text-xs text-muted sm:block">{stat.hint}</span>
            </button>
          );
        })}
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-card">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_13rem_auto]">
          <SearchInput value={search.text} onChange={search.setText} placeholder="Search name, username, phone, vehicle or account number" label="Search drivers" />
          <Select label="Sort" hideLabel value={sort} onChange={(event) => url.set({ sort: event.target.value === "newest" ? "" : event.target.value, page: 1 })}>
            {(Object.keys(SORTS) as Sort[]).map((key) => <option key={key} value={key}>{SORTS[key].label}</option>)}
          </Select>
          <Button variant="secondary" onClick={clear} disabled={!isFiltered}>Clear</Button>
        </div>
        {roster.data && (
          <p className="text-xs text-muted">
            {filtered.length === drivers.length ? `${drivers.length} drivers` : `${filtered.length} of ${drivers.length} drivers`}
            {view !== "all" && <> · {VIEWS[view].label}</>}
          </p>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        {roster.isLoading ? (
          <SkeletonRows rows={8} columns={5} />
        ) : roster.isError ? (
          <ErrorState message={roster.error.message} onRetry={() => roster.refetch()} />
        ) : filtered.length === 0 ? (
          <EmptyState icon="users" title={drivers.length === 0 ? "No drivers yet" : "No drivers match"} action={isFiltered ? <Button variant="secondary" onClick={clear}>Reset filters</Button> : undefined}>
            {drivers.length === 0 ? "Drivers appear here once you approve a driver application." : "Try another search or a different summary filter."}
          </EmptyState>
        ) : (
          <>
            <div className={`hidden gap-4 bg-subtle/70 px-6 py-3 text-xs font-semibold uppercase text-muted md:grid ${ROW_GRID}`}>
              <span>Driver</span>
              <span>Vehicle</span>
              <span>Shift</span>
              <span className="text-right">Wallet</span>
              <span className="hidden xl:block">Bank account</span>
              <span>Status</span>
            </div>
            <ul className="divide-y divide-border">
              {slice.map((driver) => (
                <li key={driver.id}>
                  <Link href={`/drivers/${driver.id}`} className={`grid items-center gap-x-4 gap-y-2.5 px-4 py-4 transition hover:bg-subtle/50 focus-visible:bg-subtle/50 focus-visible:outline-none sm:px-6 ${ROW_GRID}`}>
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar person={driver} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{fullName(driver)}</p>
                        <p className="truncate text-xs text-muted">@{driver.username}{driver.phone_number ? ` · ${driver.phone_number}` : ""}</p>
                      </div>
                    </div>
                    <div className="min-w-0 text-sm">
                      {driver.vehicle ? (
                        <>
                          <p className="truncate font-medium">{driver.vehicle.name}</p>
                          <p className="truncate text-xs text-muted">{driver.vehicle.vehicle_make.name} {driver.vehicle.vehicle_model.name} · {driver.vehicle.location_state}</p>
                        </>
                      ) : (
                        <Badge tone={driver.is_active ? "danger" : "neutral"}>No vehicle</Badge>
                      )}
                    </div>
                    <div><ShiftBadge onShift={driver.shift} /></div>
                    <p className="text-sm font-semibold tabular-nums md:text-right">
                      <span className="mr-2 text-xs font-normal text-muted md:hidden">Wallet</span>
                      {naira(driver.ev_wallet_balance)}
                    </p>
                    <div className="min-w-0 text-sm md:hidden xl:block">
                      {driver.virtual_account ? (
                        <>
                          <p className="truncate">{driver.virtual_account.bank_name}</p>
                          <p className="font-mono text-xs text-muted">{driver.virtual_account.account_number}</p>
                        </>
                      ) : (
                        <Badge tone="danger">No account</Badge>
                      )}
                    </div>
                    <div><ActiveBadge active={driver.is_active} /></div>
                  </Link>
                </li>
              ))}
            </ul>
            <Pagination pagination={pagination} onPage={(page) => url.set({ page })} noun="drivers" />
          </>
        )}
      </section>
    </div>
  );
}
