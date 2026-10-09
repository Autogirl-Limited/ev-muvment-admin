"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { EmptyState, ErrorState, Icon, SearchInput, SkeletonRows } from "@/components/dashboard/screen-kit";
import { Avatar } from "@/components/people/people-parts";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal, ModalActions } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/browser";
import type { ManagedUser } from "@/lib/api/users";
import { isAmbiguousLotGridsTimeout, recordFreeGrant } from "@/lib/api/wallet";
import { fullName, naira } from "@/lib/format";
import { configQueries } from "@/lib/query/configuration";
import { queryKeys } from "@/lib/query/keys";
import { useFleetBalance } from "@/lib/query/lotgrids";
import { useRoster } from "@/lib/query/users";

type Step = "select" | "amount" | "review" | "run";
type View = "eligible" | "all" | "selected";
type AmountMode = "same" | "custom";
type RowState = "queued" | "sending" | "done" | "failed" | "unconfirmed" | "skipped";
type Halt = "fleet" | "unconfirmed" | "stopped" | null;

interface RunRow {
  driver: ManagedUser;
  amount: number;
  state: RowState;
  message?: string;
}

const QUICK_AMOUNTS = [2_000, 5_000, 10_000, 20_000];
const STEPS: { key: Exclude<Step, "run">; label: string }[] = [
  { key: "select", label: "Drivers" },
  { key: "amount", label: "Amount" },
  { key: "review", label: "Review" },
];

/** Digits only, capped so a stray paste can't produce an absurd figure. */
function digits(value: string) {
  return value.replace(/\D/g, "").replace(/^0+/, "").slice(0, 9);
}

function toAmount(value: string | undefined) {
  const amount = Number(value || 0);
  return Number.isInteger(amount) && amount > 0 ? amount : 0;
}

function grouped(value: string) {
  return value ? Number(value).toLocaleString("en-NG") : "";
}

function formatKwh(value: number) {
  return `${value.toLocaleString("en-NG", { maximumFractionDigits: 1 })} kWh`;
}

function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : "Unexpected error";
}

/**
 * The request may have reached LotGrids even though we never heard back, so
 * the money may already have moved. Never retried automatically.
 */
function isUnconfirmed(error: unknown) {
  if (!(error instanceof ApiError)) return false;
  return error.status === 0 || error.status === 504 || (error.status === 502 && isAmbiguousLotGridsTimeout(error.message));
}

/**
 * Credits many drivers in one go: pick drivers, set one amount (or one each),
 * review against the fleet wallet, then the grants are sent one at a time with
 * live progress. Sequential on purpose: every grant draws on the same fleet
 * wallet, and stopping at the first "fleet is short" or "unconfirmed" answer
 * is what keeps a bad run from fanning out.
 */
export function BulkCreditDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [step, setStep] = useState<Step>("select");
  const [selected, setSelected] = useState<Map<string, ManagedUser>>(() => new Map());
  const [mode, setMode] = useState<AmountMode>("same");
  const [sameAmount, setSameAmount] = useState("");
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);

  const [rows, setRows] = useState<RunRow[]>([]);
  const [running, setRunning] = useState(false);
  const [halt, setHalt] = useState<Halt>(null);
  const [stopping, setStopping] = useState(false);
  const stopRef = useRef(false);

  const roster = useRoster("DRIVER", open);
  const fleet = useFleetBalance(open);
  const rate = useQuery({ ...configQueries.energyRate(), enabled: open });
  const ratePerKwh = rate.data?.rate_per_kwh ?? 0;

  const chosen = useMemo(() => [...selected.values()], [selected]);
  const amountFor = (id: string) => toAmount(mode === "same" ? sameAmount : custom[id]);
  const total = chosen.reduce((sum, driver) => sum + amountFor(driver.id), 0);
  const missingAmounts = chosen.filter((driver) => amountFor(driver.id) === 0).length;
  const fleetBalance = fleet.data?.wallet_balance;
  const shortfall = fleetBalance !== undefined && total > fleetBalance ? total - fleetBalance : 0;
  const finished = step === "run" && !running;

  // Leaving the page mid-run would silently abandon the rest of the batch.
  useEffect(() => {
    if (!running) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);

  const reset = () => {
    setStep("select");
    setSelected(new Map());
    setMode("same");
    setSameAmount("");
    setCustom({});
    setNotes("");
    setAcknowledged(false);
    setRows([]);
    setHalt(null);
  };

  const close = () => {
    if (running) return;
    // Keep a half-built draft if they close early; a finished batch starts fresh next time.
    if (step === "run") reset();
    onClose();
  };

  const toggle = (driver: ManagedUser) =>
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(driver.id)) next.delete(driver.id);
      else next.set(driver.id, driver);
      return next;
    });

  const switchMode = (next: AmountMode) => {
    // Seed every driver's own amount from the shared one so switching is never a blank slate.
    if (next === "custom") setCustom((current) => Object.fromEntries(chosen.map((driver) => [driver.id, current[driver.id] ?? sameAmount])));
    setMode(next);
  };

  const patchRow = (index: number, patch: Partial<RunRow>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const run = async (batch: RunRow[], indices: number[]) => {
    stopRef.current = false;
    setStopping(false);
    setHalt(null);
    setRunning(true);
    setRows(batch.map((row, i) => (indices.includes(i) ? { ...row, state: "queued", message: undefined } : row)));

    const trimmedNotes = notes.trim() || undefined;
    let sent = 0;
    let stoppedBy: Halt = null;

    for (let n = 0; n < indices.length; n += 1) {
      const index = indices[n];
      if (stopRef.current) {
        stoppedBy = "stopped";
        indices.slice(n).forEach((i) => patchRow(i, { state: "skipped", message: "Not sent: you stopped the batch" }));
        break;
      }
      patchRow(index, { state: "sending" });
      const row = batch[index];
      try {
        await recordFreeGrant({ user_id: row.driver.id, amount: row.amount, notes: trimmedNotes });
        sent += 1;
        patchRow(index, { state: "done" });
      } catch (error) {
        if (isUnconfirmed(error)) {
          stoppedBy = "unconfirmed";
          patchRow(index, { state: "unconfirmed", message: "LotGrids didn't confirm in time. The credit may have gone through, so check this driver's balance before sending again." });
          indices.slice(n + 1).forEach((i) => patchRow(i, { state: "skipped", message: "Not sent: batch paused on an unconfirmed grant" }));
          break;
        }
        if (error instanceof ApiError && error.status === 402) {
          stoppedBy = "fleet";
          patchRow(index, { state: "failed", message: errorMessage(error) });
          indices.slice(n + 1).forEach((i) => patchRow(i, { state: "skipped", message: "Not sent: the fleet wallet ran short" }));
          break;
        }
        // Driver-specific problems (no vehicle, removed driver...) don't affect the rest of the batch.
        patchRow(index, { state: "failed", message: errorMessage(error) });
      }
    }

    setHalt(stoppedBy);
    setRunning(false);
    queryClient.invalidateQueries({ queryKey: queryKeys.walletAllocations.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.lotgrids.all });

    if (sent === indices.length) toast.success(`Credited ${sent} driver${sent === 1 ? "" : "s"}.`);
    else if (sent > 0) toast.info(`Credited ${sent} of ${indices.length} drivers. Review the rest before retrying.`);
    else toast.error("No drivers were credited.");
  };

  const start = () => {
    const batch: RunRow[] = chosen.map((driver) => ({ driver, amount: amountFor(driver.id), state: "queued" }));
    setStep("run");
    void run(batch, batch.map((_, i) => i));
  };

  const retryable = rows.map((row, i) => (row.state === "failed" || row.state === "skipped" ? i : -1)).filter((i) => i >= 0);

  return (
    <Modal open={open} onClose={close} title={step === "run" ? (running ? "Sending credit..." : "Bulk credit complete") : "Bulk EV credit"} size="xl" dismissible={!running}>
      {step !== "run" && <Stepper step={step} />}

      {step === "select" && (
        <SelectDrivers roster={roster.data} loading={roster.isLoading} error={roster.error} onRetry={() => roster.refetch()} selected={selected} onToggle={toggle} onSet={setSelected} />
      )}

      {step === "amount" && (
        <AmountStep
          drivers={chosen}
          mode={mode}
          onMode={switchMode}
          sameAmount={sameAmount}
          onSameAmount={setSameAmount}
          custom={custom}
          onCustom={(id, value) => setCustom((current) => ({ ...current, [id]: value }))}
          onApplyAll={(value) => setCustom(Object.fromEntries(chosen.map((driver) => [driver.id, value])))}
          onRemove={(driver) => toggle(driver)}
          notes={notes}
          onNotes={setNotes}
          ratePerKwh={ratePerKwh}
          summary={<Summary count={chosen.length} total={total} ratePerKwh={ratePerKwh} fleetBalance={fleetBalance} fleetSandbox={fleet.data?.sandbox} fleetError={fleet.isError} />}
        />
      )}

      {step === "review" && (
        <ReviewStep
          drivers={chosen}
          amountFor={amountFor}
          total={total}
          ratePerKwh={ratePerKwh}
          notes={notes.trim()}
          fleetBalance={fleetBalance}
          fleetError={fleet.isError}
          acknowledged={acknowledged}
          onAcknowledge={setAcknowledged}
        />
      )}

      {step === "run" && <RunStep rows={rows} running={running} halt={halt} />}

      {shortfall > 0 && (step === "amount" || step === "review") && (
        <Alert tone="error">
          This batch needs {naira(total)} but the fleet wallet only has {naira(fleetBalance ?? 0)} ({naira(shortfall)} short). Fund it on the LotGrids Partner Dashboard, lower the amounts, or select fewer drivers.
        </Alert>
      )}

      <ModalActions>
        {step === "select" && (
          <>
            <Button variant="secondary" onClick={close}>Cancel</Button>
            <Button onClick={() => setStep("amount")} disabled={chosen.length === 0}>
              Continue{chosen.length ? ` (${chosen.length})` : ""}
            </Button>
          </>
        )}
        {step === "amount" && (
          <>
            <Button variant="secondary" onClick={() => setStep("select")}>Back</Button>
            <Button onClick={() => { setAcknowledged(false); setStep("review"); }} disabled={chosen.length === 0 || missingAmounts > 0 || shortfall > 0 || notes.length > 500}>
              {missingAmounts > 0 ? `${missingAmounts} missing amount${missingAmounts === 1 ? "" : "s"}` : "Review"}
            </Button>
          </>
        )}
        {step === "review" && (
          <>
            <Button variant="secondary" onClick={() => setStep("amount")}>Back</Button>
            <Button onClick={start} disabled={!acknowledged || shortfall > 0 || total === 0}>
              Send {naira(total)}
            </Button>
          </>
        )}
        {step === "run" && running && (
          <Button variant="secondary" onClick={() => { stopRef.current = true; setStopping(true); }} className="col-span-2 sm:col-span-1" disabled={stopping}>
            {stopping ? "Stopping..." : "Stop after this one"}
          </Button>
        )}
        {finished && (
          <>
            {retryable.length > 0 ? (
              <Button variant="secondary" onClick={() => void run(rows, retryable)}>
                Retry {retryable.length} unsent
              </Button>
            ) : (
              <span className="hidden sm:block" />
            )}
            <Button onClick={close} className={retryable.length > 0 ? "" : "col-span-2 sm:col-span-1"}>Done</Button>
          </>
        )}
      </ModalActions>
    </Modal>
  );
}

function Stepper({ step }: { step: Exclude<Step, "run"> }) {
  const current = STEPS.findIndex((item) => item.key === step);
  return (
    <ol className="grid grid-cols-3 gap-2" aria-label="Progress">
      {STEPS.map((item, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={item.key} aria-current={active ? "step" : undefined} className="min-w-0">
            <div className={`h-1 rounded-full transition-colors ${done || active ? "bg-brand" : "bg-subtle"}`} />
            <p className={`mt-2 flex items-center gap-1.5 truncate text-xs font-medium ${active ? "text-foreground" : "text-muted"}`}>
              <span className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[0.65rem] ${done ? "bg-brand text-brand-foreground" : active ? "bg-brand-soft text-brand" : "bg-subtle"}`}>
                {done ? <Icon name="check" className="size-3" /> : index + 1}
              </span>
              {item.label}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (value: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-lg bg-subtle p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={`min-w-0 flex-1 truncate rounded-md px-3 py-1.5 text-sm font-medium transition pointer-coarse:py-2 ${value === option.value ? "bg-surface text-foreground shadow-card" : "text-muted hover:text-foreground"}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Checkbox({ checked, indeterminate = false, disabled = false, onChange, label }: { checked: boolean; indeterminate?: boolean; disabled?: boolean; onChange: () => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      className="size-[1.125rem] shrink-0 cursor-pointer rounded accent-brand disabled:cursor-not-allowed disabled:opacity-40"
    />
  );
}

function SelectDrivers({
  roster,
  loading,
  error,
  onRetry,
  selected,
  onToggle,
  onSet,
}: {
  roster: ManagedUser[] | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  selected: Map<string, ManagedUser>;
  onToggle: (driver: ManagedUser) => void;
  onSet: (next: Map<string, ManagedUser>) => void;
}) {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<View>("eligible");

  const all = useMemo(() => [...(roster ?? [])].sort((a, b) => fullName(a).localeCompare(fullName(b))), [roster]);
  const eligible = useMemo(() => all.filter((driver) => driver.vehicle), [all]);

  const shown = useMemo(() => {
    const base = view === "eligible" ? eligible : view === "selected" ? all.filter((driver) => selected.has(driver.id)) : all;
    const term = search.trim().toLowerCase();
    if (!term) return base;
    return base.filter((driver) =>
      [fullName(driver), driver.username, driver.phone_number ?? "", driver.email ?? "", driver.vehicle?.name ?? ""].some((value) => value.toLowerCase().includes(term)),
    );
  }, [all, eligible, search, selected, view]);

  const pickable = shown.filter((driver) => driver.vehicle);
  const pickedShown = pickable.filter((driver) => selected.has(driver.id)).length;
  const allShownPicked = pickable.length > 0 && pickedShown === pickable.length;

  const toggleShown = () => {
    const next = new Map(selected);
    if (allShownPicked) pickable.forEach((driver) => next.delete(driver.id));
    else pickable.forEach((driver) => next.set(driver.id, driver));
    onSet(next);
  };

  return (
    <div className="space-y-3">
      <SearchInput value={search} onChange={setSearch} placeholder="Search name, username, phone or vehicle" />
      <Segmented
        label="Which drivers to show"
        value={view}
        onChange={setView}
        options={[
          { value: "eligible", label: `With vehicle (${eligible.length})` },
          { value: "all", label: `All (${all.length})` },
          { value: "selected", label: `Selected (${selected.size})` },
        ]}
      />

      <div className="overflow-hidden rounded-xl border border-border">
        <div className="flex items-center justify-between gap-3 border-b border-border bg-subtle/60 px-3 py-2.5 sm:px-4">
          <label className="flex min-w-0 cursor-pointer items-center gap-3 text-sm font-medium">
            <Checkbox
              label="Select every driver shown"
              checked={allShownPicked}
              indeterminate={pickedShown > 0 && !allShownPicked}
              disabled={pickable.length === 0}
              onChange={toggleShown}
            />
            <span className="truncate">{allShownPicked ? "Deselect" : "Select"} {pickable.length} shown</span>
          </label>
          {selected.size > 0 && (
            <button type="button" onClick={() => onSet(new Map())} className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-brand hover:bg-surface">
              Clear {selected.size}
            </button>
          )}
        </div>

        <div className="max-h-[min(24rem,45dvh)] overflow-y-auto overscroll-contain">
          {loading ? (
            <SkeletonRows rows={6} columns={2} />
          ) : error ? (
            <ErrorState message={error instanceof ApiError ? error.message : "Drivers unavailable."} onRetry={onRetry} />
          ) : shown.length === 0 ? (
            <EmptyState icon="search" title={view === "selected" ? "No drivers selected yet" : "No drivers found"}>
              {view === "eligible" && !search ? "Only drivers with an assigned vehicle can receive EV credit." : undefined}
            </EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {shown.map((driver) => {
                const checked = selected.has(driver.id);
                const eligibleDriver = Boolean(driver.vehicle);
                return (
                  <li key={driver.id}>
                    <label className={`flex items-center gap-3 px-3 py-3 transition sm:px-4 ${eligibleDriver ? "cursor-pointer hover:bg-subtle/60" : "cursor-not-allowed opacity-60"} ${checked ? "bg-brand-soft/60" : ""}`}>
                      <Checkbox label={`Select ${fullName(driver)}`} checked={checked} disabled={!eligibleDriver} onChange={() => onToggle(driver)} />
                      <Avatar person={driver} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{fullName(driver)}</span>
                        <span className="block truncate text-xs text-muted">
                          @{driver.username} · {driver.vehicle ? driver.vehicle.name : "No vehicle assigned"}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        {eligibleDriver ? (
                          <span className="text-xs tabular-nums text-muted" title="Current EV wallet balance">{naira(driver.ev_wallet_balance)}</span>
                        ) : (
                          <Badge tone="danger">No vehicle</Badge>
                        )}
                        {!driver.is_active && <Badge>Inactive</Badge>}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function AmountInput({ value, onChange, label, size = "md", autoFocus = false }: { value: string; onChange: (value: string) => void; label: string; size?: "md" | "lg"; autoFocus?: boolean }) {
  return (
    <div className="relative">
      <span aria-hidden className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-semibold text-muted ${size === "lg" ? "text-xl" : "text-sm"}`}>₦</span>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        aria-label={label}
        autoFocus={autoFocus}
        value={grouped(value)}
        onChange={(event) => onChange(digits(event.target.value))}
        placeholder="0"
        className={`w-full rounded-lg border border-input bg-surface pr-3 font-semibold tabular-nums outline-none transition placeholder:text-muted/50 focus:border-brand focus:ring-3 focus:ring-brand/20 ${
          size === "lg" ? "h-14 pl-9 text-2xl" : "h-10 pl-7 text-sm pointer-coarse:h-11 pointer-coarse:text-base"
        }`}
      />
    </div>
  );
}

function AmountStep({
  drivers,
  mode,
  onMode,
  sameAmount,
  onSameAmount,
  custom,
  onCustom,
  onApplyAll,
  onRemove,
  notes,
  onNotes,
  ratePerKwh,
  summary,
}: {
  drivers: ManagedUser[];
  mode: AmountMode;
  onMode: (mode: AmountMode) => void;
  sameAmount: string;
  onSameAmount: (value: string) => void;
  custom: Record<string, string>;
  onCustom: (id: string, value: string) => void;
  onApplyAll: (value: string) => void;
  onRemove: (driver: ManagedUser) => void;
  notes: string;
  onNotes: (value: string) => void;
  ratePerKwh: number;
  summary: ReactNode;
}) {
  const [applyAll, setApplyAll] = useState("");
  const each = toAmount(sameAmount);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="min-w-0 space-y-4">
        <Segmented
          label="How to set amounts"
          value={mode}
          onChange={onMode}
          options={[
            { value: "same", label: "Same for everyone" },
            { value: "custom", label: "Custom per driver" },
          ]}
        />

        {mode === "same" ? (
          <div className="space-y-3">
            <AmountInput label="Amount per driver" value={sameAmount} onChange={onSameAmount} size="lg" autoFocus />
            <div className="flex flex-wrap gap-2">
              {QUICK_AMOUNTS.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => onSameAmount(String(amount))}
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium tabular-nums transition pointer-coarse:py-2 ${each === amount ? "border-brand bg-brand-soft text-brand" : "border-border hover:border-brand/50 hover:bg-subtle"}`}
                >
                  {naira(amount)}
                </button>
              ))}
            </div>
            <p className="text-sm text-muted">
              {each > 0 && ratePerKwh > 0
                ? `Each driver gets about ${formatKwh(each / ratePerKwh)} of charging at ${naira(ratePerKwh, 2)}/kWh.`
                : `Every one of the ${drivers.length} selected drivers receives this amount.`}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="flex flex-col gap-2 border-b border-border bg-subtle/60 p-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <AmountInput label="Amount to apply to every driver" value={applyAll} onChange={setApplyAll} />
              </div>
              <Button variant="secondary" disabled={!applyAll} onClick={() => onApplyAll(applyAll)} className="shrink-0">
                Apply to all
              </Button>
            </div>
            <ul className="max-h-[min(22rem,40dvh)] divide-y divide-border overflow-y-auto overscroll-contain">
              {drivers.map((driver) => (
                <li key={driver.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{fullName(driver)}</span>
                    <span className="block truncate text-xs text-muted">Balance {naira(driver.ev_wallet_balance)}</span>
                  </span>
                  <div className="w-32 shrink-0 sm:w-40">
                    <AmountInput label={`Amount for ${fullName(driver)}`} value={custom[driver.id] ?? ""} onChange={(value) => onCustom(driver.id, value)} />
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(driver)}
                    aria-label={`Remove ${fullName(driver)}`}
                    title="Remove from batch"
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-danger-soft hover:text-danger"
                  >
                    <Icon name="x" className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <label className="block text-sm font-medium">
          Note <span className="font-normal text-muted">(optional, saved on every grant)</span>
          <textarea
            value={notes}
            onChange={(event) => onNotes(event.target.value.slice(0, 500))}
            rows={2}
            placeholder="e.g. October loyalty bonus"
            className="mt-1 w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-3 focus:ring-brand/20 pointer-coarse:text-base"
          />
          <span className="mt-1 block text-right text-xs font-normal text-muted">{notes.length}/500</span>
        </label>
      </div>

      {summary}
    </div>
  );
}

function Summary({ count, total, ratePerKwh, fleetBalance, fleetSandbox, fleetError }: { count: number; total: number; ratePerKwh: number; fleetBalance?: number; fleetSandbox?: boolean; fleetError: boolean }) {
  const after = fleetBalance === undefined ? undefined : fleetBalance - total;
  const used = fleetBalance ? Math.min(1, total / fleetBalance) : 0;
  return (
    <aside className="h-fit space-y-3 rounded-xl border border-border bg-subtle/50 p-4 lg:sticky lg:top-0">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted">Batch total</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{naira(total)}</p>
        <p className="text-sm text-muted">
          {count} driver{count === 1 ? "" : "s"}
          {ratePerKwh > 0 && total > 0 ? ` · ≈ ${formatKwh(total / ratePerKwh)}` : ""}
        </p>
      </div>
      <div className="border-t border-border pt-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted">Fleet wallet{fleetSandbox ? " (sandbox)" : ""}</span>
          <span className="font-medium tabular-nums">{fleetBalance !== undefined ? naira(fleetBalance) : fleetError ? "Unavailable" : "..."}</span>
        </div>
        {fleetBalance !== undefined && (
          <>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border" aria-hidden>
              <div className={`h-full rounded-full transition-[width] ${after !== undefined && after < 0 ? "bg-danger" : "bg-brand"}`} style={{ width: `${Math.max(used * 100, total > 0 ? 2 : 0)}%` }} />
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-muted">After this batch</span>
              <span className={`font-semibold tabular-nums ${after !== undefined && after < 0 ? "text-danger" : ""}`}>{naira(after ?? 0)}</span>
            </div>
          </>
        )}
        {fleetError && <p className="mt-2 text-xs text-muted">Couldn&apos;t check the fleet wallet. LotGrids will still refuse any grant it can&apos;t cover.</p>}
      </div>
    </aside>
  );
}

function ReviewStep({
  drivers,
  amountFor,
  total,
  ratePerKwh,
  notes,
  fleetBalance,
  fleetError,
  acknowledged,
  onAcknowledge,
}: {
  drivers: ManagedUser[];
  amountFor: (id: string) => number;
  total: number;
  ratePerKwh: number;
  notes: string;
  fleetBalance?: number;
  fleetError: boolean;
  acknowledged: boolean;
  onAcknowledge: (value: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-brand-soft p-4 sm:p-5">
        <p className="text-sm font-medium text-brand">You&apos;re about to send</p>
        <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{naira(total)}</p>
        <p className="mt-1 text-sm text-muted">
          to {drivers.length} driver{drivers.length === 1 ? "" : "s"}
          {ratePerKwh > 0 ? ` · ≈ ${formatKwh(total / ratePerKwh)} of charging` : ""}
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-brand/15 pt-4 text-sm">
          <div className="min-w-0">
            <dt className="text-muted">Fleet wallet now</dt>
            <dd className="truncate font-semibold tabular-nums">{fleetBalance !== undefined ? naira(fleetBalance) : fleetError ? "Unavailable" : "..."}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted">After batch</dt>
            <dd className="truncate font-semibold tabular-nums">{fleetBalance !== undefined ? naira(fleetBalance - total) : "-"}</dd>
          </div>
        </dl>
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <ul className="max-h-[min(18rem,32dvh)] divide-y divide-border overflow-y-auto overscroll-contain">
          {drivers.map((driver) => (
            <li key={driver.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm sm:px-4">
              <span className="min-w-0">
                <span className="block truncate font-medium">{fullName(driver)}</span>
                <span className="block truncate text-xs text-muted">{naira(driver.ev_wallet_balance)} → {naira(driver.ev_wallet_balance + amountFor(driver.id))}</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums">+{naira(amountFor(driver.id))}</span>
            </li>
          ))}
        </ul>
      </div>

      {notes && (
        <p className="break-words rounded-lg bg-subtle px-3 py-2 text-sm">
          <span className="text-muted">Note: </span>
          {notes}
        </p>
      )}

      <Alert>Grants are sent one at a time and each driver is credited and notified as soon as theirs goes through. Keep this window open until it finishes. Grants can&apos;t be reversed from here.</Alert>

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 text-sm transition hover:bg-subtle/60">
        <input type="checkbox" checked={acknowledged} onChange={(event) => onAcknowledge(event.target.checked)} className="mt-0.5 size-[1.125rem] shrink-0 accent-brand" />
        <span>I understand {naira(total)} will leave the LotGrids fleet wallet and can&apos;t be undone.</span>
      </label>
    </div>
  );
}

const ROW_STYLES: Record<RowState, { icon: ReactNode; text: string }> = {
  queued: { icon: <span className="size-2 rounded-full bg-border" />, text: "Waiting" },
  sending: { icon: <span className="size-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />, text: "Sending..." },
  done: { icon: <span className="flex size-5 items-center justify-center rounded-full bg-success text-white"><Icon name="check" className="size-3" /></span>, text: "Credited" },
  failed: { icon: <span className="flex size-5 items-center justify-center rounded-full bg-danger text-white"><Icon name="x" className="size-3" /></span>, text: "Failed" },
  unconfirmed: { icon: <span className="flex size-5 items-center justify-center rounded-full bg-danger-soft text-danger"><Icon name="info" className="size-3.5" /></span>, text: "Unconfirmed" },
  skipped: { icon: <span className="size-2 rounded-full bg-muted" />, text: "Not sent" },
};

function RunStep({ rows, running, halt }: { rows: RunRow[]; running: boolean; halt: Halt }) {
  const listRef = useRef<HTMLUListElement>(null);
  const done = rows.filter((row) => row.state === "done");
  const failed = rows.filter((row) => row.state === "failed" || row.state === "unconfirmed").length;
  const settled = rows.filter((row) => row.state !== "queued" && row.state !== "sending").length;
  const credited = done.reduce((sum, row) => sum + row.amount, 0);
  const sendingIndex = rows.findIndex((row) => row.state === "sending");

  // Keep the row being sent in view on long batches.
  useEffect(() => {
    if (sendingIndex < 0) return;
    listRef.current?.children[sendingIndex]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [sendingIndex]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border p-4">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <p className="text-2xl font-semibold tabular-nums">
            {settled} <span className="text-base font-normal text-muted">of {rows.length} processed</span>
          </p>
          <p className="text-sm text-muted">
            <span className="font-semibold tabular-nums text-success">{naira(credited)}</span> credited to {done.length}
          </p>
        </div>
        <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-subtle" role="progressbar" aria-valuemin={0} aria-valuemax={rows.length} aria-valuenow={settled}>
          <div className="h-full bg-success transition-[width] duration-300" style={{ width: `${(done.length / Math.max(rows.length, 1)) * 100}%` }} />
          <div className="h-full bg-danger transition-[width] duration-300" style={{ width: `${(failed / Math.max(rows.length, 1)) * 100}%` }} />
        </div>
        {running && <p className="mt-2 text-xs text-muted">Keep this window open. You can stop the batch after the current grant.</p>}
      </div>

      {!running && halt === "fleet" && <Alert tone="error">The fleet wallet ran short, so the batch stopped. Fund it on the LotGrids Partner Dashboard, then retry the unsent drivers.</Alert>}
      {!running && halt === "unconfirmed" && (
        <Alert tone="error">The batch paused because LotGrids didn&apos;t confirm one grant in time. Check that driver&apos;s balance and the ledger first. Retrying only sends to the drivers marked &quot;Not sent&quot;, never the unconfirmed one.</Alert>
      )}
      {!running && halt === "stopped" && <Alert>You stopped the batch. Drivers marked &quot;Not sent&quot; weren&apos;t credited.</Alert>}
      {!running && !halt && failed === 0 && rows.length > 0 && <Alert tone="success">Every driver in this batch was credited.</Alert>}

      <ul ref={listRef} className="max-h-[min(22rem,40dvh)] divide-y divide-border overflow-y-auto overscroll-contain rounded-xl border border-border">
        {rows.map((row) => {
          const style = ROW_STYLES[row.state];
          return (
            <li key={row.driver.id} className={`flex items-start gap-3 px-3 py-2.5 text-sm transition-colors sm:px-4 ${row.state === "sending" ? "bg-brand-soft/60" : ""}`}>
              <span className="flex size-5 shrink-0 items-center justify-center pt-0.5">{style.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-3">
                  <span className="truncate font-medium">{fullName(row.driver)}</span>
                  <span className="shrink-0 font-semibold tabular-nums">{naira(row.amount)}</span>
                </span>
                <span className={`mt-0.5 block text-xs ${row.state === "failed" || row.state === "unconfirmed" ? "text-danger" : "text-muted"}`}>
                  {row.message ?? style.text}
                </span>
                {row.state === "unconfirmed" && (
                  <Link href={`/drivers/${row.driver.id}`} target="_blank" className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
                    Check balance <Icon name="external" className="size-3" />
                  </Link>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
