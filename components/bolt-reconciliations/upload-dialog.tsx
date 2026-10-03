"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { periodLabel, reportVerdict, VERDICT_TONES, weekday } from "@/components/bolt-reconciliations/parts";
import { Icon } from "@/components/dashboard/screen-kit";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { lagosToday } from "@/components/ui/date-range-picker";
import { Modal, ModalActions } from "@/components/ui/modal";
import { ApiError } from "@/lib/api/browser";
import {
  createReconciliation,
  daysBetween,
  formatBytes,
  listReconciliations,
  MAX_PERIOD_DAYS,
  periodFromFileName,
  reportFileProblem,
  requestReportUpload,
  uploadReportFile,
  type Reconciliation,
} from "@/lib/api/bolt-reconciliations";
import { failure } from "@/lib/api/envelope";
import { fullName } from "@/lib/format";
import { queryKeys } from "@/lib/query/keys";

type Step = "prepare" | "upload" | "reconcile";
type Phase = { kind: "form" } | { kind: "working"; step: Step } | { kind: "conflict"; message: string };

const STEPS: Array<[Step, string]> = [
  ["prepare", "Preparing upload"],
  ["upload", "Uploading file"],
  ["reconcile", "Checking every driver against their DVA"],
];

const inputClass =
  "h-10 w-full min-w-0 rounded-lg border border-input bg-surface px-3 text-sm outline-none transition pointer-coarse:h-11 pointer-coarse:text-base focus:border-brand focus:ring-3 focus:ring-brand/20 disabled:opacity-60";

/** The report already on file for this exact period, so the admin can compare before replacing it. */
function ExistingReport({ start, end }: { start: string; end: string }) {
  const filters = { page: 1, page_size: 10, dateFrom: start, dateTo: end };
  const existing = useQuery({
    queryKey: queryKeys.boltReconciliations.list(filters),
    queryFn: ({ signal }) => listReconciliations(filters, signal),
    select: (data) => data.items.find((item) => item.period_start === start && item.period_end === end) ?? null,
  });
  if (existing.isLoading) return <div className="h-[4.5rem] animate-pulse rounded-xl bg-subtle" />;
  const report = existing.data;
  if (!report) return null;
  const verdict = reportVerdict(report.summary);
  return (
    <Link
      href={`/bolt-reconciliations/${report.id}`}
      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3.5 transition hover:border-brand/50 hover:bg-subtle/60"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-foreground">{report.file.file_name}</span>
        <span className="block text-xs text-muted">
          {report.uploaded_by ? fullName(report.uploaded_by) : "Someone"} uploaded it ·{" "}
          <span className={VERDICT_TONES[verdict.tone]}>{verdict.title}</span>
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-brand">
        Open existing
        <Icon name="arrowRight" className="size-3.5" />
      </span>
    </Link>
  );
}

function Progress({ step, fraction }: { step: Step; fraction: number }) {
  const current = STEPS.findIndex(([id]) => id === step);
  return (
    <ol className="space-y-3" aria-live="polite">
      {STEPS.map(([id, label], index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={id} className="flex items-start gap-3">
            <span
              aria-hidden
              className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold ${
                done ? "border-brand bg-brand text-brand-foreground" : active ? "border-brand text-brand" : "border-border text-muted"
              }`}
            >
              {done ? <Icon name="check" className="size-3.5" /> : active ? <span className="size-2.5 animate-pulse rounded-full bg-brand" /> : index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-sm ${active ? "font-semibold" : done ? "text-foreground" : "text-muted"}`}>
                {label}
                {active && id === "upload" && <span className="ml-1.5 font-normal tabular-nums text-muted">{Math.round(fraction * 100)}%</span>}
              </p>
              {active && id === "upload" && (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-subtle">
                  <div className="h-full rounded-full bg-brand transition-[width] duration-200" style={{ width: `${Math.max(3, fraction * 100)}%` }} />
                </div>
              )}
              {active && id === "reconcile" && <p className="mt-0.5 text-xs text-muted">Matching rows to drivers and totting up their DVA payments. This takes a few seconds.</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function initialPeriod(file: File | null, today: string) {
  const period = file ? periodFromFileName(file.name) : null;
  return period
    ? { start: period.start, end: period.end, multiDay: period.start !== period.end, detected: true }
    : { start: today, end: "", multiDay: false, detected: false };
}

/** Mount it only while open (`{open && <UploadReportDialog />}`), so every upload starts clean. */
export function UploadReportDialog({ initialFile = null, onClose, onDone }: { initialFile?: File | null; onClose: () => void; onDone: (report: Reconciliation) => void }) {
  const inputId = useId();
  const notesId = useId();
  const startId = useId();
  const endId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // A file already in S3 that the API kept (after a 409), so "Replace" doesn't upload it again.
  const uploaded = useRef<{ object_key: string; file_name: string } | null>(null);
  const today = lagosToday();
  const [first] = useState(() => initialPeriod(initialFile, today));
  const [file, setFile] = useState<File | null>(initialFile);
  const [problem, setProblem] = useState<string | null>(() => (initialFile ? reportFileProblem(initialFile) : null));
  const [dragging, setDragging] = useState(false);
  const [start, setStart] = useState(first.start);
  const [end, setEnd] = useState(first.end);
  const [multiDay, setMultiDay] = useState(first.multiDay);
  const [detected, setDetected] = useState(first.detected);
  const [notes, setNotes] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const busy = phase.kind === "working";

  // Stop an in-flight S3 upload if the dialog goes away.
  useEffect(() => () => abortRef.current?.abort(), []);

  const choose = (picked: File | undefined) => {
    if (!picked) return;
    uploaded.current = null;
    setFile(picked);
    setError(null);
    setPhase({ kind: "form" });
    setProblem(reportFileProblem(picked));
    const period = periodFromFileName(picked.name);
    if (period) {
      setStart(period.start);
      setEnd(period.end);
      setMultiDay(period.start !== period.end);
      setDetected(true);
    } else {
      setDetected(false);
    }
  };

  const clearFile = () => {
    uploaded.current = null;
    setFile(null);
    setProblem(null);
    setError(null);
    setDetected(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const periodEnd = multiDay ? end : start;
  const periodProblem = !start
    ? "Pick the day this report covers."
    : start > today
      ? "The report can't be for a future day."
      : multiDay && !end
        ? "Pick the last day the report covers."
        : multiDay && end < start
          ? "The last day can't be before the first."
          : multiDay && daysBetween(start, end) >= MAX_PERIOD_DAYS
            ? `A report can cover at most ${MAX_PERIOD_DAYS} days.`
            : null;
  const canSubmit = Boolean(file) && !problem && !periodProblem && !busy;

  const run = async (replaceExisting: boolean) => {
    if (!file) return;
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      if (!uploaded.current) {
        setPhase({ kind: "working", step: "prepare" });
        const ticket = await requestReportUpload(file.name);
        if (file.size > ticket.max_size_bytes) {
          throw new ApiError(failure(400, `This file is ${formatBytes(file.size)}. The limit is ${formatBytes(ticket.max_size_bytes)}.`));
        }
        setProgress(0);
        setPhase({ kind: "working", step: "upload" });
        await uploadReportFile(ticket, file, setProgress, controller.signal);
        uploaded.current = { object_key: ticket.object_key, file_name: ticket.file_name };
      }
      setPhase({ kind: "working", step: "reconcile" });
      const report = await createReconciliation({
        ...uploaded.current,
        period_start: start,
        period_end: periodEnd,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(replaceExisting ? { replace_existing: true } : {}),
      });
      uploaded.current = null;
      onDone(report);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        setPhase({ kind: "form" });
        return;
      }
      const apiError = caught instanceof ApiError ? caught : null;
      if (apiError?.status === 409 && uploaded.current) {
        setPhase({ kind: "conflict", message: apiError.message });
        return;
      }
      // Any other failure discards the uploaded file, so the next attempt starts over.
      uploaded.current = null;
      setPhase({ kind: "form" });
      setError(apiError?.message ?? "The report couldn't be uploaded. Please try again.");
    } finally {
      abortRef.current = null;
    }
  };

  // Once the server is reconciling there is nothing to cancel; keep the dialog up until it answers.
  const locked = phase.kind === "working" && phase.step === "reconcile";
  const close = () => {
    if (locked) return;
    abortRef.current?.abort();
    onClose();
  };

  const range = { period_start: start, period_end: periodEnd || start };

  return (
    <Modal open onClose={close} title="Upload Bolt report" size="lg">
      {phase.kind === "working" ? (
        <div className="space-y-5">
          <div className="flex items-center gap-3 rounded-xl bg-subtle/60 p-3.5">
            <FileGlyph name={file?.name ?? ""} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{file?.name}</p>
              <p className="text-xs text-muted">{periodLabel(range)} · {file ? formatBytes(file.size) : ""}</p>
            </div>
          </div>
          <Progress step={phase.step} fraction={progress} />
          <ModalActions>
            <span className="hidden sm:block sm:flex-1" />
            <Button variant="secondary" onClick={close} disabled={locked} className="col-span-2">
              {locked ? "Please wait..." : "Cancel upload"}
            </Button>
          </ModalActions>
        </div>
      ) : phase.kind === "conflict" ? (
        <div className="space-y-4">
          <div className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
            <Icon name="alertTriangle" className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-300" />
            <div className="space-y-1 text-sm">
              <p className="font-semibold">There&apos;s already a report for {periodLabel(range)}</p>
              <p className="text-muted">
                Replacing it deletes the old report, any drivers linked to it by hand, and its stored file. The new file is checked against the DVA ledger as it is now.
              </p>
            </div>
          </div>
          <ExistingReport start={start} end={periodEnd || start} />
          <ModalActions>
            <Button variant="secondary" onClick={() => setPhase({ kind: "form" })}>Back</Button>
            <Button variant="danger" onClick={() => run(true)}>Replace report</Button>
          </ModalActions>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Drop zone */}
          {!file ? (
            <label
              htmlFor={inputId}
              onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => { event.preventDefault(); setDragging(false); choose(event.dataTransfer.files?.[0]); }}
              className={`flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition focus-within:border-brand focus-within:ring-3 focus-within:ring-brand/20 ${
                dragging ? "border-brand bg-brand-soft" : "border-border hover:border-brand/50 hover:bg-subtle/50"
              }`}
            >
              <span aria-hidden className="flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand">
                <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
                </svg>
              </span>
              <span className="mt-3 text-sm font-semibold">{dragging ? "Drop the report here" : "Drop Bolt's export here, or click to choose"}</span>
              <span className="mt-1 text-xs text-muted">&ldquo;Earnings per driver&rdquo; as .csv or .xlsx, up to 10 MB. Upload it as-is; don&apos;t edit or rename it.</span>
            </label>
          ) : (
            <div className={`flex items-center gap-3 rounded-xl border p-3.5 ${problem ? "border-danger/40 bg-danger-soft" : "border-border bg-subtle/50"}`}>
              <FileGlyph name={file.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={file.name}>{file.name}</p>
                <p className={`text-xs ${problem ? "text-danger" : "text-muted"}`}>{problem ?? formatBytes(file.size)}</p>
              </div>
              <Button variant="ghost" onClick={() => inputRef.current?.click()} className="shrink-0">Change</Button>
              <button type="button" onClick={clearFile} aria-label="Remove file" className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-surface hover:text-foreground">
                <Icon name="x" className="size-4" />
              </button>
            </div>
          )}
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={(event) => { choose(event.target.files?.[0]); event.target.value = ""; }}
          />

          {file && !problem && (
            <>
              {/* Period */}
              <fieldset className="space-y-2.5">
                <legend className="text-sm font-medium">Day this report covers</legend>
                <div className={`grid gap-3 ${multiDay ? "sm:grid-cols-2" : ""}`}>
                  <div className="space-y-1">
                    {multiDay && <label htmlFor={startId} className="text-xs text-muted">From</label>}
                    <input id={startId} type="date" value={start} max={today} onChange={(event) => { setStart(event.target.value); setDetected(false); }} className={inputClass} aria-label={multiDay ? undefined : "Report day"} />
                  </div>
                  {multiDay && (
                    <div className="space-y-1">
                      <label htmlFor={endId} className="text-xs text-muted">To</label>
                      <input id={endId} type="date" value={end} min={start} max={today} onChange={(event) => { setEnd(event.target.value); setDetected(false); }} className={inputClass} />
                    </div>
                  )}
                </div>
                {periodProblem ? (
                  <p className="text-xs text-danger">{periodProblem}</p>
                ) : detected ? (
                  <p className="flex items-center gap-1.5 text-xs text-success">
                    <Icon name="check" className="size-3.5" />
                    Read from the file name: {multiDay ? periodLabel(range) : `${weekday(start)}, ${periodLabel(range)}`}
                  </p>
                ) : (
                  <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                    <Icon name="info" className="size-3.5" />
                    We couldn&apos;t read a date from the file name. Check this is the day the report covers.
                  </p>
                )}
                <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-muted">
                  <input
                    type="checkbox"
                    checked={multiDay}
                    onChange={(event) => { setMultiDay(event.target.checked); if (event.target.checked && !end) setEnd(start); }}
                    className="size-4 accent-[var(--brand)]"
                  />
                  Covers more than one day
                </label>
              </fieldset>

              {/* Notes */}
              <div className="space-y-1.5">
                <label htmlFor={notesId} className="flex items-baseline justify-between text-sm font-medium">
                  Notes <span className="text-xs font-normal text-muted">Optional · {notes.length}/1000</span>
                </label>
                <textarea
                  id={notesId}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value.slice(0, 1000))}
                  rows={2}
                  placeholder="Anything the accounts team should know about this upload"
                  className="w-full resize-y rounded-lg border border-input bg-surface px-3 py-2 text-sm outline-none transition placeholder:text-muted/60 pointer-coarse:text-base focus:border-brand focus:ring-3 focus:ring-brand/20"
                />
              </div>
            </>
          )}

          {error && (
            <Alert tone="error">
              <p className="font-medium">{error}</p>
              <p className="mt-0.5 text-xs opacity-90">Nothing was saved. Fix the file or choose another, then upload again.</p>
            </Alert>
          )}

          <ModalActions>
            <Button variant="secondary" onClick={close}>Cancel</Button>
            <Button onClick={() => run(false)} disabled={!canSubmit}>
              {error ? "Try again" : "Upload and reconcile"}
            </Button>
          </ModalActions>
        </div>
      )}
    </Modal>
  );
}

function FileGlyph({ name }: { name: string }) {
  const extension = name.split(".").pop()?.toUpperCase().slice(0, 4) ?? "";
  return (
    <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-[0.65rem] font-bold tracking-wide text-brand">
      {extension || "FILE"}
    </span>
  );
}
