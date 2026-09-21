"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";

import { AccessDenied } from "@/components/dashboard/access-denied";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Modal, ModalActions } from "@/components/ui/modal";
import { ApiError } from "@/lib/api/browser";
import {
  approveDriverApplication,
  getDriverApplication,
  listDriverApplications,
  rejectDriverApplication,
  sendDriverCredentials,
  type ApplicationStatus,
  type DriverApplication,
  type VirtualAccount,
} from "@/lib/api/staff";
import { queryKeys } from "@/lib/query/keys";
import { useCurrentUser } from "@/lib/query/user";

const STATUSES: Array<ApplicationStatus | "ALL"> = ["PENDING", "APPROVED", "REJECTED", "ALL"];
const PAGE_SIZE = 20;

function fullName(app: DriverApplication) {
  return `${app.first_name} ${app.last_name}`.trim();
}

function dash(value: string | number | null | undefined) {
  return value === null || value === undefined || value === "" ? "-" : value;
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const minute = 60_000;
  const hour = minute * 60;
  const day = hour * 24;
  if (diff < minute) return "just now";
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  return `${Math.floor(diff / day)}d ago`;
}

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lagos",
  }).format(new Date(iso));
}

function naira(value: number | null | undefined) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value ?? 0);
}

function statusTone(status: ApplicationStatus) {
  if (status === "APPROVED") return "bg-success-soft text-success";
  if (status === "REJECTED") return "bg-danger-soft text-danger";
  return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300";
}

function StatusBadge({ status }: { status: ApplicationStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusTone(status)}`}>
      {status.toLowerCase()}
    </span>
  );
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{account.account_name}</p>
          <p className="mt-1 text-xs text-muted">{account.provider} · {account.currency} · {account.status}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-2">
        {banks.map((bank) => (
          <div key={`${bank.bank_code}-${bank.account_number}`} className="flex items-center justify-between gap-3 rounded-lg bg-surface px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{bank.bank_name}</p>
              <p className="font-mono text-sm text-muted">{bank.account_number}</p>
            </div>
            <CopyButton value={bank.account_number} label={`Copy ${bank.bank_name} account number`} />
          </div>
        ))}
      </div>
    </div>
  );
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, index) => (
        <tr key={index} className="animate-pulse border-t border-border">
          <td className="px-4 py-4"><div className="h-4 w-40 rounded bg-subtle" /></td>
          <td className="px-4 py-4"><div className="h-4 w-52 rounded bg-subtle" /></td>
          <td className="px-4 py-4"><div className="h-4 w-20 rounded bg-subtle" /></td>
          <td className="px-4 py-4"><div className="h-4 w-28 rounded bg-subtle" /></td>
          <td className="px-4 py-4"><div className="h-6 w-20 rounded-full bg-subtle" /></td>
        </tr>
      ))}
    </>
  );
}

function SkeletonCards() {
  return (
    <div className="grid gap-3 p-3 md:hidden">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="animate-pulse rounded-lg border border-border bg-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="h-4 w-36 rounded bg-subtle" />
              <div className="h-3 w-28 rounded bg-subtle" />
            </div>
            <div className="h-6 w-20 rounded-full bg-subtle" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="h-12 rounded-lg bg-subtle" />
            <div className="h-12 rounded-lg bg-subtle" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ApplicationCard({ app, onOpen }: { app: DriverApplication; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-lg border border-border bg-surface p-4 text-left shadow-card transition active:scale-[0.99] hover:border-brand/50 hover:bg-subtle/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold">{fullName(app)}</p>
          <p className="mt-0.5 truncate text-xs text-muted">@{app.username} · {dash(app.driver_license_number)}</p>
        </div>
        <StatusBadge status={app.status} />
      </div>
      <div className="mt-4 grid gap-2 text-sm">
        <div className="rounded-lg bg-subtle/70 p-3">
          <p className="text-xs text-muted">Contact</p>
          <p className="mt-1 truncate font-medium">{dash(app.email)}</p>
          <p className="truncate text-xs text-muted">{dash(app.phone_number)}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-subtle/70 p-3">
            <p className="text-xs text-muted">Experience</p>
            <p className="mt-1 font-medium">{app.years_of_experience} years</p>
          </div>
          <div className="rounded-lg bg-subtle/70 p-3">
            <p className="text-xs text-muted">Applied</p>
            <p className="mt-1 font-medium" title={formatDateTime(app.created_at)}>{relativeTime(app.created_at)}</p>
          </div>
        </div>
      </div>
    </button>
  );
}

function DetailTile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg bg-subtle/60 p-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 break-words font-medium">{children}</dd>
    </div>
  );
}

function CredentialSendMenu({
  email,
  phone,
  loading,
  onSend,
}: {
  email: string | null;
  phone: string | null;
  loading: boolean;
  onSend: (channel: "EMAIL" | "SMS") => void;
}) {
  const [open, setOpen] = useState(false);
  const hasEmail = Boolean(email);
  const hasPhone = Boolean(phone);

  return (
    <div className="relative">
      <Button variant="secondary" disabled={loading || (!hasEmail && !hasPhone)} onClick={() => setOpen((value) => !value)} fullWidth>
        Send Credential
      </Button>
      {open && (
        <div className="mt-2 w-full rounded-lg border border-border bg-surface p-2 shadow-card sm:absolute sm:left-0 sm:z-20 sm:w-64">
          <button
            type="button"
            disabled={!hasEmail || loading}
            onClick={() => {
              onSend("EMAIL");
              setOpen(false);
            }}
            className="flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="mt-0.5 size-2 rounded-full bg-brand" />
            <span className="min-w-0">
              <span className="block font-medium">Email</span>
              <span className="block truncate text-xs text-muted">{email ?? "No email on file"}</span>
            </span>
          </button>
          <button
            type="button"
            disabled={!hasPhone || loading}
            onClick={() => {
              onSend("SMS");
              setOpen(false);
            }}
            className="mt-1 flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="mt-0.5 size-2 rounded-full bg-brand" />
            <span className="min-w-0">
              <span className="block font-medium">SMS</span>
              <span className="block truncate text-xs text-muted">{phone ?? "No phone on file"}</span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

function useDebounced(value: string, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [delay, value]);
  return debounced;
}

export function DriverApplicationsPage() {
  const user = useCurrentUser();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ApplicationStatus | "ALL">(() => {
    if (typeof window === "undefined") return "PENDING";
    const value = new URLSearchParams(window.location.search).get("status");
    return value === "APPROVED" || value === "REJECTED" || value === "ALL" ? value : "PENDING";
  });
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [approveTarget, setApproveTarget] = useState<DriverApplication | null>(null);
  const [approvedApp, setApprovedApp] = useState<DriverApplication | null>(null);
  const [rejectTarget, setRejectTarget] = useState<DriverApplication | null>(null);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const isAdmin = user.user_type === "ADMIN";

  const filters = useMemo(
    () => ({
      page,
      page_size: PAGE_SIZE,
      status: status === "ALL" ? undefined : status,
      searchTerm: debouncedSearch.trim() || undefined,
    }),
    [debouncedSearch, page, status],
  );

  useEffect(() => {
    const params = new URLSearchParams();
    if (status !== "PENDING") params.set("status", status);
    if (page > 1) params.set("page", String(page));
    if (debouncedSearch.trim()) params.set("searchTerm", debouncedSearch.trim());
    const next = params.toString() ? `${pathname}?${params}` : pathname;
    router.replace(next, { scroll: false });
  }, [debouncedSearch, page, pathname, router, status]);

  const list = useQuery({
    queryKey: queryKeys.driverApplications.list(filters),
    queryFn: ({ signal }) => listDriverApplications(filters, signal),
    enabled: isAdmin,
    refetchOnWindowFocus: true,
    refetchInterval: () => (typeof document !== "undefined" && document.visibilityState === "visible" ? 60_000 : false),
  });

  const counts = useQuery({
    queryKey: queryKeys.driverApplications.counts(debouncedSearch.trim()),
    queryFn: async ({ signal }) => {
      const entries = await Promise.all(
        (["PENDING", "APPROVED", "REJECTED"] as ApplicationStatus[]).map(async (item) => [
          item,
          (await listDriverApplications({ page: 1, page_size: 1, status: item, searchTerm: debouncedSearch.trim() || undefined }, signal)).pagination.total_items,
        ] as const),
      );
      return Object.fromEntries(entries) as Record<ApplicationStatus, number>;
    },
    enabled: isAdmin,
  });

  const detail = useQuery({
    queryKey: queryKeys.driverApplications.detail(selectedId ?? ""),
    queryFn: ({ signal }) => getDriverApplication(selectedId!, signal),
    enabled: isAdmin && Boolean(selectedId),
  });

  const invalidateApplications = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.driverApplications.all });
  };

  const approve = useMutation({
    mutationFn: (id: string) => approveDriverApplication(id),
    onSuccess: (app) => {
      setApprovedApp(app);
      setApproveTarget(null);
      setSelectedId(app.id);
      invalidateApplications();
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        if (error.status === 502) return setNotice(`${error.message} Nothing was created, so it is safe to try again.`);
        if (error.status === 409 && /already been/i.test(error.message)) {
          invalidateApplications();
          setApproveTarget(null);
          return setNotice(error.message);
        }
        if (error.status === 409) return setNotice(`${error.message}. Reject the application with applicant-facing guidance, or resolve the duplicate account first.`);
        if (error.status === 404) {
          invalidateApplications();
          setApproveTarget(null);
          return setNotice("This application no longer exists. The list was refreshed.");
        }
      }
      setNotice("Approval failed. Please try again.");
    },
  });

  const reject = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => rejectDriverApplication(id, text),
    onSuccess: () => {
      setRejectTarget(null);
      setReason("");
      setNotice("Application rejected.");
      invalidateApplications();
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        if (error.status === 422) return setNotice("Reason must be 500 characters or fewer.");
        if (error.status === 409) {
          invalidateApplications();
          setRejectTarget(null);
          return setNotice(error.message);
        }
        if (error.status === 404) return setNotice("This application no longer exists.");
      }
      setNotice("Rejection failed. Please try again.");
    },
  });

  const resend = useMutation({
    mutationFn: ({ userId, channel }: { userId: string; channel: "EMAIL" | "SMS" }) => sendDriverCredentials(userId, channel),
    onSuccess: (_, vars) => setNotice(`Credentials sent by ${vars.channel.toLowerCase()}.`),
    onError: (error) => setNotice(error instanceof ApiError ? error.message : "Credentials could not be sent."),
  });

  const data = list.data;
  const selected = detail.data;
  const updatedAt = list.dataUpdatedAt ? new Date(list.dataUpdatedAt) : null;

  if (!isAdmin) return <AccessDenied />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Driver applications"
        description="Review pending applicants, approve driver accounts with bank accounts, and recover cleanly when provider or duplicate-account issues happen."
      />

      {notice && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-surface p-3 text-sm shadow-card">
          <p>{notice}</p>
          <button type="button" onClick={() => setNotice(null)} className="text-muted hover:text-foreground">Dismiss</button>
        </div>
      )}

      <section className="rounded-lg border border-border bg-surface shadow-card">
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((item) => (
              <button
                type="button"
                key={item}
                onClick={() => {
                  setStatus(item);
                  setPage(1);
                }}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${status === item ? "bg-brand text-brand-foreground" : "bg-subtle text-muted hover:text-foreground"}`}
              >
                {item === "ALL" ? "All" : item[0] + item.slice(1).toLowerCase()}
                {item !== "ALL" && (
                  <span className="ml-2 rounded-full bg-background/60 px-1.5 py-0.5 text-xs">
                    {counts.data?.[item] ?? "-"}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="relative">
              <span className="sr-only">Search applications</span>
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value.slice(0, 200));
                  setPage(1);
                }}
                placeholder="Name, username, email, phone or license"
                className="h-10 w-full rounded-lg border border-input bg-surface px-3 text-sm outline-none transition focus:border-brand focus:ring-3 focus:ring-brand/20 sm:w-80"
              />
            </label>
            <Button variant="secondary" onClick={() => list.refetch()} loading={list.isRefetching}>
              Refresh
            </Button>
          </div>
        </div>

        {list.isLoading ? (
          <SkeletonCards />
        ) : data?.items.length ? (
          <div className="grid gap-3 p-3 md:hidden">
            {data.items.map((app) => (
              <ApplicationCard key={app.id} app={app} onOpen={() => setSelectedId(app.id)} />
            ))}
          </div>
        ) : (
          <div className="p-3 md:hidden">
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted">
              No {status === "ALL" ? "" : status.toLowerCase()} applications found.
            </div>
          </div>
        )}

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[58rem] text-left text-sm">
            <thead className="bg-subtle/70 text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Applicant</th>
                <th className="px-4 py-3 font-semibold">Contact</th>
                <th className="px-4 py-3 font-semibold">Experience</th>
                <th className="px-4 py-3 font-semibold">Applied</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {list.isLoading ? (
                <SkeletonRows />
              ) : data?.items.length ? (
                data.items.map((app) => (
                  <tr
                    key={app.id}
                    onClick={() => setSelectedId(app.id)}
                    className="cursor-pointer border-t border-border transition hover:bg-subtle/60"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium">{fullName(app)}</p>
                      <p className="text-xs text-muted">@{app.username} · {dash(app.driver_license_number)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p>{dash(app.email)}</p>
                      <p className="text-xs text-muted">{dash(app.phone_number)}</p>
                    </td>
                    <td className="px-4 py-3">{app.years_of_experience} years</td>
                    <td className="px-4 py-3" title={formatDateTime(app.created_at)}>{relativeTime(app.created_at)}</td>
                    <td className="px-4 py-3"><StatusBadge status={app.status} /></td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-muted">
                    No {status === "ALL" ? "" : status.toLowerCase()} applications found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted">
            {data ? `${data.pagination.total_items} total` : "Loading"} · {updatedAt ? `Updated ${relativeTime(updatedAt.toISOString())}` : "Not updated yet"}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={!data?.pagination.has_prev} onClick={() => setPage((v) => Math.max(1, v - 1))}>
              Previous
            </Button>
            <Button variant="secondary" disabled={!data?.pagination.has_next} onClick={() => setPage((v) => v + 1)}>
              Next
            </Button>
          </div>
        </div>
      </section>

      <Modal open={Boolean(selectedId)} onClose={() => setSelectedId(null)} title={selected ? fullName(selected) : "Application"} size="xl">
        {detail.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="h-32 animate-pulse rounded-lg bg-subtle" />
            <div className="h-32 animate-pulse rounded-lg bg-subtle" />
            <div className="h-48 animate-pulse rounded-lg bg-subtle sm:col-span-2" />
          </div>
        ) : detail.error instanceof ApiError && detail.error.status === 403 ? (
          <AccessDenied />
        ) : selected ? (
          <div className="space-y-5">
            <div className="rounded-lg border border-border bg-subtle/40 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={selected.status} />
                    <span className="text-xs text-muted">Applied {formatDateTime(selected.created_at)}</span>
                  </div>
                  <p className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">{fullName(selected)}</p>
                  <p className="mt-1 break-words text-sm text-muted">@{selected.username} · {dash(selected.driver_license_number)}</p>
                </div>
                {selected.status === "APPROVED" && (
                  <div className="rounded-lg bg-surface p-3 text-sm sm:min-w-48">
                    <p className="text-xs text-muted">EV wallet balance</p>
                    <p className="mt-1 text-lg font-semibold">{naira(selected.ev_wallet_balance)}</p>
                  </div>
                )}
              </div>
            </div>

            <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <DetailTile label="Username">{selected.username}</DetailTile>
              <DetailTile label="Email">{dash(selected.email)}</DetailTile>
              <DetailTile label="Phone">{dash(selected.phone_number)}</DetailTile>
              <DetailTile label="Experience">{selected.years_of_experience} years</DetailTile>
              <DetailTile label="License">{dash(selected.driver_license_number)}</DetailTile>
              <DetailTile label="Review time">{selected.status === "PENDING" ? "-" : formatDateTime(selected.updated_at)}</DetailTile>
            </dl>

            {selected.status === "REJECTED" && (
              <div className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm">
                <p className="font-medium text-danger">Rejection reason</p>
                <p className="mt-1">{selected.rejection_reason || "No reason given."}</p>
              </div>
            )}
            {selected.status === "APPROVED" && selected.virtual_account && (
              <div className="space-y-3">
                <DvaCard account={selected.virtual_account} />
              </div>
            )}

            <div className="grid gap-2 sm:flex sm:flex-wrap">
              {selected.status === "PENDING" && (
                <>
                  <Button onClick={() => setApproveTarget(selected)}>Approve</Button>
                  <Button variant="danger" onClick={() => setRejectTarget(selected)}>Reject</Button>
                </>
              )}
              {selected.status === "APPROVED" && selected.user_id && (
                <>
                  <CredentialSendMenu
                    email={selected.email}
                    phone={selected.phone_number}
                    loading={resend.isPending}
                    onSend={(channel) => resend.mutate({ userId: selected.user_id!, channel })}
                  />
                  <a className="inline-flex h-10 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-subtle" href={`/drivers/${selected.user_id}`}>View driver profile</a>
                  <a className="inline-flex h-10 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-subtle" href={`/dva-transactions?userId=${selected.user_id}`}>View transactions</a>
                </>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">Application not found.</p>
        )}
      </Modal>

      <Modal open={Boolean(approveTarget)} onClose={() => !approve.isPending && setApproveTarget(null)} title="Approve application">
        {approveTarget && (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              This creates {fullName(approveTarget)}&apos;s driver account and dedicated bank account, then sends login details by {approveTarget.email ? "email" : "SMS"}. Approval is final and may take several seconds.
            </p>
            <ModalActions>
              <Button variant="secondary" disabled={approve.isPending} onClick={() => setApproveTarget(null)}>Cancel</Button>
              <Button loading={approve.isPending} onClick={() => approve.mutate(approveTarget.id)}>Approve</Button>
            </ModalActions>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(rejectTarget)} onClose={() => !reject.isPending && setRejectTarget(null)} title="Reject application">
        {rejectTarget && (
          <div className="space-y-4">
            <p className="text-sm text-muted">This reason is sent to the applicant. Keep it public-facing.</p>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value.slice(0, 500))}
              rows={5}
              className="w-full resize-none rounded-lg border border-input bg-surface p-3 text-sm outline-none focus:border-brand focus:ring-3 focus:ring-brand/20"
              placeholder="Optional reason"
            />
            <p className="text-right text-xs text-muted">{reason.length}/500</p>
            <ModalActions>
              <Button variant="secondary" disabled={reject.isPending} onClick={() => setRejectTarget(null)}>Cancel</Button>
              <Button variant="danger" loading={reject.isPending} onClick={() => reject.mutate({ id: rejectTarget.id, text: reason })}>Reject</Button>
            </ModalActions>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(approvedApp)} onClose={() => setApprovedApp(null)} title="Driver approved">
        {approvedApp && (
          <div className="space-y-4">
            <p className="text-sm text-muted">The driver account is active. Offer credential resend if delivery failed silently.</p>
            {approvedApp.virtual_account && <DvaCard account={approvedApp.virtual_account} />}
            <div className="flex flex-wrap gap-2">
              {approvedApp.user_id && (
                <>
                  <CredentialSendMenu
                    email={approvedApp.email}
                    phone={approvedApp.phone_number}
                    loading={resend.isPending}
                    onSend={(channel) => resend.mutate({ userId: approvedApp.user_id!, channel })}
                  />
                  <a className="inline-flex h-10 items-center rounded-lg bg-brand px-4 text-sm font-medium text-brand-foreground hover:brightness-110" href={`/drivers/${approvedApp.user_id}`}>View profile</a>
                </>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
