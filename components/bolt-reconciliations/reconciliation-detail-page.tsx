"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { EntryDetail, entryName, LinkDriverDialog } from "@/components/bolt-reconciliations/entry-dialogs";
import {
  MATCH_LABELS,
  money,
  periodLabel,
  reportVerdict,
  STATUS_COUNT_KEY,
  STATUS_META,
  StatusBadge,
  StatusBar,
  VarianceText,
  weekday,
} from "@/components/bolt-reconciliations/parts";
import { useReportDownload } from "@/components/bolt-reconciliations/use-report-download";
import { AccessDenied } from "@/components/dashboard/access-denied";
import { ConfigPageHeader, EmptyState, ErrorState, Icon, SearchInput, SkeletonRows } from "@/components/dashboard/screen-kit";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal } from "@/components/ui/modal";
import { Pagination } from "@/components/ui/pagination";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/browser";
import {
  deleteReconciliation,
  ENTRY_STATUSES,
  getReconciliation,
  linkReconciliationEntry,
  listReconciliationEntries,
  rerunReconciliation,
  type EntryStatus,
  type Reconciliation,
  type ReconciliationEntry,
} from "@/lib/api/bolt-reconciliations";
import { formatDateTime, formatRelative, fullName } from "@/lib/format";
import { useNow } from "@/lib/hooks/use-now";
import { useSearchState, useUrlState } from "@/lib/hooks/use-url-state";
import { CACHE } from "@/lib/query/cache";
import { queryKeys } from "@/lib/query/keys";
import { useCurrentUser } from "@/lib/query/user";

const PAGE_SIZE = 25;
const ATTENTION: EntryStatus[] = ["SHORT", "UNMATCHED"];
const ROW_GRID = "lg:grid-cols-[minmax(0,1.8fr)_8rem_repeat(3,minmax(6.5rem,0.8fr))_minmax(0,1fr)]";

const BACK = { backHref: "/bolt-reconciliations", backLabel: "Bolt reconciliation" } as const;

function parseStatuses(value: string): EntryStatus[] {
  return value.split(",").filter((item): item is EntryStatus => (ENTRY_STATUSES as string[]).includes(item));
}

function Tile({ label, value, sub, tone = "" }: { label: string; value: string; sub?: ReactNode; tone?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
      <p className="text-xs font-medium uppercase text-muted">{label}</p>
      <p className={`mt-1.5 text-2xl font-semibold tabular-nums ${tone}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

const BANNER_TONES = {
  danger: "border-danger/30 bg-danger-soft",
  warning: "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40",
  success: "border-success/30 bg-success-soft",
  neutral: "border-border bg-subtle",
} as const;

const BANNER_TEXT = {
  danger: "text-danger",
  warning: "text-amber-800 dark:text-amber-300",
  success: "text-success",
  neutral: "text-foreground",
} as const;

function Verdict({ report, onShow }: { report: Reconciliation; onShow: (statuses: EntryStatus[]) => void }) {
  const verdict = reportVerdict(report.summary);
  const { summary } = report;
  const extraUnmatched = verdict.tone === "danger" && summary.unmatched_rows > 0;
  return (
    <div className={`flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5 ${BANNER_TONES[verdict.tone]}`}>
      <div className="flex min-w-0 gap-3">
        <Icon name={verdict.tone === "success" ? "shield" : verdict.tone === "neutral" ? "info" : "alertTriangle"} className={`mt-0.5 size-6 shrink-0 ${BANNER_TEXT[verdict.tone]}`} />
        <div className="min-w-0">
          <p className={`text-lg font-semibold ${BANNER_TEXT[verdict.tone]}`}>{verdict.title}</p>
          <p className="text-sm">
            {verdict.detail}
            {extraUnmatched && `. ${summary.unmatched_rows} more ${summary.unmatched_rows === 1 ? "row" : "rows"} (${money(summary.unmatched_collected_cash)}) can't be checked until linked to a driver`}
            .
          </p>
        </div>
      </div>
      {verdict.tone === "danger" || verdict.tone === "warning" ? (
        <Button variant="secondary" onClick={() => onShow(verdict.tone === "danger" && summary.unmatched_rows === 0 ? ["SHORT"] : ATTENTION)} className="shrink-0">
          Review {verdict.tone === "danger" && summary.unmatched_rows === 0 ? "short drivers" : "what needs attention"}
          <Icon name="arrowDown" className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}

function EntryRow({ entry, isAdmin, onOpen, onLink }: { entry: ReconciliationEntry; isAdmin: boolean; onOpen: () => void; onLink: () => void }) {
  const boltName = entry.bolt.driver_name;
  const differentName = entry.driver && boltName && boltName.toLowerCase() !== fullName(entry.driver).toLowerCase();
  const contact = entry.driver ? null : [entry.bolt.email, entry.bolt.phone].filter(Boolean).join(" · ");
  return (
    <li className="relative">
      <button
        type="button"
        onClick={onOpen}
        className={`grid w-full grid-cols-2 items-center gap-x-4 gap-y-2.5 px-4 py-3.5 text-left transition hover:bg-subtle/50 focus-visible:bg-subtle/50 focus-visible:outline-none sm:px-5 ${ROW_GRID}`}
      >
        <div className="col-span-2 flex min-w-0 items-start justify-between gap-3 lg:col-span-1">
          <div className="min-w-0">
            <p className={`truncate text-sm font-medium ${entry.driver ? "" : "italic"}`}>{entryName(entry)}</p>
            <p className="truncate text-xs text-muted">
              {differentName ? `On Bolt: ${boltName}` : contact || (entry.row_number !== null ? `Row ${entry.row_number}` : "From DVA payments")}
            </p>
          </div>
          <span className="lg:hidden"><StatusBadge status={entry.status} /></span>
        </div>
        <div className="hidden lg:block"><StatusBadge status={entry.status} /></div>
        <div className="lg:text-right">
          <p className="text-xs text-muted lg:hidden">Collected on Bolt</p>
          <p className="text-sm tabular-nums">{money(entry.collected_cash)}</p>
        </div>
        <div className="lg:text-right">
          <p className="text-xs text-muted lg:hidden">Paid into DVA</p>
          <p className="text-sm tabular-nums">
            {money(entry.dva_amount)}
            {entry.dva_transaction_count > 1 && <span className="ml-1 text-xs text-muted">×{entry.dva_transaction_count}</span>}
          </p>
        </div>
        <div className="lg:text-right">
          <p className="text-xs text-muted lg:hidden">Difference</p>
          <VarianceText value={entry.variance} className="text-sm" />
        </div>
        <div className="col-span-2 min-w-0 text-xs text-muted lg:col-span-1">
          {entry.status === "UNMATCHED" && isAdmin ? <span className="lg:invisible">{MATCH_LABELS[entry.match_method]}</span> : MATCH_LABELS[entry.match_method]}
        </div>
      </button>
      {entry.status === "UNMATCHED" && isAdmin && (
        <div className="absolute bottom-2.5 right-4 sm:right-5 lg:bottom-auto lg:top-1/2 lg:-translate-y-1/2">
          <Button variant="secondary" onClick={onLink} className="h-8 px-3 text-xs pointer-coarse:h-9">
            <Icon name="link" className="size-3.5" />
            Link driver
          </Button>
        </div>
      )}
    </li>
  );
}

export function BoltReconciliationDetailPage({ id }: { id: string }) {
  const user = useCurrentUser();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const url = useUrlState();
  const search = useSearchState(url, "q");
  const now = useNow(true, 30_000);
  const { download, pendingId } = useReportDownload();

  const isAdmin = user.user_type === "ADMIN";
  const canView = isAdmin || user.user_type === "ACCOUNT_OFFICER";
  const statuses = parseStatuses(url.get("status"));

  const [openEntry, setOpenEntry] = useState<ReconciliationEntry | null>(null);
  const [linking, setLinking] = useState<ReconciliationEntry | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const reportQuery = useQuery({
    queryKey: queryKeys.boltReconciliations.detail(id),
    queryFn: ({ signal }) => getReconciliation(id, signal),
    enabled: canView,
    ...CACHE.list,
  });

  const entryFilters = { page: url.page, page_size: PAGE_SIZE, status: statuses.length ? statuses : undefined, searchTerm: search.committed || undefined };
  const entries = useQuery({
    queryKey: queryKeys.boltReconciliations.entries(id, entryFilters),
    queryFn: ({ signal }) => listReconciliationEntries(id, entryFilters, signal),
    enabled: canView && reportQuery.isSuccess,
    placeholderData: keepPreviousData,
    ...CACHE.list,
  });

  const refreshAll = (report?: Reconciliation) => {
    if (report) queryClient.setQueryData(queryKeys.boltReconciliations.detail(id), report);
    else queryClient.invalidateQueries({ queryKey: queryKeys.boltReconciliations.detail(id) });
    queryClient.invalidateQueries({ queryKey: ["bolt-reconciliations", "entries", id] });
    queryClient.invalidateQueries({ queryKey: ["bolt-reconciliations", "list"] });
  };

  const gone = () => {
    queryClient.removeQueries({ queryKey: queryKeys.boltReconciliations.detail(id) });
    queryClient.invalidateQueries({ queryKey: queryKeys.boltReconciliations.all });
    router.replace("/bolt-reconciliations");
  };

  const rerun = useMutation({
    mutationFn: () => rerunReconciliation(id),
    onSuccess: (next) => {
      const before = reportQuery.data?.summary;
      refreshAll(next);
      const after = next.summary;
      if (!before) return toast.success("Report re-checked against the DVA ledger.");
      const changes: string[] = [];
      if (before.total_shortfall !== after.total_shortfall) changes.push(`shortfall ${money(before.total_shortfall)} → ${money(after.total_shortfall)}`);
      if (before.short_count !== after.short_count) changes.push(`short drivers ${before.short_count} → ${after.short_count}`);
      if (before.unmatched_rows !== after.unmatched_rows) changes.push(`unmatched ${before.unmatched_rows} → ${after.unmatched_rows}`);
      toast.success(changes.length ? `Re-checked: ${changes.join(", ")}.` : "Re-checked. Nothing changed since the last check.");
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 404) return gone();
      toast.error(error instanceof ApiError ? error.message : "The report couldn't be re-run. Please try again.");
    },
  });

  const link = useMutation({
    mutationFn: ({ entry, userId }: { entry: ReconciliationEntry; userId: string | null; name?: string }) => linkReconciliationEntry(id, entry.id, userId),
    onSuccess: (updated, { name }) => {
      refreshAll();
      setLinking(null);
      setLinkError(null);
      setOpenEntry((current) => (current && current.id === updated.id ? updated : current));
      const status = STATUS_META[updated.status].label.toLowerCase();
      if (name) {
        toast.success(
          updated.status === "SHORT"
            ? `Linked to ${name}. They're short by ${money(Math.abs(updated.variance ?? 0))}.`
            : `Linked to ${name}. They're now ${status}.`,
        );
      } else {
        toast.success(`Manual link removed. The row is now ${status}.`);
      }
    },
    onError: (error) => {
      const message = error instanceof ApiError ? error.message : "The driver couldn't be linked. Please try again.";
      if (linking) setLinkError(message);
      else toast.error(message);
    },
  });

  const destroy = useMutation({
    mutationFn: () => deleteReconciliation(id),
    onSuccess: () => {
      toast.success("Report deleted.");
      gone();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 404) return gone();
      setDeleteError(error instanceof ApiError ? error.message : "The report couldn't be deleted.");
    },
  });

  if (!canView) return <AccessDenied />;
  if (reportQuery.error instanceof ApiError && reportQuery.error.status === 403) return <AccessDenied />;

  if (reportQuery.isLoading) {
    return (
      <div>
        <ConfigPageHeader icon="fileCheck" title="Bolt report" {...BACK} />
        <div role="status" aria-label="Loading" className="animate-pulse space-y-4">
          <div className="h-20 rounded-2xl bg-subtle" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[0, 1, 2, 3, 4].map((key) => <div key={key} className="h-24 rounded-2xl bg-subtle" />)}</div>
          <div className="h-80 rounded-2xl bg-subtle" />
        </div>
      </div>
    );
  }

  const report = reportQuery.data;
  if (reportQuery.isError || !report) {
    const missing = reportQuery.error instanceof ApiError && (reportQuery.error.status === 404 || reportQuery.error.status === 422);
    return (
      <div>
        <ConfigPageHeader icon="fileCheck" title="Bolt report" {...BACK} />
        <div className="rounded-2xl border border-border bg-surface shadow-card">
          {missing ? (
            <EmptyState icon="fileCheck" title="This report no longer exists" action={<Button onClick={() => router.replace("/bolt-reconciliations")}>Back to reports</Button>}>
              It may have been deleted or replaced by a newer upload for the same day.
            </EmptyState>
          ) : (
            <ErrorState message={reportQuery.error?.message ?? "Something went wrong."} onRetry={() => reportQuery.refetch()} />
          )}
        </div>
      </div>
    );
  }

  const { summary } = report;
  const items = entries.data?.items ?? [];
  const filtering = statuses.length > 0 || Boolean(search.committed);

  const setStatuses = (next: EntryStatus[]) => url.set({ status: next.join(",") || null });
  const toggle = (status: EntryStatus) => setStatuses(statuses.includes(status) ? statuses.filter((item) => item !== status) : [...statuses, status]);
  const isAttention = statuses.length === ATTENTION.length && ATTENTION.every((status) => statuses.includes(status));

  const showStatuses = (next: EntryStatus[]) => {
    setStatuses(next);
    document.getElementById("entries")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const startLink = (entry: ReconciliationEntry) => {
    setLinkError(null);
    setOpenEntry(null);
    setLinking(entry);
  };

  const uploader = report.uploaded_by ? fullName(report.uploaded_by) : "a deleted user";
  const singleDay = report.period_start === report.period_end;

  return (
    <div className="space-y-5">
      <ConfigPageHeader
        icon="fileCheck"
        title={singleDay ? `${weekday(report.period_start)}, ${periodLabel(report)}` : periodLabel(report)}
        {...BACK}
        description={
          <>
            <span className="block truncate" title={report.file.file_name}>{report.file.file_name}</span>
            <span className="block">
              Uploaded by {uploader} {formatRelative(report.created_at, now)} ·{" "}
              <span title={formatDateTime(report.reconciled_at)}>last checked {formatRelative(report.reconciled_at, now).toLowerCase()}</span>
            </span>
          </>
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => download(report.id)} loading={pendingId === report.id}>
              <Icon name="download" className="size-4" />
              Download
            </Button>
            {isAdmin && (
              <Button variant="secondary" onClick={() => rerun.mutate()} loading={rerun.isPending} title="Check again against the DVA ledger as it is now">
                {!rerun.isPending && <Icon name="refresh" className="size-4" />}
                Re-run
              </Button>
            )}
            {isAdmin && (
              <Button variant="secondary" onClick={() => { setDeleteError(null); setDeleting(true); }} className="text-danger" aria-label="Delete report">
                <Icon name="trash" className="size-4" />
                <span className="sm:sr-only">Delete</span>
              </Button>
            )}
          </>
        }
      />

      {report.notes && (
        <div className="flex gap-2.5 rounded-xl border border-border bg-subtle/50 px-4 py-3 text-sm">
          <Icon name="info" className="mt-0.5 size-4 shrink-0 text-muted" />
          <p className="whitespace-pre-line">{report.notes}</p>
        </div>
      )}

      <Verdict report={report} onShow={showStatuses} />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Tile label="Cash collected" value={money(summary.total_collected_cash)} sub={`From ${summary.report_rows} Bolt ${summary.report_rows === 1 ? "row" : "rows"}`} />
        <Tile label="DVA received" value={money(summary.total_dva_received)} sub={`From ${summary.matched_rows} matched ${summary.matched_rows === 1 ? "driver" : "drivers"}`} />
        <Tile
          label="Shortfall"
          value={money(summary.total_shortfall)}
          tone={summary.total_shortfall > 0 ? "text-danger" : ""}
          sub={summary.short_count ? `${summary.short_count} ${summary.short_count === 1 ? "driver" : "drivers"} short` : "Nobody is short"}
        />
        <Tile
          label="Overpaid"
          value={money(summary.total_overage)}
          sub={summary.over_count ? `${summary.over_count} ${summary.over_count === 1 ? "driver" : "drivers"} paid extra` : "Nobody overpaid"}
        />
        <Tile
          label="Can't check yet"
          value={money(summary.unmatched_collected_cash)}
          tone={summary.unmatched_rows > 0 ? "text-amber-700 dark:text-amber-300" : ""}
          sub={summary.unmatched_rows ? `${summary.unmatched_rows} unmatched ${summary.unmatched_rows === 1 ? "row" : "rows"}` : "Every row matched"}
        />
      </section>

      {summary.not_in_report_count > 0 && (
        <button
          type="button"
          onClick={() => showStatuses(["NOT_IN_REPORT"])}
          className="flex w-full items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-left text-sm transition hover:brightness-[0.98] dark:border-violet-900 dark:bg-violet-950/40"
        >
          <span>
            <span className="font-semibold">{summary.not_in_report_count} {summary.not_in_report_count === 1 ? "driver" : "drivers"}</span> received{" "}
            <span className="font-semibold tabular-nums">{money(summary.not_in_report_dva_amount)}</span> into their DVA but {summary.not_in_report_count === 1 ? "isn't" : "aren't"} in this Bolt report.
          </span>
          <Icon name="chevronRight" className="size-4 shrink-0 text-muted" />
        </button>
      )}

      <section id="entries" className="scroll-mt-20 overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="space-y-3 border-b border-border p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-base font-semibold">Drivers</h2>
              <p className="text-xs text-muted">Problems first, biggest differences at the top. Tap a row for details.</p>
            </div>
            <div className="lg:w-80">
              <SearchInput value={search.text} onChange={search.setText} placeholder="Name, email, phone or Bolt ID" label="Search drivers" />
            </div>
          </div>

          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5" role="group" aria-label="Filter by status">
            <Chip active={statuses.length === 0} onClick={() => setStatuses([])} count={summary.report_rows + summary.not_in_report_count}>All</Chip>
            {(summary.short_count > 0 || summary.unmatched_rows > 0) && (
              <Chip active={isAttention} onClick={() => setStatuses(isAttention ? [] : ATTENTION)} count={summary.short_count + summary.unmatched_rows}>
                Needs attention
              </Chip>
            )}
            <span aria-hidden className="mx-1 w-px shrink-0 self-stretch bg-border" />
            {ENTRY_STATUSES.map((status) => {
              const count = summary[STATUS_COUNT_KEY[status]] as number;
              if (count === 0 && !statuses.includes(status)) return null;
              return (
                <Chip key={status} active={statuses.includes(status)} onClick={() => toggle(status)} count={count} dot={STATUS_META[status].dot} title={STATUS_META[status].hint}>
                  {STATUS_META[status].label}
                </Chip>
              );
            })}
          </div>
          <StatusBar summary={summary} />
        </div>

        {entries.isLoading ? (
          <SkeletonRows rows={8} columns={6} />
        ) : entries.isError ? (
          <ErrorState message={entries.error.message} onRetry={() => entries.refetch()} />
        ) : items.length === 0 ? (
          filtering ? (
            <EmptyState
              icon="search"
              title="No drivers match"
              action={<Button variant="secondary" onClick={() => { search.setText(""); url.set({ status: null, q: null }); }}>Clear filters</Button>}
            >
              Try another name, or show every status.
            </EmptyState>
          ) : (
            <EmptyState icon="users" title="No drivers in this report">The uploaded file had no driver rows.</EmptyState>
          )
        ) : (
          <>
            <div className={`hidden gap-4 bg-subtle/70 px-5 py-3 text-xs font-semibold uppercase text-muted lg:grid ${ROW_GRID}`}>
              <span>Driver</span>
              <span>Status</span>
              <span className="text-right">Collected</span>
              <span className="text-right">Paid into DVA</span>
              <span className="text-right">Difference</span>
              <span>Match</span>
            </div>
            <ul className={`divide-y divide-border transition-opacity ${entries.isPlaceholderData ? "opacity-60" : ""}`}>
              {items.map((entry) => (
                <EntryRow key={entry.id} entry={entry} isAdmin={isAdmin} onOpen={() => setOpenEntry(entry)} onLink={() => startLink(entry)} />
              ))}
            </ul>
            <Pagination pagination={entries.data?.pagination} onPage={(page) => url.set({ page })} noun="drivers" />
          </>
        )}
      </section>

      <p className="flex gap-2 px-1 text-xs text-muted">
        <Icon name="clock" className="mt-px size-3.5 shrink-0" />
        <span>
          DVA payments count by Lagos day (00:00 to 23:59). A deposit made after midnight for the previous day&apos;s cash counts towards the next day&apos;s report, and re-running won&apos;t move it.
          {isAdmin && " Re-run after late deposits land or after fixing a driver's email or phone."}
        </span>
      </p>

      <Modal open={openEntry !== null} onClose={() => setOpenEntry(null)} title={openEntry ? entryName(openEntry) : "Driver"} size="lg">
        {openEntry && (
          <EntryDetail
            entry={openEntry}
            report={report}
            isAdmin={isAdmin}
            onLink={() => startLink(openEntry)}
            onUnlink={() => link.mutate({ entry: openEntry, userId: null })}
            unlinking={link.isPending && link.variables?.userId === null}
          />
        )}
      </Modal>

      <Modal open={linking !== null} onClose={() => !link.isPending && setLinking(null)} title="Link to a driver" size="lg">
        {linking && (
          <LinkDriverDialog
            entry={linking}
            onCancel={() => setLinking(null)}
            onPick={(driver) => { setLinkError(null); link.mutate({ entry: linking, userId: driver.id, name: driver.name }); }}
            pending={link.isPending ? (link.variables?.userId ?? null) : null}
            error={linkError}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={() => destroy.mutate()}
        title="Delete this report?"
        confirmLabel="Delete report"
        loading={destroy.isPending}
        error={deleteError}
      >
        <p>
          This removes the report for <strong className="font-semibold text-foreground">{periodLabel(report)}</strong>, all {summary.report_rows + summary.not_in_report_count} driver results, any manual links and the stored file. It can&apos;t be undone.
        </p>
        <p>To correct a report, uploading a new file for the same day and replacing it is usually better.</p>
      </ConfirmDialog>
    </div>
  );
}

function Chip({ active, onClick, count, dot, title, children }: { active: boolean; onClick: () => void; count: number; dot?: string; title?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      title={title}
      onClick={onClick}
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition pointer-coarse:h-10 ${
        active ? "border-brand bg-brand-soft text-brand" : "border-border bg-surface text-foreground hover:bg-subtle"
      }`}
    >
      {dot && <span aria-hidden className={`size-2 rounded-full ${dot}`} />}
      {children}
      <span className={`tabular-nums ${active ? "text-brand" : "text-muted"}`}>{count}</span>
    </button>
  );
}
