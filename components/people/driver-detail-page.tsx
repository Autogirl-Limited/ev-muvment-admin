"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";

import { AccessDenied } from "@/components/dashboard/access-denied";
import { EmptyState, Icon } from "@/components/dashboard/screen-kit";
import { ActionMenu, type MenuAction } from "@/components/people/action-menu";
import { ActiveBadge, Avatar, Card, CardLink, CopyButton, InfoRow, ShiftBadge } from "@/components/people/people-parts";
import { DeleteUserDialog, ResetCredentialsDialog, ToggleActiveDialog } from "@/components/people/user-actions";
import { AssignVehicleDialog, UnassignVehicleDialog } from "@/components/people/vehicle-dialogs";
import { FreeGrantDialog } from "@/components/wallet/ev-wallet-page";
import { lagosToday } from "@/components/ui/date-range-picker";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/browser";
import { getVehicle } from "@/lib/api/configuration";
import { listDailyChecklists, type ChecklistResponse } from "@/lib/api/daily-checklists";
import { listChargeSessions, type ChargeSession } from "@/lib/api/charge-sessions";
import { listDvaTransactions, resyncDriverDva, type DvaTransaction, type Paginated } from "@/lib/api/staff";
import { listWalletAllocations, type AllocationStatus, type WalletAllocation } from "@/lib/api/wallet";
import { LAGOS, formatDateTime, formatRelative, fullName, kwh, naira } from "@/lib/format";
import { useUserGuards } from "@/lib/hooks/use-user-guards";
import { CACHE } from "@/lib/query/cache";
import { queryKeys } from "@/lib/query/keys";
import { useCurrentUser } from "@/lib/query/user";
import { useManagedUser } from "@/lib/query/users";

const RECENT = 5;

const ALLOCATION_STATUS: Record<AllocationStatus, { label: string; tone: "neutral" | "brand" | "success" | "danger" }> = {
  PENDING_PAYMENT: { label: "Awaiting payment", tone: "neutral" },
  AWAITING_ALLOCATION: { label: "Awaiting allocation", tone: "brand" },
  COMPLETED: { label: "Completed", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "danger" },
  EXPIRED: { label: "Expired", tone: "danger" },
};

function daysAgoLagos(days: number) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: LAGOS }).format(new Date(Date.now() - days * 86_400_000));
}

// ---------- Building blocks ----------
function Tile({ label, value, hint, href, tone = "", loading }: { label: string; value: ReactNode; hint: string; href: string; tone?: string; loading?: boolean }) {
  return (
    <Link href={href} className="group rounded-xl border border-border bg-surface p-4 shadow-card transition hover:border-brand/50 focus-visible:outline-2 focus-visible:outline-brand">
      <span className="flex items-center justify-between text-xs font-medium uppercase text-muted">
        {label}
        <Icon name="arrowRight" className="size-3.5 opacity-0 transition group-hover:opacity-100" />
      </span>
      <span className={`mt-2 block text-2xl font-semibold tabular-nums ${tone}`}>{loading ? "…" : value}</span>
      <span className="mt-1 block text-xs text-muted">{hint}</span>
    </Link>
  );
}

/** Loading, error and empty handling shared by the "recent activity" cards. */
function RecentList<T extends { id: string }>({ query, empty, children }: { query: UseQueryResult<Paginated<T>>; empty: string; children: (item: T) => ReactNode }) {
  if (query.isLoading) {
    return (
      <div role="status" aria-label="Loading" className="animate-pulse divide-y divide-border">
        {[0, 1, 2].map((row) => <div key={row} className="h-14 bg-subtle/30" />)}
      </div>
    );
  }
  if (query.isError) {
    return (
      <p className="px-5 py-8 text-center text-sm text-muted">
        Couldn&apos;t load this. <button type="button" onClick={() => query.refetch()} className="font-medium text-brand hover:underline">Try again</button>
      </p>
    );
  }
  const items = query.data?.items ?? [];
  if (items.length === 0) return <p className="px-5 py-8 text-center text-sm text-muted">{empty}</p>;
  return <ul className="divide-y divide-border">{items.map((item) => <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">{children(item)}</li>)}</ul>;
}

function Row({ title, sub, aside, asideSub }: { title: ReactNode; sub?: ReactNode; aside?: ReactNode; asideSub?: ReactNode }) {
  return (
    <>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{title}</p>
        {sub && <p className="mt-0.5 truncate text-xs text-muted">{sub}</p>}
      </div>
      <div className="shrink-0 text-right">
        <div className="text-sm font-semibold tabular-nums">{aside}</div>
        {asideSub && <div className="mt-0.5 text-xs text-muted">{asideSub}</div>}
      </div>
    </>
  );
}

// ---------- Page ----------
export function DriverDetailPage({ id }: { id: string }) {
  const me = useCurrentUser();
  const isAdmin = me.user_type === "ADMIN";
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const query = useManagedUser(id, isAdmin);
  const driver = query.data;
  const guards = useUserGuards(driver);

  const [dialog, setDialog] = useState<"grant" | "assign" | "unassign" | "credentials" | "active" | "delete" | null>(null);
  const close = () => setDialog(null);

  // A staff id typed into /drivers/… belongs on the staff page.
  const isStaffRecord = driver ? driver.user_type !== "DRIVER" : false;
  useEffect(() => {
    if (isStaffRecord) router.replace(`/staff/${id}`);
  }, [id, isStaffRecord, router]);

  const isDriver = Boolean(driver) && !isStaffRecord;
  const vehicleId = driver?.vehicle?.id;

  const vehicle = useQuery({
    queryKey: queryKeys.vehicles.detail(vehicleId ?? ""),
    queryFn: ({ signal }) => getVehicle(vehicleId!, signal),
    enabled: Boolean(vehicleId),
    ...CACHE.list,
  });
  const transactions = useQuery({
    queryKey: queryKeys.dvaTransactions.list({ page: 1, page_size: RECENT, userId: id }),
    queryFn: ({ signal }) => listDvaTransactions({ page: 1, page_size: RECENT, userId: id }, signal),
    enabled: isDriver,
    ...CACHE.live,
  });
  const chargeSessions = useQuery({
    queryKey: queryKeys.chargeSessions.list({ page: 1, page_size: RECENT, userId: id }),
    queryFn: ({ signal }) => listChargeSessions({ page: 1, page_size: RECENT, userId: id }, signal),
    enabled: isDriver,
    ...CACHE.live,
  });
  const allocations = useQuery({
    queryKey: queryKeys.walletAllocations.list({ page: 1, page_size: RECENT, userId: id }),
    queryFn: ({ signal }) => listWalletAllocations({ page: 1, page_size: RECENT, userId: id }, signal),
    enabled: isDriver,
    ...CACHE.live,
  });
  const awaiting = useQuery({
    queryKey: queryKeys.walletAllocations.list({ page: 1, page_size: 1, userId: id, status: "AWAITING_ALLOCATION" }),
    queryFn: ({ signal }) => listWalletAllocations({ page: 1, page_size: 1, userId: id, status: "AWAITING_ALLOCATION" }, signal),
    enabled: isDriver,
    ...CACHE.live,
  });
  const checklists = useQuery({
    queryKey: queryKeys.dailyChecklists.list({ page: 1, page_size: RECENT, driverId: id }),
    queryFn: ({ signal }) => listDailyChecklists({ page: 1, page_size: RECENT, driverId: id }, signal),
    enabled: isDriver,
    ...CACHE.live,
  });
  const needsReview = useQuery({
    queryKey: queryKeys.dailyChecklists.list({ page: 1, page_size: 1, driverId: id, needsReview: true }),
    queryFn: ({ signal }) => listDailyChecklists({ page: 1, page_size: 1, driverId: id, needsReview: true }, signal),
    enabled: isDriver,
    ...CACHE.live,
  });

  const recreateBank = useMutation({
    mutationFn: () => resyncDriverDva(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      toast.success("Bank account created.");
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Couldn't create the bank account. Try again."),
  });

  if (!isAdmin) return <AccessDenied />;

  if (query.isLoading || isStaffRecord) {
    return (
      <div className="space-y-5" role="status" aria-label="Loading driver">
        <div className="h-24 animate-pulse rounded-2xl bg-subtle/50" />
        <div className="grid gap-3 sm:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-subtle/50" />)}</div>
        <div className="h-64 animate-pulse rounded-2xl bg-subtle/40" />
      </div>
    );
  }

  if (query.isError || !driver) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <section className="rounded-2xl border border-border bg-surface shadow-card">
        <EmptyState
          icon="users"
          title={notFound ? "Driver not found" : "Couldn't load this driver"}
          action={
            <div className="flex gap-2">
              {!notFound && <Button variant="secondary" onClick={() => query.refetch()}>Try again</Button>}
              <Link href="/drivers" className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium transition hover:bg-subtle">Back to drivers</Link>
            </div>
          }
        >
          {notFound ? "This account may have been deleted." : query.error?.message}
        </EmptyState>
      </section>
    );
  }

  const name = fullName(driver);
  const fullVehicle = vehicle.data;
  const account = driver.virtual_account;
  const canGrant = driver.vehicle !== null;
  const since30 = daysAgoLagos(29);
  const today = lagosToday();

  const menu: MenuAction[] = [
    driver.vehicle
      ? { label: "Unassign vehicle", icon: "swap", onSelect: () => setDialog("unassign") }
      : { label: "Assign vehicle", icon: "car", onSelect: () => setDialog("assign"), disabledReason: driver.is_active ? null : "Reactivate this driver first." },
    { label: "Reset credentials", icon: "key", onSelect: () => setDialog("credentials") },
    { label: driver.is_active ? "Deactivate account" : "Reactivate account", icon: driver.is_active ? "userMinus" : "user", onSelect: () => setDialog("active"), disabledReason: driver.is_active ? guards.deactivate : null },
    { label: "Delete driver", icon: "trash", tone: "danger", onSelect: () => setDialog("delete"), disabledReason: guards.remove },
  ];

  return (
    <div className="space-y-5">
      <Link href="/drivers" className="inline-flex items-center gap-1.5 rounded-md py-1 text-sm font-medium text-muted transition hover:text-foreground pointer-coarse:py-2">
        <Icon name="arrowLeft" className="size-4" />
        Drivers
      </Link>

      {/* Identity + actions */}
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <Avatar person={driver} size="lg" />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <ActiveBadge active={driver.is_active} />
              <ShiftBadge onShift={driver.shift} />
              {!driver.vehicle && driver.is_active && <Badge tone="danger">No vehicle</Badge>}
              {!account && <Badge tone="danger">No bank account</Badge>}
            </div>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <span>@{driver.username}</span>
              {driver.phone_number && <span className="inline-flex items-center gap-1"><Icon name="phone" className="size-3.5" />{driver.phone_number}</span>}
              {driver.email && <span className="inline-flex min-w-0 items-center gap-1"><Icon name="mail" className="size-3.5 shrink-0" /><span className="truncate">{driver.email}</span></span>}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setDialog("grant")} disabled={!canGrant} title={canGrant ? undefined : "Assign a vehicle first"}>
            <Icon name="bolt" className="size-4" />
            Record free grant
          </Button>
          <ActionMenu actions={menu} />
        </div>
      </header>

      {/* Cross-feature KPIs, each jumping to the filtered screen */}
      <section aria-label="Overview" className="grid gap-3 sm:grid-cols-3">
        <Tile label="EV wallet" value={naira(driver.ev_wallet_balance)} hint="As of last top-up · open ledger" href={`/wallet?userId=${id}&range=all`} />
        <Tile
          label="Awaiting allocation"
          value={awaiting.data?.pagination.total_items ?? 0}
          hint="Paid top-ups LotGrids didn't accept"
          href={`/wallet?userId=${id}&status=AWAITING_ALLOCATION&range=all`}
          tone={(awaiting.data?.pagination.total_items ?? 0) > 0 ? "text-brand" : ""}
          loading={awaiting.isLoading}
        />
        <Tile
          label="Checklists to review"
          value={needsReview.data?.pagination.total_items ?? 0}
          hint="Flagged by the AI analysis"
          href={`/daily-checklists?driverId=${id}&review=true&from=${since30}&to=${today}`}
          tone={(needsReview.data?.pagination.total_items ?? 0) > 0 ? "text-danger" : ""}
          loading={needsReview.isLoading}
        />
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0 space-y-5">
          {/* Vehicle */}
          <Card title="Vehicle" icon="car" action={driver.vehicle ? <CardLink href={`/fleet-vehicles?q=${encodeURIComponent(fullVehicle?.plate_number ?? driver.vehicle.name)}`}>Open in fleet</CardLink> : undefined}>
            {driver.vehicle ? (
              <div className="space-y-4 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold">{driver.vehicle.name}</p>
                    <p className="text-sm text-muted">{driver.vehicle.vehicle_make.name} {driver.vehicle.vehicle_model.name} · {driver.vehicle.vehicle_type.name}</p>
                  </div>
                  {fullVehicle && <span className="rounded-md border border-border bg-subtle px-2.5 py-1 font-mono text-sm font-semibold tracking-wide">{fullVehicle.plate_number}</span>}
                </div>
                <dl className="grid gap-x-6 divide-y divide-border sm:grid-cols-2 sm:divide-y-0">
                  <InfoRow label="Location">{driver.vehicle.location_state}</InfoRow>
                  <InfoRow label="Assigned">{fullVehicle?.assigned_at ? formatDateTime(fullVehicle.assigned_at) : vehicle.isLoading ? "…" : "-"}</InfoRow>
                </dl>
                <div>
                  <Button variant="secondary" onClick={() => setDialog("unassign")}><Icon name="swap" className="size-4" />Unassign vehicle</Button>
                </div>
              </div>
            ) : (
              <div className="p-2">
                <EmptyState icon="car" title="No vehicle assigned" action={<Button onClick={() => setDialog("assign")} disabled={!driver.is_active}><Icon name="car" className="size-4" />Assign a vehicle</Button>}>
                  {driver.is_active ? "Drivers need a vehicle to receive EV credit and submit daily checklists." : "Reactivate this driver before assigning a vehicle."}
                </EmptyState>
              </div>
            )}
          </Card>

          {/* Bank account */}
          <Card title="Bank account" icon="bank" action={<CardLink href={`/dva-transactions?userId=${id}&dateFrom=&dateTo=`}>All transfers</CardLink>}>
            {account ? (
              <div className="space-y-3 p-4 sm:p-5">
                <p className="text-sm text-muted">{account.account_name}</p>
                <div className="grid gap-2">
                  {(account.banks.length ? account.banks : [{ bank_name: account.bank_name, bank_code: account.bank_code, account_number: account.account_number }]).map((bank) => (
                    <div key={`${bank.bank_code}-${bank.account_number}`} className="flex items-center justify-between gap-3 rounded-lg bg-subtle/60 px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{bank.bank_name}</p>
                        <p className="font-mono text-sm text-muted">{bank.account_number}</p>
                      </div>
                      <CopyButton value={bank.account_number} label={`Copy ${bank.bank_name} account number`} />
                    </div>
                  ))}
                </div>
                {account.status !== "ACTIVE" && <Alert tone="error">This bank account is inactive at the provider.</Alert>}
              </div>
            ) : (
              <div className="p-2">
                <EmptyState icon="bank" title="No bank account" action={<Button onClick={() => recreateBank.mutate()} loading={recreateBank.isPending}><Icon name="refresh" className="size-4" />Create bank account</Button>}>
                  This driver can&apos;t receive bank transfers yet. Creating one asks the payment provider for a new account.
                </EmptyState>
              </div>
            )}
          </Card>

          {/* Recent transfers */}
          <Card title="Recent transfers" icon="swap" action={<CardLink href={`/dva-transactions?userId=${id}&dateFrom=&dateTo=`}>View all</CardLink>}>
            <RecentList<DvaTransaction> query={transactions} empty="No transfers into this driver's bank account yet.">
              {(tx) => <Row title={tx.payer_name ?? "Unknown sender"} sub={`${tx.payer_bank_name ?? tx.payer_bank_code ?? "Bank transfer"} · ${formatRelative(tx.paid_at)}`} aside={naira(tx.amount)} />}
            </RecentList>
          </Card>

          {/* Charge sessions */}
          <Card title="Charge sessions" icon="bolt" action={<CardLink href={`/charge-sessions?userId=${id}&dateFrom=&dateTo=`}>View all</CardLink>}>
            <RecentList<ChargeSession> query={chargeSessions} empty="No charging history yet.">
              {(session) => <Row title={session.charger_id} sub={`Connector ${session.connector_id} · ${formatRelative(session.created_at)} · ${kwh(session.energy_kwh)}`} aside={naira(session.amount)} />}
            </RecentList>
          </Card>

          {/* Wallet allocations */}
          <Card title="Wallet allocations" icon="wallet" action={<CardLink href={`/wallet?userId=${id}&range=all`}>Open ledger</CardLink>}>
            <RecentList<WalletAllocation> query={allocations} empty="No wallet allocations yet.">
              {(item) => (
                <Row
                  title={item.type === "FREE_GRANT" ? "Free grant" : "Top-up"}
                  sub={`${formatRelative(item.created_at)} · ${item.kwh_equivalent.toLocaleString()} kWh`}
                  aside={naira(item.amount)}
                  asideSub={<Badge tone={ALLOCATION_STATUS[item.status].tone}>{ALLOCATION_STATUS[item.status].label}</Badge>}
                />
              )}
            </RecentList>
          </Card>

          {/* Checklists */}
          <Card title="Daily checklists" icon="clipboard" action={<CardLink href={`/daily-checklists?driverId=${id}&from=${since30}&to=${today}`}>Last 30 days</CardLink>}>
            <RecentList<ChecklistResponse> query={checklists} empty="No checklists submitted yet.">
              {(item) => (
                <Row
                  title={`${item.phase === "PICK_UP" ? "Pick-up" : "Drop-off"} · ${item.checklist_date}`}
                  sub={`${item.vehicle.name} · ${item.submitted_at ? `Submitted ${formatRelative(item.submitted_at)}` : "In progress"}`}
                  aside={item.needs_review ? <Badge tone="danger">Needs review</Badge> : <Badge tone={item.analysis?.status === "COMPLETED" ? "success" : "neutral"}>{item.analysis ? item.analysis.status.charAt(0) + item.analysis.status.slice(1).toLowerCase() : "Not analysed"}</Badge>}
                />
              )}
            </RecentList>
          </Card>
        </div>

        {/* Account */}
        <aside className="space-y-5 lg:sticky lg:top-20">
          <Card title="Account" icon="user">
            <dl className="divide-y divide-border px-4 sm:px-5">
              <InfoRow label="Username">@{driver.username}</InfoRow>
              <InfoRow label="Email">
                {driver.email ? <span className="inline-flex items-center gap-1">{driver.email}<CopyButton value={driver.email} label="Copy email" /></span> : "-"}
              </InfoRow>
              <InfoRow label="Phone">
                {driver.phone_number ? <span className="inline-flex items-center gap-1">{driver.phone_number}<CopyButton value={driver.phone_number} label="Copy phone number" /></span> : "-"}
              </InfoRow>
              <InfoRow label="Joined">{formatDateTime(driver.created_at)}</InfoRow>
              <InfoRow label="Last updated">{formatDateTime(driver.updated_at)}</InfoRow>
              <InfoRow label="Email OTP"><Badge tone={driver.two_factor_enabled ? "success" : "neutral"}>{driver.two_factor_enabled ? "On" : "Off"}</Badge></InfoRow>
              <InfoRow label="Authenticator"><Badge tone={driver.totp_enabled ? "success" : "neutral"}>{driver.totp_enabled ? "On" : "Off"}</Badge></InfoRow>
            </dl>
            <p className="border-t border-border px-4 py-3 text-xs text-muted sm:px-5">Contact details can&apos;t be edited. Security flags can lag a few minutes.</p>
          </Card>
        </aside>
      </div>

      <FreeGrantDialog open={dialog === "grant"} onClose={close} onChanged={() => queryClient.invalidateQueries({ queryKey: queryKeys.users.all })} presetDriver={driver} />
      <AssignVehicleDialog driver={dialog === "assign" ? driver : null} onClose={close} />
      <UnassignVehicleDialog driver={dialog === "unassign" ? driver : null} onClose={close} />
      <ResetCredentialsDialog user={dialog === "credentials" ? driver : null} onClose={close} />
      <ToggleActiveDialog user={dialog === "active" ? driver : null} onClose={close} />
      <DeleteUserDialog user={dialog === "delete" ? driver : null} onClose={close} onDeleted={() => router.replace("/drivers")} />
    </div>
  );
}
