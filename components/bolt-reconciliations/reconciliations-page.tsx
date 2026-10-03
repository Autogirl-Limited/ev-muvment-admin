"use client";

import { useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";

import { money, periodLabel, reportVerdict, StatusBar, VERDICT_TONES, weekday } from "@/components/bolt-reconciliations/parts";
import { UploadReportDialog } from "@/components/bolt-reconciliations/upload-dialog";
import { useReportDownload } from "@/components/bolt-reconciliations/use-report-download";
import { AccessDenied } from "@/components/dashboard/access-denied";
import { ConfigPageHeader, EmptyState, ErrorState, Icon, IconButton, SkeletonRows } from "@/components/dashboard/screen-kit";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Pagination } from "@/components/ui/pagination";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/browser";
import { listReconciliations, type Reconciliation } from "@/lib/api/bolt-reconciliations";
import { formatDateTime, formatRelative, fullName } from "@/lib/format";
import { useUrlState } from "@/lib/hooks/use-url-state";
import { CACHE } from "@/lib/query/cache";
import { queryKeys } from "@/lib/query/keys";
import { useCurrentUser } from "@/lib/query/user";

const PAGE_SIZE = 20;
const GRID = "lg:grid-cols-[minmax(9rem,1fr)_minmax(13rem,1.5fr)_repeat(3,minmax(6.5rem,0.8fr))_minmax(9rem,1fr)_2.5rem]";

function Verdict({ report }: { report: Reconciliation }) {
  const verdict = reportVerdict(report.summary);
  return (
    <div className="min-w-0">
      <p className={`text-sm font-semibold ${VERDICT_TONES[verdict.tone]}`}>{verdict.title}</p>
      <p className="truncate text-xs text-muted">{verdict.detail}</p>
      <StatusBar summary={report.summary} className="mt-2 max-w-56" />
    </div>
  );
}

function Uploader({ report }: { report: Reconciliation }) {
  return (
    <div className="min-w-0 text-sm">
      <p className="truncate">{report.uploaded_by ? fullName(report.uploaded_by) : <span className="text-muted">Deleted user</span>}</p>
      <p className="text-xs text-muted" title={formatDateTime(report.created_at)}>{formatRelative(report.created_at)}</p>
    </div>
  );
}

export function BoltReconciliationsPage() {
  const user = useCurrentUser();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const url = useUrlState();
  const { download, pendingId } = useReportDownload();
  const [uploading, setUploading] = useState<{ file: File | null } | null>(null);
  const [dropping, setDropping] = useState(false);

  const isAdmin = user.user_type === "ADMIN";
  const canView = isAdmin || user.user_type === "ACCOUNT_OFFICER";
  const dateFrom = url.get("dateFrom");
  const dateTo = url.get("dateTo");
  const filters = { page: url.page, page_size: PAGE_SIZE, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined };

  const reports = useQuery({
    queryKey: queryKeys.boltReconciliations.list(filters),
    queryFn: ({ signal }) => listReconciliations(filters, signal),
    enabled: canView,
    placeholderData: keepPreviousData,
    ...CACHE.list,
  });

  if (!canView) return <AccessDenied />;
  if (reports.error instanceof ApiError && reports.error.status === 403) return <AccessDenied />;

  const items = reports.data?.items ?? [];
  const filtered = Boolean(dateFrom || dateTo);

  const finished = (report: Reconciliation) => {
    setUploading(null);
    queryClient.invalidateQueries({ queryKey: queryKeys.boltReconciliations.all });
    queryClient.setQueryData(queryKeys.boltReconciliations.detail(report.id), report);
    toast.success(`Report for ${periodLabel(report)} reconciled.`);
    router.push(`/bolt-reconciliations/${report.id}`);
  };

  // Admins can drop the export anywhere on the page to start an upload.
  const dropProps = isAdmin
    ? {
        onDragOver: (event: DragEvent) => {
          if (!event.dataTransfer.types.includes("Files") || uploading) return;
          event.preventDefault();
          setDropping(true);
        },
        onDragLeave: (event: DragEvent) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropping(false);
        },
        onDrop: (event: DragEvent) => {
          event.preventDefault();
          setDropping(false);
          const file = event.dataTransfer.files?.[0];
          if (file) setUploading({ file });
        },
      }
    : {};

  const uploadButton = isAdmin && (
    <Button onClick={() => setUploading({ file: null })}>
      <Icon name="upload" className="size-4" />
      Upload report
    </Button>
  );

  return (
    <div {...dropProps} className="relative">
      {dropping && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-brand/10 p-6 backdrop-blur-[1px]">
          <div className="rounded-2xl border-2 border-dashed border-brand bg-surface px-8 py-6 text-center shadow-card">
            <Icon name="upload" className="mx-auto size-7 text-brand" />
            <p className="mt-2 font-semibold">Drop to upload this Bolt report</p>
          </div>
        </div>
      )}

      <ConfigPageHeader
        icon="fileCheck"
        title="Bolt reconciliation"
        showBackLink={false}
        description="Check the cash each driver collected on Bolt against what actually landed in their DVA, one report per day."
        actions={uploadButton}
      />

      <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="sm:w-80">
            <DateRangePicker compact from={dateFrom} to={dateTo} onApply={({ from, to }) => url.set({ dateFrom: from, dateTo: to })} />
          </div>
          <div className="flex items-center gap-3">
            {reports.isFetching && !reports.isLoading && <span className="text-xs text-muted">Updating...</span>}
            <Button variant="secondary" onClick={() => reports.refetch()} loading={reports.isRefetching} className="flex-1 sm:flex-none">
              <Icon name="refresh" className="size-4" />
              Refresh
            </Button>
          </div>
        </div>

        {reports.isLoading ? (
          <SkeletonRows rows={6} columns={6} />
        ) : reports.isError ? (
          <ErrorState message={reports.error.message} onRetry={() => reports.refetch()} />
        ) : items.length === 0 ? (
          filtered ? (
            <EmptyState icon="search" title="No reports in this range" action={<Button variant="secondary" onClick={() => url.set({ dateFrom: null, dateTo: null })}>Show all reports</Button>}>
              A report shows up when its day falls inside the dates you picked.
            </EmptyState>
          ) : (
            <EmptyState icon="fileCheck" title="No Bolt reports yet" action={uploadButton || undefined}>
              {isAdmin
                ? "Download the day's “Earnings per driver” export from Bolt Fleet and upload it here. We'll check every driver's cash against their DVA."
                : "Once an admin uploads a Bolt export, each day's results show up here."}
            </EmptyState>
          )
        ) : (
          <>
            <div className={`hidden gap-4 bg-subtle/70 px-5 py-3 text-xs font-semibold uppercase text-muted lg:grid ${GRID}`}>
              <span>Day</span>
              <span>Result</span>
              <span className="text-right">Cash collected</span>
              <span className="text-right">DVA received</span>
              <span className="text-right">Shortfall</span>
              <span>Uploaded</span>
              <span />
            </div>
            <ul className={`divide-y divide-border transition-opacity ${reports.isPlaceholderData ? "opacity-60" : ""}`}>
              {items.map((report) => (
                <li key={report.id} className="relative">
                  <button
                    type="button"
                    onClick={() => router.push(`/bolt-reconciliations/${report.id}`)}
                    className={`grid w-full items-center gap-x-4 gap-y-3 px-4 py-4 text-left transition hover:bg-subtle/50 focus-visible:bg-subtle/50 focus-visible:outline-none sm:px-5 ${GRID} grid-cols-2`}
                  >
                    <div className="col-span-2 flex items-start justify-between gap-3 pr-10 lg:col-span-1 lg:block lg:pr-0">
                      <div className="min-w-0">
                        <p className="font-semibold">{periodLabel(report)}</p>
                        <p className="text-xs text-muted">
                          {report.period_start === report.period_end ? weekday(report.period_start) : "Multi-day"} · {report.summary.report_rows} rows
                        </p>
                      </div>
                    </div>
                    <div className="col-span-2 lg:col-span-1"><Verdict report={report} /></div>
                    <div className="lg:text-right">
                      <p className="text-xs text-muted lg:hidden">Cash collected</p>
                      <p className="font-medium tabular-nums">{money(report.summary.total_collected_cash)}</p>
                    </div>
                    <div className="lg:text-right">
                      <p className="text-xs text-muted lg:hidden">DVA received</p>
                      <p className="font-medium tabular-nums">{money(report.summary.total_dva_received)}</p>
                    </div>
                    <div className="lg:text-right">
                      <p className="text-xs text-muted lg:hidden">Shortfall</p>
                      <p className={`font-semibold tabular-nums ${report.summary.total_shortfall > 0 ? "text-danger" : "text-muted"}`}>
                        {report.summary.total_shortfall > 0 ? money(report.summary.total_shortfall) : "-"}
                      </p>
                    </div>
                    <Uploader report={report} />
                    <span className="hidden lg:block" />
                  </button>
                  <div className="absolute right-2 top-3 lg:top-1/2 lg:-translate-y-1/2 sm:right-3">
                    {pendingId === report.id ? (
                      <span className="flex size-9 items-center justify-center" role="status" aria-label="Preparing download">
                        <span className="size-4 animate-spin rounded-full border-2 border-muted border-t-transparent" />
                      </span>
                    ) : (
                      <IconButton label={`Download ${report.file.file_name}`} icon="download" onClick={() => download(report.id)} />
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <Pagination pagination={reports.data?.pagination} onPage={(page) => url.set({ page })} noun="reports" />
          </>
        )}
      </section>

      {uploading && <UploadReportDialog initialFile={uploading.file} onClose={() => setUploading(null)} onDone={finished} />}
    </div>
  );
}
