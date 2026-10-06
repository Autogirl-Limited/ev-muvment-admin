"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AccessDenied } from "@/components/dashboard/access-denied";
import { ConfigPageHeader, EmptyState, ErrorState, Icon, SearchInput, SkeletonRows } from "@/components/dashboard/screen-kit";
import { CopyButton } from "@/components/people/people-parts";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal, ModalActions } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/browser";
import { listDriverOptions, type DriverOption } from "@/lib/api/configuration";
import { registerFleetWebhook, setSandboxDriverBalance, setSandboxFleetBalance, type FleetWebhook } from "@/lib/api/lotgrids";
import { listWalletAllocations } from "@/lib/api/wallet";
import { formatDateTime, fullName, naira } from "@/lib/format";
import { useDebounced } from "@/lib/hooks/use-debounced";
import { queryKeys } from "@/lib/query/keys";
import { useFleetBalance } from "@/lib/query/lotgrids";
import { useCurrentUser } from "@/lib/query/user";

const MAX_AMOUNT = 100_000_000;

function errorMessage(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) return fallback;
  if (error.status === 503) return "LotGrids isn't configured on the server (LOTGRIDS_API_KEY is missing).";
  if (error.status === 403) return "The server is on a live LotGrids key, so sandbox tools are disabled.";
  return error.message;
}

/** Whole, non-negative naira; `null` while empty or invalid. */
function parseAmount(text: string) {
  if (text.trim() === "") return null;
  const value = Number(text);
  return Number.isInteger(value) && value >= 0 && value <= MAX_AMOUNT ? value : null;
}

function EnvironmentBadge({ sandbox }: { sandbox: boolean }) {
  return sandbox ? <Badge tone="brand" dot>Sandbox</Badge> : <Badge tone="success" dot>Live</Badge>;
}

function AmountInput({ id, value, onChange, placeholder }: { id: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <div className="flex h-10 items-center rounded-lg border border-input bg-surface px-3 transition focus-within:border-brand focus-within:ring-3 focus-within:ring-brand/20 pointer-coarse:h-11">
      <span aria-hidden className="pr-2 text-muted">₦</span>
      <input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/[^\d]/g, "").slice(0, 9))}
        placeholder={placeholder}
        className="h-full min-w-0 flex-1 bg-transparent text-sm tabular-nums outline-none placeholder:text-muted/60 pointer-coarse:text-base"
      />
    </div>
  );
}

// ---------- Fleet wallet ----------

function FleetWalletCard() {
  const fleet = useFleetBalance(true);
  // Same key and query as the EV Wallet queue, so the two screens share one cached list.
  const queue = useQuery({
    queryKey: queryKeys.walletAllocations.queue,
    queryFn: ({ signal }) => listWalletAllocations({ page: 1, page_size: 100, status: "AWAITING_ALLOCATION" }, signal),
    refetchInterval: 60_000,
  });
  const stuck = queue.data?.items ?? [];
  const stuckTotal = stuck.reduce((sum, allocation) => sum + allocation.amount, 0);
  const balance = fleet.data?.wallet_balance ?? 0;

  return (
    <section aria-labelledby="fleet-wallet" className="relative overflow-hidden rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6">
      <span aria-hidden className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-brand-soft opacity-80 blur-3xl" />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 id="fleet-wallet" className="text-sm font-medium text-muted">Fleet wallet</h2>
            {fleet.data && <EnvironmentBadge sandbox={fleet.data.sandbox} />}
          </div>
          <Button variant="secondary" className="h-8 px-2.5" onClick={() => fleet.refetch()} loading={fleet.isFetching && !fleet.isLoading} aria-label="Refresh fleet balance">
            <Icon name="refresh" className="size-4" />
          </Button>
        </div>

        {fleet.isLoading ? (
          <div role="status" aria-label="Loading" className="mt-3 h-12 w-48 animate-pulse rounded-lg bg-subtle" />
        ) : fleet.isError ? (
          <div className="mt-3"><Alert tone="error">{errorMessage(fleet.error, "Couldn't read the fleet balance from LotGrids.")}</Alert></div>
        ) : fleet.data ? (
          <>
            <p className="mt-3 text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">{naira(fleet.data.wallet_balance)}</p>
            <p className="mt-2 text-sm text-muted">
              The pool every paid top-up and free grant is distributed from.
              {fleet.data.sandbox && " Sandbox money is fake."}
            </p>
            <div className="mt-4 flex items-center justify-between gap-3 rounded-lg bg-subtle/70 px-3 py-2">
              <div className="min-w-0">
                <p className="text-xs text-muted">Fleet ID</p>
                <p className="truncate font-mono text-sm">{fleet.data.fleet_id}</p>
              </div>
              <CopyButton value={fleet.data.fleet_id} label="Copy fleet ID" />
            </div>
            <p className="mt-2 text-xs text-muted">Updated {formatDateTime(new Date(fleet.dataUpdatedAt).toISOString())} · refreshes every minute</p>
          </>
        ) : null}

        {stuck.length > 0 && (
          <div className="mt-4 space-y-2">
            <Alert tone="error">
              {stuck.length} paid top-up{stuck.length === 1 ? "" : "s"} ({naira(stuckTotal)}) {stuck.length === 1 ? "is" : "are"} waiting on allocation.
              {fleet.data && balance < stuckTotal
                ? ` The fleet wallet is ${naira(stuckTotal - balance)} short. Fund it on the LotGrids Partner Dashboard, then retry them.`
                : " The fleet wallet can cover them now, so retry them."}
            </Alert>
            <Link href="/wallet?status=AWAITING_ALLOCATION" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline">
              Open failed allocations
              <Icon name="arrowRight" className="size-4" />
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

// ---------- Webhook ----------

const SETUP_STEPS = [
  "Set LOTGRIDS_API_KEY and LOTGRIDS_WEBHOOK_URL on the server, then deploy.",
  "Register the webhook here to get the signing secret.",
  "Put the secret in LOTGRIDS_WEBHOOK_SECRET, then redeploy.",
  "Check again here. It should say Connected.",
];

function WebhookCard() {
  const [result, setResult] = useState<FleetWebhook | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [customUrl, setCustomUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const register = useMutation({
    mutationFn: () => registerFleetWebhook(advanced && customUrl.trim() ? customUrl.trim() : undefined),
    onSuccess: (data) => {
      setResult(data);
      setRevealed(false);
      setError(null);
    },
    onError: (err) => setError(err instanceof ApiError ? (err.fieldErrors.webhook_url ?? errorMessage(err, "")) : "Couldn't reach LotGrids. Try again."),
  });

  const urlInvalid = advanced && customUrl.trim() !== "" && !/^https:\/\/\S+$/i.test(customUrl.trim());

  return (
    <section aria-labelledby="webhook" className="rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="webhook" className="text-base font-semibold">Session outcome webhook</h2>
          <p className="mt-1 text-sm text-muted">
            LotGrids tells us once when each charge ends: completed, or stopped early with a refund. Without it, sessions stay on
            &ldquo;Charging&rdquo; and refunds aren&apos;t recorded. LotGrids sends each update once and never retries.
          </p>
        </div>
        {result && (result.secret_matches_config ? <Badge tone="success" dot>Connected</Badge> : <Badge tone="danger" dot>Secret not set</Badge>)}
      </div>

      {result && (
        <div className="mt-5 space-y-3">
          {result.secret_matches_config ? (
            <Alert tone="success">LotGrids is pointed at this API and the server has the matching secret. Session outcomes and refunds are being recorded.</Alert>
          ) : (
            <Alert tone="error">
              The server&apos;s LOTGRIDS_WEBHOOK_SECRET doesn&apos;t match. Until it does, updates are rejected and sessions stay on &ldquo;Charging&rdquo;. Copy the secret below into it, redeploy, then check again.
            </Alert>
          )}
          <div className="flex items-center justify-between gap-3 rounded-lg bg-subtle/70 px-3 py-2">
            <div className="min-w-0">
              <p className="text-xs text-muted">Webhook URL</p>
              <p className="truncate font-mono text-sm" title={result.webhook_url}>{result.webhook_url}</p>
            </div>
            <CopyButton value={result.webhook_url} label="Copy webhook URL" />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg bg-subtle/70 px-3 py-2">
            <div className="min-w-0">
              <p className="text-xs text-muted">Signing secret (LOTGRIDS_WEBHOOK_SECRET)</p>
              <p className="truncate font-mono text-sm">{revealed ? result.webhook_secret : "•".repeat(Math.min(32, result.webhook_secret.length))}</p>
            </div>
            <div className="flex shrink-0 items-center">
              <button type="button" onClick={() => setRevealed((value) => !value)} className="rounded-md px-2 py-1 text-xs font-medium text-brand hover:bg-surface">
                {revealed ? "Hide" : "Show"}
              </button>
              <CopyButton value={result.webhook_secret} label="Copy signing secret" />
            </div>
          </div>
          <p className="text-xs text-muted">Test and live keys have different secrets. The secret stays the same if the URL changes.</p>
        </div>
      )}

      {!result?.secret_matches_config && (
        <ol className="mt-5 space-y-2 text-sm">
          {SETUP_STEPS.map((step, index) => (
            <li key={step} className="flex gap-3">
              <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-full bg-subtle text-xs font-semibold text-muted">{index + 1}</span>
              <span className="pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-5 space-y-3">
        <button type="button" onClick={() => setAdvanced((value) => !value)} className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-foreground" aria-expanded={advanced}>
          <Icon name="chevronRight" className={`size-4 transition-transform ${advanced ? "rotate-90" : ""}`} />
          Use a different URL
        </button>
        {advanced && (
          <div className="space-y-1.5">
            <label htmlFor="webhook-url" className="block text-sm font-medium">Webhook URL</label>
            <input
              id="webhook-url"
              type="url"
              value={customUrl}
              onChange={(event) => setCustomUrl(event.target.value.slice(0, 500))}
              placeholder="https://api.example.com/api/v1/charging-sessions/webhooks/lotgrids"
              aria-invalid={urlInvalid || undefined}
              className={`h-10 w-full rounded-lg border bg-surface px-3 font-mono text-sm outline-none focus:ring-3 ${urlInvalid ? "border-danger focus:ring-danger/20" : "border-input focus:border-brand focus:ring-brand/20"}`}
            />
            <p className={`text-xs ${urlInvalid ? "text-danger" : "text-muted"}`}>
              {urlInvalid ? "Use a full https:// URL." : "Leave empty to use the server's LOTGRIDS_WEBHOOK_URL. This re-points LotGrids for the current key."}
            </p>
          </div>
        )}
        {error && <Alert tone="error">{error}</Alert>}
        <Button onClick={() => register.mutate()} loading={register.isPending} disabled={urlInvalid}>
          {result ? "Check again" : "Register and check webhook"}
        </Button>
      </div>
    </section>
  );
}

// ---------- Sandbox ----------

/** Sets a driver's sandbox sub-wallet. Pass `driver` to skip the picker (driver detail page). */
export function SandboxDriverBalanceDialog({ open, onClose, driver: presetDriver }: { open: boolean; onClose: () => void; driver?: { id: string; first_name: string; last_name: string; username: string; ev_wallet_balance?: number } }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<DriverOption | null>(null);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const debounced = useDebounced(search.trim());
  const driver = presetDriver ?? picked;
  const value = parseAmount(amount);

  const drivers = useQuery({
    queryKey: queryKeys.users.assignableDrivers(debounced),
    queryFn: ({ signal }) => listDriverOptions(debounced, signal),
    enabled: open && !presetDriver,
  });

  const close = () => {
    setPicked(null);
    setAmount("");
    setSearch("");
    setError(null);
    onClose();
  };

  const save = useMutation({
    mutationFn: () => setSandboxDriverBalance(driver!.id, value!),
    onSuccess: ({ balance }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      toast.success(`${fullName(driver!)}'s sandbox wallet is now ${naira(balance)}.`);
      close();
    },
    onError: (err) => setError(errorMessage(err, "Couldn't set the balance. Try again.")),
  });

  return (
    <Modal open={open} onClose={save.isPending ? () => {} : close} title="Set sandbox driver balance" size={presetDriver ? "md" : "lg"}>
      <div className="space-y-4">
        <Alert>Sets the driver&apos;s LotGrids sandbox wallet (and their EV wallet balance here) to this exact amount. It replaces the balance rather than adding to it. Set it low to test &ldquo;not enough balance&rdquo; on charging.</Alert>
        {presetDriver ? (
          <div className="rounded-lg border border-border bg-subtle/50 px-4 py-3">
            <p className="font-medium">{fullName(presetDriver)}</p>
            {presetDriver.ev_wallet_balance !== undefined && <p className="text-sm text-muted">Currently {naira(presetDriver.ev_wallet_balance)}</p>}
          </div>
        ) : (
          <>
            <SearchInput value={search} onChange={setSearch} placeholder="Search driver" />
            <div className="max-h-48 overflow-y-auto rounded-lg border border-border">
              {drivers.isLoading ? (
                <SkeletonRows rows={3} columns={2} />
              ) : drivers.data?.items.length ? (
                <div className="divide-y divide-border">
                  {drivers.data.items.map((item) => (
                    <button key={item.id} type="button" onClick={() => setPicked(item)} className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-subtle ${picked?.id === item.id ? "bg-brand-soft" : ""}`}>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{fullName(item)}</span>
                        <span className="block truncate text-sm text-muted">@{item.username}</span>
                      </span>
                      {picked?.id === item.id && <Icon name="check" className="size-4 shrink-0 text-brand" />}
                    </button>
                  ))}
                </div>
              ) : (
                <EmptyState icon="search" title="No drivers found" />
              )}
            </div>
          </>
        )}
        <div className="space-y-1.5">
          <label htmlFor="sandbox-driver-amount" className="block text-sm font-medium">New balance</label>
          <AmountInput id="sandbox-driver-amount" value={amount} onChange={setAmount} placeholder="500" />
          <p className="text-xs text-muted">Whole naira. 0 empties the wallet.</p>
        </div>
        {error && <Alert tone="error">{error}</Alert>}
      </div>
      <ModalActions>
        <Button variant="secondary" onClick={close} disabled={save.isPending}>Cancel</Button>
        <Button onClick={() => { setError(null); save.mutate(); }} loading={save.isPending} disabled={!driver || value === null}>
          {value === null ? "Set balance" : `Set to ${naira(value)}`}
        </Button>
      </ModalActions>
    </Modal>
  );
}

function SandboxCard() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [fleetAmount, setFleetAmount] = useState("");
  const [driverOpen, setDriverOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = parseAmount(fleetAmount);

  const setFleet = useMutation({
    mutationFn: () => setSandboxFleetBalance(value!),
    onSuccess: ({ balance }) => {
      queryClient.setQueryData(queryKeys.lotgrids.fleetBalance, (current: { wallet_balance: number } | undefined) =>
        current ? { ...current, wallet_balance: balance } : current,
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.lotgrids.all });
      setFleetAmount("");
      setError(null);
      toast.success(`Sandbox fleet wallet set to ${naira(balance)}.`);
    },
    onError: (err) => setError(errorMessage(err, "Couldn't set the fleet balance. Try again.")),
  });

  return (
    <section aria-labelledby="sandbox" className="rounded-2xl border border-dashed border-brand/40 bg-surface p-5 shadow-card sm:p-6">
      <div className="flex items-center gap-2">
        <h2 id="sandbox" className="text-base font-semibold">Sandbox tools</h2>
        <Badge tone="brand">Test key only</Badge>
      </div>
      <p className="mt-1 text-sm text-muted">Fake money for testing. In the sandbox, the outcome webhook arrives about 60 seconds after a charge starts.</p>

      <form
        noValidate
        className="mt-5 space-y-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          if (value !== null) setFleet.mutate();
        }}
      >
        <label htmlFor="sandbox-fleet-amount" className="block text-sm font-medium">Fleet wallet balance</label>
        <div className="flex gap-2">
          <div className="min-w-0 flex-1"><AmountInput id="sandbox-fleet-amount" value={fleetAmount} onChange={setFleetAmount} placeholder="100000" /></div>
          <Button type="submit" loading={setFleet.isPending} disabled={value === null}>Set</Button>
        </div>
        <p className="text-xs text-muted">Replaces the balance. Set it to 0 to test top-ups that fail and wait on allocation.</p>
      </form>
      {error && <div className="mt-3"><Alert tone="error">{error}</Alert></div>}

      <div className="mt-5 flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">Driver wallet balance</p>
          <p className="text-xs text-muted">Set one driver&apos;s sandbox wallet. They&apos;re registered on LotGrids first if needed.</p>
        </div>
        <Button variant="secondary" onClick={() => setDriverOpen(true)}>Set driver balance</Button>
      </div>

      <SandboxDriverBalanceDialog open={driverOpen} onClose={() => setDriverOpen(false)} />
    </section>
  );
}

// ---------- Page ----------

export function LotGridsPage() {
  const user = useCurrentUser();
  const isAdmin = user.user_type === "ADMIN";
  const fleet = useFleetBalance(isAdmin);

  if (!isAdmin) return <AccessDenied />;

  return (
    <div>
      <ConfigPageHeader
        icon="bolt"
        title="LotGrids"
        description="The charging provider behind every driver wallet: the fleet wallet that funds them, the webhook that records how each charge ended, and sandbox tools on a test key."
      />

      {fleet.isError && fleet.error instanceof ApiError && fleet.error.status === 503 ? (
        <div className="rounded-2xl border border-border bg-surface shadow-card">
          <ErrorState message={errorMessage(fleet.error, "")} onRetry={() => fleet.refetch()} />
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-5">
            <FleetWalletCard />
            {fleet.data?.sandbox ? (
              <SandboxCard />
            ) : fleet.data ? (
              <div className="flex items-start gap-3 rounded-xl border border-border bg-subtle/60 p-4 text-sm text-muted">
                <Icon name="lock" className="mt-0.5 size-5 shrink-0" />
                <p>The server is on a live key, so sandbox tools are hidden. Fund the fleet wallet on the LotGrids Partner Dashboard.</p>
              </div>
            ) : null}
          </div>
          <WebhookCard />
        </div>
      )}
    </div>
  );
}
