"use client";

import { useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";

import { AccessDenied } from "@/components/dashboard/access-denied";
import { ConfigPageHeader, EmptyState, ErrorState, Icon, SkeletonRows } from "@/components/dashboard/screen-kit";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal, ModalActions } from "@/components/ui/modal";
import { Pagination } from "@/components/ui/pagination";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/browser";
import { getCurrentEnergyRate, getStaffMember, listEnergyRates, setEnergyRate, type EnergyRate } from "@/lib/api/configuration";
import { formatDateTime, fullName, naira } from "@/lib/format";
import { useUrlState } from "@/lib/hooks/use-url-state";
import { queryKeys } from "@/lib/query/keys";
import { useCurrentUser } from "@/lib/query/user";

const PAGE_SIZE = 15;
const EXAMPLE_AMOUNT = 5000;
const LARGE_CHANGE = 0.25;
const MAX_RATE = 1_000_000;

const kwh = (amount: number, rate: number) =>
  (amount / rate).toLocaleString("en-NG", { maximumFractionDigits: 3 });

function percentChange(from: number, to: number) {
  return ((to - from) / from) * 100;
}

function ChangePill({ change }: { change: number | null }) {
  if (change === null) return <span className="text-muted">-</span>;
  if (change === 0) return <span className="text-muted">No change</span>;
  const up = change > 0;
  return (
    <span className={`inline-flex items-center gap-1 font-medium ${up ? "text-danger" : "text-success"}`}>
      <Icon name={up ? "arrowUp" : "arrowDown"} className="size-3.5" />
      {Math.abs(change).toLocaleString("en-NG", { maximumFractionDigits: 1 })}%
    </span>
  );
}

function useStaffNames(ids: (string | null)[], enabled: boolean) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const results = useQueries({
    queries: unique.map((id) => ({
      queryKey: queryKeys.users.detail(id),
      queryFn: ({ signal }: { signal: AbortSignal }) => getStaffMember(id, signal),
      enabled,
      staleTime: Infinity,
      retry: false,
    })),
  });
  const names = new Map<string, string>();
  unique.forEach((id, index) => {
    const person = results[index]?.data;
    if (person) names.set(id, fullName(person));
  });
  return (id: string | null) => (id === null ? "System (initial)" : (names.get(id) ?? "An administrator"));
}

function CurrentRateCard({ rate, setByName }: { rate: EnergyRate; setByName: string }) {
  return (
    <section aria-labelledby="current-rate" className="relative overflow-hidden rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6">
      <span aria-hidden className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-brand-soft opacity-80 blur-3xl" />
      <div className="relative">
        <div className="flex items-center gap-2">
          <h2 id="current-rate" className="text-sm font-medium text-muted">Current rate</h2>
          <Badge tone="success" dot>Live</Badge>
        </div>
        <p className="mt-3 flex flex-wrap items-baseline gap-x-2 text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">
          {naira(rate.rate_per_kwh)}
          <span className="text-lg font-medium text-muted sm:text-xl">/ kWh</span>
        </p>
        <dl className="mt-5 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted">In effect since</dt>
            <dd className="mt-0.5 font-medium">{formatDateTime(rate.created_at)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Set by</dt>
            <dd className="mt-0.5 font-medium">{setByName}</dd>
          </div>
        </dl>
        <p className="mt-5 text-sm text-muted">
          {naira(EXAMPLE_AMOUNT)} tops up <strong className="font-semibold text-foreground">{kwh(EXAMPLE_AMOUNT, rate.rate_per_kwh)} kWh</strong> at this rate.
        </p>
      </div>
    </section>
  );
}

function SetRateCard({ current, onSubmit }: { current: EnergyRate; onSubmit: (rate: number) => void }) {
  const [text, setText] = useState("");
  const [touched, setTouched] = useState(false);

  const digits = text.replace(/[^\d.]/g, "");
  const value = digits === "" ? null : Number(digits);
  const isWhole = value !== null && Number.isInteger(value);

  let error: string | null = null;
  if (value !== null) {
    if (!isWhole) error = "Use a whole number of naira (for example 550).";
    else if (value <= 0) error = "The rate must be greater than zero.";
    else if (value > MAX_RATE) error = `That looks too high. The most you can set is ${naira(MAX_RATE)}.`;
  } else if (touched) {
    error = "Enter the new rate.";
  }

  const valid = value !== null && isWhole && value > 0 && value <= MAX_RATE;
  const unchanged = valid && value === current.rate_per_kwh;
  const change = valid ? percentChange(current.rate_per_kwh, value) : null;
  const large = change !== null && Math.abs(change) / 100 > LARGE_CHANGE;

  return (
    <section aria-labelledby="set-rate" className="rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6">
      <h2 id="set-rate" className="text-base font-semibold">Set a new rate</h2>
      <p className="mt-1 text-sm text-muted">Applies to new top-ups and free grants straight away.</p>

      <form
        noValidate
        className="mt-5 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          setTouched(true);
          if (valid && !unchanged) onSubmit(value);
        }}
      >
        <div className="space-y-1.5">
          <label htmlFor="rate-input" className="block text-sm font-medium">Price per kWh</label>
          <div className={`flex h-12 items-center rounded-xl border bg-surface px-3 transition focus-within:ring-3 ${error ? "border-danger focus-within:border-danger focus-within:ring-danger/20" : "border-input focus-within:border-brand focus-within:ring-brand/20"}`}>
            <span aria-hidden className="pr-2 text-lg font-medium text-muted">₦</span>
            <input
              id="rate-input"
              inputMode="numeric"
              autoComplete="off"
              value={text}
              onChange={(event) => setText(event.target.value.slice(0, 10))}
              onBlur={() => setTouched(true)}
              placeholder={String(current.rate_per_kwh)}
              aria-invalid={error ? true : undefined}
              aria-describedby="rate-help"
              className="h-full min-w-0 flex-1 bg-transparent text-lg font-semibold tabular-nums outline-none placeholder:font-normal placeholder:text-muted/50"
            />
            <span aria-hidden className="pl-2 text-sm text-muted">/ kWh</span>
          </div>
          <p id="rate-help" className={`text-xs ${error ? "text-danger" : "text-muted"}`}>
            {error ?? "Whole naira only. Existing allocations keep the rate they were created with."}
          </p>
        </div>

        {valid && !unchanged && (
          <div className="animate-fade-in space-y-2 rounded-xl bg-subtle p-3.5 text-sm">
            <p>
              {naira(EXAMPLE_AMOUNT)} would buy <strong className="font-semibold">{kwh(EXAMPLE_AMOUNT, value)} kWh</strong>
              <span className="text-muted"> (now {kwh(EXAMPLE_AMOUNT, current.rate_per_kwh)} kWh)</span>
            </p>
            <p className="flex items-center gap-2 text-muted">
              Change from current: <ChangePill change={change} />
            </p>
          </div>
        )}
        {unchanged && <Alert tone="info">That&apos;s the same as the current rate, so there&apos;s nothing to change.</Alert>}
        {large && !unchanged && (
          <Alert tone="error">
            This is a large change ({Math.abs(change ?? 0).toLocaleString("en-NG", { maximumFractionDigits: 0 })}%). Double-check before you continue.
          </Alert>
        )}

        <Button type="submit" fullWidth disabled={!valid || unchanged}>Review change</Button>
      </form>
    </section>
  );
}

export function EnergyRatePage() {
  const user = useCurrentUser();
  const isAdmin = user.user_type === "ADMIN";
  const isStaff = isAdmin || user.user_type === "ACCOUNT_OFFICER" || user.user_type === "RELATIONSHIP_OFFICER";
  const queryClient = useQueryClient();
  const toast = useToast();
  const url = useUrlState();
  const page = url.page;

  const [pending, setPending] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const current = useQuery({
    queryKey: queryKeys.energyRate.current,
    queryFn: ({ signal }) => getCurrentEnergyRate(signal),
    enabled: isStaff,
    // The API has no push for staff without a socket, so poll while the page is open.
    refetchInterval: 60_000,
  });

  const history = useQuery({
    queryKey: queryKeys.energyRate.history(page),
    queryFn: ({ signal }) => listEnergyRates({ page, page_size: PAGE_SIZE }, signal),
    enabled: isAdmin,
  });

  const items = history.data?.items;
  const names = useStaffNames([current.data?.set_by ?? null, ...(items?.map((row) => row.set_by) ?? [])], isAdmin);

  const save = useMutation({
    mutationFn: (rate: number) => setEnergyRate(rate),
    onSuccess: (rate) => {
      queryClient.setQueryData(queryKeys.energyRate.current, rate);
      queryClient.invalidateQueries({ queryKey: queryKeys.energyRate.all });
      setPending(null);
      setSubmitError(null);
      url.set({ page: 1 });
      toast.success(`Energy rate is now ${naira(rate.rate_per_kwh)} / kWh.`);
    },
    onError: (error) => {
      setSubmitError(
        error instanceof ApiError ? (error.fieldErrors.rate_per_kwh ?? error.message) : "Couldn't update the rate. Try again.",
      );
    },
  });

  if (!isStaff) return <AccessDenied />;

  return (
    <div>
      <ConfigPageHeader
        icon="bolt"
        title="Energy rate"
        description="The price per kilowatt-hour that turns naira into charging energy for wallet top-ups and free grants."
      />

      {current.isError ? (
        <div className="rounded-2xl border border-border bg-surface shadow-card">
          <ErrorState message={current.error.message} onRetry={() => current.refetch()} />
        </div>
      ) : (
        <div className={`grid gap-5 ${isAdmin ? "lg:grid-cols-2" : "max-w-2xl"}`}>
          {current.data ? (
            <CurrentRateCard rate={current.data} setByName={isAdmin ? names(current.data.set_by) : "Administrator"} />
          ) : (
            <div role="status" aria-label="Loading" className="h-56 animate-pulse rounded-2xl bg-subtle" />
          )}
          {isAdmin && current.data && <SetRateCard key={current.data.id} current={current.data} onSubmit={(rate) => { setSubmitError(null); setPending(rate); }} />}
          {!isAdmin && (
            <div className="flex items-start gap-3 rounded-xl border border-border bg-subtle/60 p-4 text-sm text-muted">
              <Icon name="lock" className="mt-0.5 size-5 shrink-0" />
              <p>Only administrators can change the energy rate. You can see the current rate here.</p>
            </div>
          )}
        </div>
      )}

      {isAdmin && (
        <section aria-labelledby="rate-history" className="mt-8 overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
          <div className="border-b border-border p-4 sm:px-6">
            <h2 id="rate-history" className="text-base font-semibold">Rate history</h2>
            <p className="mt-0.5 text-sm text-muted">Every rate ever set, newest first. Nothing is edited or deleted.</p>
          </div>

          {history.isLoading ? (
            <SkeletonRows rows={5} columns={4} />
          ) : history.isError ? (
            <ErrorState message={history.error.message} onRetry={() => history.refetch()} />
          ) : items && items.length > 0 ? (
            <>
              <div className="hidden grid-cols-[1.1fr_1.4fr_1.2fr_0.8fr] gap-4 bg-subtle/70 px-6 py-3 text-xs font-semibold uppercase text-muted md:grid">
                <span>Rate</span>
                <span>Effective from</span>
                <span>Set by</span>
                <span>Change</span>
              </div>
              <ul className="divide-y divide-border">
                {items.map((row, index) => {
                  const older = items[index + 1];
                  const isCurrent = page === 1 && index === 0;
                  return (
                    <li key={row.id} className={`grid gap-x-4 gap-y-1.5 px-4 py-4 sm:px-6 md:grid-cols-[1.1fr_1.4fr_1.2fr_0.8fr] md:items-center ${isCurrent ? "bg-brand-soft/40" : ""}`}>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-semibold tabular-nums">{naira(row.rate_per_kwh)}</span>
                        <span className="text-sm text-muted">/ kWh</span>
                        {isCurrent && <Badge tone="brand">Current</Badge>}
                      </div>
                      <p className="text-sm">
                        <span className="text-muted md:hidden">Effective </span>
                        {formatDateTime(row.created_at)}
                      </p>
                      <p className="text-sm">
                        <span className="text-muted md:hidden">Set by </span>
                        {names(row.set_by)}
                      </p>
                      <p className="text-sm">
                        <span className="text-muted md:hidden">Change </span>
                        <ChangePill change={older ? percentChange(older.rate_per_kwh, row.rate_per_kwh) : null} />
                      </p>
                    </li>
                  );
                })}
              </ul>
              <Pagination pagination={history.data?.pagination} onPage={(next) => url.set({ page: next })} noun="rates" />
            </>
          ) : (
            <EmptyState icon="clock" title="No rate history yet">Rate changes will show up here.</EmptyState>
          )}
        </section>
      )}

      <Modal open={pending !== null} onClose={() => !save.isPending && setPending(null)} title="Confirm new rate">
        {pending !== null && current.data && (
          <>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-subtle p-4">
              <div>
                <p className="text-xs text-muted">From</p>
                <p className="text-lg font-semibold tabular-nums">{naira(current.data.rate_per_kwh)}</p>
              </div>
              <Icon name="arrowRight" className="size-5 shrink-0 text-muted" />
              <div className="text-right">
                <p className="text-xs text-muted">To</p>
                <p className="text-lg font-semibold tabular-nums text-brand">{naira(pending)}</p>
              </div>
            </div>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted">
              <li>Applies to <strong className="font-semibold text-foreground">new</strong> top-ups and free grants immediately.</li>
              <li>Existing allocations keep their old rate.</li>
              <li>It&apos;s broadcast to every signed-in user, and can&apos;t be undone. You can only set another rate.</li>
            </ul>
            {submitError && <Alert tone="error">{submitError}</Alert>}
            <ModalActions>
              <Button variant="secondary" onClick={() => setPending(null)} disabled={save.isPending}>Cancel</Button>
              <Button onClick={() => save.mutate(pending)} loading={save.isPending}>Set rate</Button>
            </ModalActions>
          </>
        )}
      </Modal>
    </div>
  );
}
