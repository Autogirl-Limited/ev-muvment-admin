"use client";

import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AccessDenied } from "@/components/dashboard/access-denied";
import { ConfigPageHeader, EmptyState, ErrorState, Icon, SearchInput, type IconName } from "@/components/dashboard/screen-kit";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { DriverLink } from "@/components/people/people-parts";
import { Button } from "@/components/ui/button";
import { DateRangePicker, dateLabel, lagosToday } from "@/components/ui/date-range-picker";
import { Modal, ModalActions } from "@/components/ui/modal";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { ApiError } from "@/lib/api/browser";
import {
  getDailyChecklist,
  listDailyChecklists,
  reanalyzeDailyChecklist,
  reviewDailyChecklist,
  type AnalysisStatus,
  type ChecklistImage,
  type ChecklistPhase,
  type ChecklistResponse,
  type ChecklistStatus,
  type DashboardReading,
  type FlagSeverity,
  type ListDailyChecklistsParams,
} from "@/lib/api/daily-checklists";
import { formatDateTime, fullName } from "@/lib/format";
import { useSearchState, useUrlState } from "@/lib/hooks/use-url-state";
import { CACHE } from "@/lib/query/cache";
import { queryKeys } from "@/lib/query/keys";
import { useCurrentUser } from "@/lib/query/user";
import { useManagedUser } from "@/lib/query/users";

const PAGE_SIZE = 20;
const ROW_GRID = "md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_8rem_8rem_9rem_8rem]";

const PHASE_LABEL: Record<ChecklistPhase, string> = { PICK_UP: "Pick-up", DROP_OFF: "Drop-off" };
const STATUS_LABEL: Record<ChecklistStatus, string> = { IN_PROGRESS: "In progress", SUBMITTED: "Submitted" };
const ANALYSIS_LABEL: Record<AnalysisStatus, string> = {
  PENDING: "Pending",
  PROCESSING: "Processing",
  COMPLETED: "Completed",
  FAILED: "Failed",
};

function phaseTone(phase: ChecklistPhase) {
  return phase === "PICK_UP" ? "brand" : "neutral";
}

function statusTone(checklist: ChecklistResponse) {
  if (checklist.needs_review) return "danger";
  if (checklist.analysis?.status === "COMPLETED") return "success";
  if (checklist.analysis?.status === "FAILED") return "danger";
  return "neutral";
}

function severityTone(severity: FlagSeverity) {
  if (severity === "CRITICAL") return "danger";
  if (severity === "WARNING") return "brand";
  return "neutral";
}

function shortTime(iso: string | null) {
  return iso ? formatDateTime(iso) : "-";
}

// ---------- Vehicle condition hero (powertrain, battery/fuel, odometer, warnings) ----------

const POWERTRAIN_LABEL: Record<string, string> = {
  ELECTRIC: "Electric vehicle",
  COMBUSTION: "Combustion (petrol/diesel)",
  HYBRID: "Hybrid vehicle",
};

/** The best-known reading for a phase: effective (driver edits applied) falls back to the raw AI read. */
function bestReading(dashboard: ChecklistResponse["dashboard"]): DashboardReading | null {
  return dashboard?.effective ?? dashboard?.ai ?? null;
}

function powertrainInfo(dashboard: ChecklistResponse["dashboard"]) {
  const reading = bestReading(dashboard);
  const electricUnknown = reading?.is_electric === null || reading?.is_electric === undefined;
  if (!reading || (electricUnknown && !reading.powertrain)) {
    return { known: false as const, label: "Powertrain not detected", icon: "gauge" as IconName, tone: "neutral" as const };
  }
  const label = reading.powertrain ? (POWERTRAIN_LABEL[reading.powertrain] ?? reading.powertrain) : reading.is_electric ? "Electric vehicle" : "Combustion vehicle";
  const electric = reading.is_electric ?? reading.powertrain === "ELECTRIC";
  return {
    known: true as const,
    electric,
    label,
    icon: (electric ? "bolt" : "droplet") as IconName,
    tone: (electric ? "success" : "brand") as "success" | "brand",
  };
}

function fmtKm(value: number | null | undefined) {
  return value === null || value === undefined ? null : `${Math.round(value).toLocaleString("en-NG")} km`;
}

function fmtPercent(value: number | null | undefined) {
  return value === null || value === undefined ? null : `${Math.round(value)}%`;
}

function percentTone(value: number) {
  if (value <= 15) return "text-danger";
  if (value <= 40) return "text-foreground";
  return "text-success";
}

function percentBarTone(value: number) {
  if (value <= 15) return "bg-danger";
  if (value <= 40) return "bg-brand";
  return "bg-success";
}

function PercentGauge({ label, value, icon }: { label: string; value: number | null | undefined; icon: IconName }) {
  const known = value !== null && value !== undefined;
  const clamped = known ? Math.min(100, Math.max(0, value)) : 0;
  return (
    <div className="min-w-0 rounded-xl border border-border/70 bg-surface p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium uppercase text-muted">
          <Icon name={icon} className="size-3.5" />
          {label}
        </span>
        <span className={`text-lg font-semibold tabular-nums ${known ? percentTone(clamped) : "text-muted"}`}>
          {known ? fmtPercent(value) : "Unknown"}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-subtle">
        {known && <div className={`h-full rounded-full transition-all ${percentBarTone(clamped)}`} style={{ width: `${clamped}%` }} />}
      </div>
    </div>
  );
}

function MetricTile({ label, value, icon, sub }: { label: string; value: string; icon: IconName; sub?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border/70 bg-surface p-3.5">
      <span className="flex items-center gap-1.5 text-xs font-medium uppercase text-muted">
        <Icon name={icon} className="size-3.5" />
        {label}
      </span>
      <p className="mt-1.5 truncate text-lg font-semibold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-muted">{sub}</p>}
    </div>
  );
}

function VehicleConditionHero({ checklist }: { checklist: ChecklistResponse }) {
  const dashboard = checklist.dashboard;
  const reading = bestReading(dashboard);
  const powertrain = powertrainInfo(dashboard);
  const edited = dashboard?.driver_edits && Object.values(dashboard.driver_edits).some((value) => value !== null && value !== undefined);

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-subtle/70 to-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${powertrain.tone === "success" ? "bg-success-soft text-success" : powertrain.tone === "brand" ? "bg-brand-soft text-brand" : "bg-subtle text-muted"}`}>
            <Icon name="car" className="size-6" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{checklist.vehicle.name}</p>
            <p className="font-mono text-xs text-muted">{checklist.vehicle.plate_number}</p>
          </div>
        </div>
        <Badge tone={powertrain.tone}>
          <Icon name={powertrain.icon} className="size-3.5" />
          {powertrain.label}
        </Badge>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricTile label="Odometer" icon="gauge" value={fmtKm(reading?.odometer_km) ?? "Unknown"} />
        {powertrain.known && powertrain.electric ? (
          <>
            <PercentGauge label="Battery" icon="battery" value={reading?.battery_percent} />
            <MetricTile label="Range" icon="bolt" value={fmtKm(reading?.range_km) ?? "Unknown"} />
            <MetricTile
              label="Charging"
              icon="bolt"
              value={reading?.is_charging === true ? "Charging now" : reading?.is_charging === false ? "Not charging" : "Unknown"}
            />
          </>
        ) : powertrain.known ? (
          <>
            <PercentGauge label="Fuel" icon="droplet" value={reading?.fuel_level_percent} />
            <MetricTile label="Range" icon="gauge" value={fmtKm(reading?.range_km) ?? "Unknown"} />
            <MetricTile label="Powertrain" icon="droplet" value={reading?.powertrain ?? "Combustion"} />
          </>
        ) : (
          <MetricTile label="Powertrain" icon="gauge" value="Not detected" sub="The AI couldn't read the dashboard clearly." />
        )}
      </div>

      {edited && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
          <Icon name="pencil" className="size-3.5" />
          The driver corrected some of these readings{dashboard?.driver_edited_at ? ` on ${formatDateTime(dashboard.driver_edited_at)}` : ""}. See the comparison below for what changed.
        </p>
      )}
    </section>
  );
}

function WarningLights({ dashboard }: { dashboard: ChecklistResponse["dashboard"] }) {
  const warnings = bestReading(dashboard)?.warnings ?? [];
  if (warnings.length === 0) return null;
  return (
    <section className="rounded-2xl border border-danger/30 bg-danger-soft p-4">
      <h3 className="flex items-center gap-2 font-semibold text-danger">
        <Icon name="alertTriangle" className="size-5" />
        Dashboard warning lights
      </h3>
      <ul className="mt-3 space-y-2">
        {warnings.map((warning) => (
          <li key={`${warning.code}-${warning.label}`} className="flex flex-wrap items-center gap-2 rounded-lg bg-surface/70 px-3 py-2 text-sm">
            <Badge tone={warning.severity === "CRITICAL" ? "danger" : "brand"}>{warning.severity}</Badge>
            <span className="font-medium">{warning.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function LocationChip({ label, snapshot, radiusMeters }: { label: string; snapshot: ChecklistResponse["start_location"]; radiusMeters: number | undefined }) {
  if (!snapshot) return (
    <div className="rounded-lg bg-subtle/60 p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-sm text-muted">Not recorded</p>
    </div>
  );
  return (
    <div className="rounded-lg bg-subtle/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted">{label}</p>
        {snapshot.within_radius !== null && (
          <Badge tone={snapshot.within_radius ? "success" : "danger"} dot>{snapshot.within_radius ? "In range" : "Out of range"}</Badge>
        )}
      </div>
      <p className="mt-1 text-sm font-medium">
        {snapshot.distance_meters !== null ? `${Math.round(snapshot.distance_meters)} m from expected` : "Distance unknown"}
        {radiusMeters ? <span className="text-muted"> (radius {radiusMeters} m)</span> : null}
      </p>
    </div>
  );
}

function LightboxImage({ image, onClose }: { image: ChecklistImage | null; onClose: () => void }) {
  if (!image) return null;
  return (
    <div
      role="dialog"
      aria-modal
      aria-label={`${image.image_type} photo, enlarged`}
      onClick={onClose}
      className="fixed inset-0 z-[100] flex animate-fade-in items-center justify-center bg-black/85 p-4"
    >
      <button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 flex size-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image.url} alt={`${image.image_type} checklist photo, full size`} onClick={(event) => event.stopPropagation()} className="max-h-[90dvh] max-w-full rounded-lg object-contain" />
    </div>
  );
}

function PhotoGallery({ checklist }: { checklist: ChecklistResponse }) {
  const [zoomed, setZoomed] = useState<ChecklistImage | null>(null);
  return (
    <section>
      <h3 className="mb-3 flex items-center gap-2 font-semibold">
        <Icon name="camera" className="size-5 text-muted" />
        Photos
      </h3>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {checklist.images.map((image) => {
          const invalid = image.analysis?.image_valid === false;
          const tone = invalid ? "danger" : image.analysis?.condition === "GOOD" ? "success" : image.analysis?.condition === "NOT_GOOD" ? "danger" : "neutral";
          return (
            <figure key={image.image_type} className={`overflow-hidden rounded-xl border bg-surface ${invalid ? "border-danger/40" : "border-border"}`}>
              <button type="button" onClick={() => setZoomed(image)} className="group relative block w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.url} alt={`${image.image_type} checklist photo`} className="aspect-video w-full bg-subtle object-cover transition group-hover:brightness-90" />
                <span className="absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100">
                  <span className="flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium text-white">
                    <Icon name="zoomIn" className="size-3.5" />
                    View full size
                  </span>
                </span>
              </button>
              <figcaption className="space-y-1 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{image.image_type}</span>
                  <Badge tone={tone}>{invalid ? "Unusable" : (image.analysis?.condition ?? "Pending")}</Badge>
                </div>
                {image.analysis?.image_issue && <p className="text-xs text-danger">{image.analysis.image_issue}</p>}
                {image.analysis?.issues?.map((issue) => (
                  <p key={`${issue.type}-${issue.description}`} className="text-xs text-muted">{issue.severity}: {issue.description}</p>
                ))}
              </figcaption>
            </figure>
          );
        })}
      </div>
      {checklist.missing_images.length > 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-danger">
          <Icon name="alertTriangle" className="size-4" />
          Missing photos: {checklist.missing_images.join(", ")}
        </p>
      )}
      <LightboxImage image={zoomed} onClose={() => setZoomed(null)} />
    </section>
  );
}

const COMPARISON_ROWS: Array<{ key: keyof DashboardReading; label: string; format: (value: unknown) => string }> = [
  { key: "odometer_km", label: "Odometer", format: (v) => fmtKm(v as number) ?? "-" },
  { key: "battery_percent", label: "Battery", format: (v) => fmtPercent(v as number) ?? "-" },
  { key: "fuel_level_percent", label: "Fuel level", format: (v) => fmtPercent(v as number) ?? "-" },
  { key: "range_km", label: "Range", format: (v) => fmtKm(v as number) ?? "-" },
  { key: "is_charging", label: "Charging", format: (v) => (v === true ? "Yes" : v === false ? "No" : "-") },
];

function DashboardComparisonTable({ dashboard }: { dashboard: ChecklistResponse["dashboard"] }) {
  if (!dashboard) return null;
  const rows = COMPARISON_ROWS.filter((row) => [dashboard.ai, dashboard.driver_edits, dashboard.effective].some((r) => r?.[row.key] !== null && r?.[row.key] !== undefined));
  if (rows.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-border">
      <div className="border-b border-border bg-subtle/60 px-4 py-3">
        <h3 className="font-semibold">Dashboard reading</h3>
        <p className="mt-0.5 text-xs text-muted">What the AI read from the photo, any correction the driver made, and the effective value used everywhere else.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[28rem] text-left text-sm">
          <thead className="text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Field</th>
              <th className="px-4 py-2.5 font-semibold">AI read</th>
              <th className="px-4 py-2.5 font-semibold">Driver edit</th>
              <th className="px-4 py-2.5 font-semibold">Effective</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => {
              const aiValue = dashboard.ai?.[row.key];
              const driverValue = dashboard.driver_edits?.[row.key];
              const wasEdited = driverValue !== null && driverValue !== undefined;
              return (
                <tr key={row.key}>
                  <td className="px-4 py-2.5 text-muted">{row.label}</td>
                  <td className="px-4 py-2.5">{row.format(aiValue)}</td>
                  <td className={`px-4 py-2.5 ${wasEdited ? "font-medium text-brand" : "text-muted"}`}>{wasEdited ? row.format(driverValue) : "-"}</td>
                  <td className="px-4 py-2.5 font-semibold">{row.format(dashboard.effective?.[row.key])}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {(dashboard.ai?.confidence !== null && dashboard.ai?.confidence !== undefined) || dashboard.ai?.notes ? (
        <div className="border-t border-border bg-subtle/40 px-4 py-3 text-xs text-muted">
          {dashboard.ai?.confidence !== null && dashboard.ai?.confidence !== undefined && (
            <span className="mr-2 font-medium">AI confidence: {Math.round((dashboard.ai.confidence as number) * 100)}%</span>
          )}
          {dashboard.ai?.notes && <span>{dashboard.ai.notes}</span>}
        </div>
      ) : null}
    </section>
  );
}

function DriverVehicleCell({ checklist }: { checklist: ChecklistResponse }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium"><DriverLink id={checklist.driver.id}>{fullName(checklist.driver)}</DriverLink></p>
      <p className="truncate text-xs text-muted">@{checklist.driver.username}</p>
      <p className="mt-1 truncate text-xs text-muted">{checklist.vehicle.name} · {checklist.vehicle.plate_number}</p>
    </div>
  );
}

function Stats({ items }: { items: ChecklistResponse[] }) {
  const review = items.filter((item) => item.needs_review).length;
  const failed = items.filter((item) => item.analysis?.status === "FAILED").length;
  const submitted = items.filter((item) => item.status === "SUBMITTED").length;
  const inProgress = items.filter((item) => item.status === "IN_PROGRESS").length;
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        ["Needs review", review],
        ["Failed analysis", failed],
        ["Submitted", submitted],
        ["In progress", inProgress],
      ].map(([label, value]) => (
        <div key={label} className="rounded-lg border border-border bg-surface p-4 shadow-card">
          <p className="text-xs font-medium uppercase text-muted">{label}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
        </div>
      ))}
    </section>
  );
}

function ChecklistDetail({
  id,
  onClose,
}: {
  id: string | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const toastError = (error: unknown, fallback: string) => (error instanceof ApiError ? error.message : fallback);
  const [reviewNotes, setReviewNotes] = useState("");
  // Clear the draft note when a different checklist opens, without a setState-in-effect render cascade.
  const [notesFor, setNotesFor] = useState(id);
  if (notesFor !== id) {
    setNotesFor(id);
    setReviewNotes("");
  }
  const detail = useQuery({
    queryKey: queryKeys.dailyChecklists.detail(id ?? ""),
    queryFn: ({ signal }) => getDailyChecklist(id!, signal),
    enabled: Boolean(id),
  });
  const checklist = detail.data;
  const reanalyze = useMutation({
    mutationFn: () => reanalyzeDailyChecklist(id!),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.dailyChecklists.detail(updated.id), updated);
      queryClient.invalidateQueries({ queryKey: queryKeys.dailyChecklists.all });
    },
  });
  const review = useMutation({
    mutationFn: () => reviewDailyChecklist(id!, reviewNotes.trim()),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.dailyChecklists.detail(updated.id), updated);
      queryClient.invalidateQueries({ queryKey: queryKeys.dailyChecklists.all });
      setReviewNotes("");
    },
  });
  const busy = reanalyze.isPending || review.isPending;

  return (
    <Modal open={Boolean(id)} onClose={busy ? () => {} : onClose} title="Checklist review" size="xl">
      {detail.isLoading ? (
        <div className="h-72 animate-pulse rounded-xl bg-subtle" />
      ) : detail.isError ? (
        <Alert tone="error">{detail.error.message}</Alert>
      ) : checklist ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={phaseTone(checklist.phase)}>{PHASE_LABEL[checklist.phase]}</Badge>
              <Badge tone={statusTone(checklist)}>{checklist.analysis ? ANALYSIS_LABEL[checklist.analysis.status] : STATUS_LABEL[checklist.status]}</Badge>
              {checklist.needs_review ? (
                <Badge tone="danger">Needs review</Badge>
              ) : checklist.reviewed ? (
                <Badge tone="success">Reviewed</Badge>
              ) : null}
            </div>
            <p className="text-sm text-muted">{dateLabel(checklist.checklist_date)} · {checklist.window.start_time.slice(0, 5)}–{checklist.window.end_time.slice(0, 5)}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-subtle/40 p-3.5">
            <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
              <Icon name="user" className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium"><DriverLink id={checklist.driver.id}>{fullName(checklist.driver)}</DriverLink></p>
              <p className="text-xs text-muted">
                @{checklist.driver.username}
                {checklist.driver.phone_number && (
                  <>
                    {" · "}
                    <a href={`tel:${checklist.driver.phone_number}`} className="underline underline-offset-2">{checklist.driver.phone_number}</a>
                  </>
                )}
              </p>
            </div>
            <div className="flex gap-4 text-sm sm:gap-6">
              <div>
                <p className="text-xs text-muted">Started</p>
                <p className="font-medium">{shortTime(checklist.started_at)}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Submitted</p>
                <p className="font-medium">{shortTime(checklist.submitted_at)}</p>
              </div>
            </div>
          </div>

          <VehicleConditionHero checklist={checklist} />
          <WarningLights dashboard={checklist.dashboard} />

          {checklist.flags.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-semibold">Flags</h3>
              <div className="grid gap-2">
                {[...checklist.flags].sort((a, b) => Number(b.severity === "CRITICAL") - Number(a.severity === "CRITICAL")).map((flag) => (
                  <div key={`${flag.code}-${flag.message}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3 text-sm">
                    <Badge tone={severityTone(flag.severity)}>{flag.severity}</Badge>
                    <span className="font-medium">{flag.code.replaceAll("_", " ")}</span>
                    <span className="text-muted">{flag.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <PhotoGallery checklist={checklist} />

          <DashboardComparisonTable dashboard={checklist.dashboard} />

          <section className="rounded-xl border border-border p-4">
            <h3 className="font-semibold">Location & schedule</h3>
            {checklist.expected_location && (
              <p className="mt-1 text-sm text-muted">Expected at {checklist.expected_location.address}</p>
            )}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <LocationChip label="At start" snapshot={checklist.start_location} radiusMeters={checklist.expected_location?.radius_meters} />
              <LocationChip label="At submit" snapshot={checklist.submit_location} radiusMeters={checklist.expected_location?.radius_meters} />
            </div>
          </section>

          {checklist.condition && (
            <section className="rounded-xl border border-border p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold">Exterior condition</h3>
                <Badge tone={checklist.condition.status === "GOOD" ? "success" : checklist.condition.status === "NOT_GOOD" ? "danger" : "neutral"}>
                  {checklist.condition.status}
                </Badge>
              </div>
              {checklist.condition.summary && <p className="mt-2 text-sm text-muted">{checklist.condition.summary}</p>}
            </section>
          )}

          {checklist.comparison && (
            <section className="rounded-xl border border-border p-4">
              <h3 className="font-semibold">Drop-off comparison</h3>
              <p className="mt-1 text-sm text-muted">Verdict: {checklist.comparison.verdict ?? "Pending"}</p>
              {checklist.comparison.new_damage.length > 0 && (
                <ul className="mt-3 space-y-2 text-sm">
                  {checklist.comparison.new_damage.map((damage) => (
                    <li key={`${damage.side}-${damage.type}-${damage.description}`} className="rounded-lg bg-danger-soft p-3 text-danger">
                      {damage.side}: {damage.severity} {damage.type} - {damage.description}
                    </li>
                  ))}
                </ul>
              )}
              {checklist.comparison.notes && <p className="mt-3 text-sm text-muted">{checklist.comparison.notes}</p>}
            </section>
          )}

          <section className="space-y-3 rounded-xl border border-border p-4">
            <h3 className="font-semibold">Review</h3>
            {checklist.reviewed ? (
              <div className="rounded-lg bg-subtle/60 p-3 text-sm">
                <p className="font-medium">Reviewed by {fullName(checklist.reviewed.by)} on {formatDateTime(checklist.reviewed.at)}</p>
                {checklist.reviewed.notes && <p className="mt-1 text-muted">{checklist.reviewed.notes}</p>}
              </div>
            ) : checklist.status === "SUBMITTED" ? (
              <div className="space-y-2">
                <textarea
                  value={reviewNotes}
                  onChange={(event) => setReviewNotes(event.target.value.slice(0, 1000))}
                  rows={3}
                  disabled={review.isPending}
                  className="w-full resize-none rounded-lg border border-input bg-surface p-3 text-sm outline-none focus:border-brand focus:ring-3 focus:ring-brand/20"
                  placeholder="Optional notes (e.g. called the driver, dent is old damage)"
                />
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted">{reviewNotes.length}/1000</p>
                  <Button onClick={() => review.mutate()} loading={review.isPending}>Mark reviewed</Button>
                </div>
                {review.isError && <Alert tone="error">{toastError(review.error, "Couldn't sign off this checklist.")}</Alert>}
              </div>
            ) : (
              <p className="text-sm text-muted">Only submitted checklists can be reviewed.</p>
            )}
          </section>

          {reanalyze.isError && <Alert tone="error">{toastError(reanalyze.error, "Couldn't re-run analysis.")}</Alert>}

          <ModalActions>
            <Button variant="secondary" onClick={onClose} disabled={busy}>Close</Button>
            <Button onClick={() => reanalyze.mutate()} loading={reanalyze.isPending} disabled={review.isPending}>Re-run analysis</Button>
          </ModalActions>
        </div>
      ) : null}
    </Modal>
  );
}

export function DailyChecklistsPage() {
  const user = useCurrentUser();
  const isStaff = user.user_type === "ADMIN" || user.user_type === "ACCOUNT_OFFICER" || user.user_type === "RELATIONSHIP_OFFICER";
  const url = useUrlState();
  const search = useSearchState(url, "q");
  const [selected, setSelected] = useState<string | null>(null);

  const phase = (["PICK_UP", "DROP_OFF"].includes(url.get("phase")) ? url.get("phase") : "") as ChecklistPhase | "";
  const status = (["IN_PROGRESS", "SUBMITTED"].includes(url.get("status")) ? url.get("status") : "") as ChecklistStatus | "";
  const analysis = (["PENDING", "PROCESSING", "COMPLETED", "FAILED"].includes(url.get("analysis")) ? url.get("analysis") : "") as AnalysisStatus | "";
  const review = url.get("review");
  // Set by links from a driver page; narrows the list to that driver until cleared.
  const driverId = url.get("driverId");
  // No range in the URL means "today"; a lone bound is treated as a single day.
  const today = lagosToday();
  const dateFrom = url.get("from") || url.get("to") || today;
  const dateTo = url.get("to") || url.get("from") || today;

  const filters = useMemo<ListDailyChecklistsParams>(
    () => ({
      page: url.page,
      page_size: PAGE_SIZE,
      dateFrom,
      dateTo,
      phase: phase || undefined,
      status: status || undefined,
      analysisStatus: analysis || undefined,
      driverId: driverId || undefined,
      needsReview: review === "true" ? true : undefined,
      searchTerm: search.committed || undefined,
    }),
    [analysis, dateFrom, dateTo, driverId, phase, review, search.committed, status, url.page],
  );

  // Resolves the name for the driver chip (the users endpoint is admin-only).
  const filterDriver = useManagedUser(driverId, user.user_type === "ADMIN" && Boolean(driverId));

  const list = useQuery({
    queryKey: queryKeys.dailyChecklists.list(filters),
    queryFn: ({ signal }) => listDailyChecklists(filters, signal),
    enabled: isStaff && (!dateFrom || !dateTo || dateFrom <= dateTo),
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: true,
    ...CACHE.live,
  });

  useEffect(() => {
    const totalPages = list.data?.pagination.total_pages ?? 1;
    if (list.data && url.page > Math.max(1, totalPages)) url.set({ page: 1 });
  }, [list.data, url]);

  if (!isStaff) return <AccessDenied />;

  const items = list.data?.items ?? [];
  const invalidRange = dateFrom && dateTo && dateFrom > dateTo;
  const isFiltered = Boolean(search.text || phase || status || analysis || review || driverId || url.get("from") || url.get("to"));
  const clear = () => {
    search.setText("");
    url.set({ q: "", phase: "", status: "", analysis: "", review: "", driverId: "", page: 1, from: "", to: "" });
  };
  const applyRange = ({ from, to }: { from: string; to: string }) => {
    const isToday = from === today && to === today;
    url.set({ from: isToday ? "" : from, to: isToday ? "" : to, page: 1 });
  };

  return (
    <div className="space-y-5">
      <ConfigPageHeader
        icon="clipboard"
        showBackLink={false}
        title="Daily checklists"
        description="Review driver pick-up and drop-off submissions, AI analysis, dashboard readings and damage flags."
      />

      <Stats items={items} />

      <section className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-card">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_19rem_auto]">
          <SearchInput value={search.text} onChange={search.setText} placeholder="Search driver, vehicle or plate" label="Search checklists" />
          <DateRangePicker compact allowAll={false} align="end" from={dateFrom} to={dateTo} onApply={applyRange} />
          <Button variant="secondary" onClick={clear} disabled={!isFiltered}>Clear</Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select label="Phase" hideLabel value={phase} onChange={(event) => url.set({ phase: event.target.value, page: 1 })}>
            <option value="">All phases</option>
            <option value="PICK_UP">Pick-up</option>
            <option value="DROP_OFF">Drop-off</option>
          </Select>
          <Select label="Status" hideLabel value={status} onChange={(event) => url.set({ status: event.target.value, page: 1 })}>
            <option value="">All statuses</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="SUBMITTED">Submitted</option>
          </Select>
          <Select label="Analysis" hideLabel value={analysis} onChange={(event) => url.set({ analysis: event.target.value, page: 1 })}>
            <option value="">Any analysis</option>
            <option value="PENDING">Pending</option>
            <option value="PROCESSING">Processing</option>
            <option value="COMPLETED">Completed</option>
            <option value="FAILED">Failed</option>
          </Select>
          <Select label="Review" hideLabel value={review} onChange={(event) => url.set({ review: event.target.value, page: 1 })}>
            <option value="">All checklists</option>
            <option value="true">Needs review</option>
          </Select>
        </div>
        {driverId && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">Showing checklists for</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft py-1 pl-3 pr-1 font-medium text-brand">
              {filterDriver.data ? fullName(filterDriver.data) : "one driver"}
              <button type="button" aria-label="Show all drivers" onClick={() => url.set({ driverId: "", page: 1 })} className="flex size-6 items-center justify-center rounded-full transition hover:bg-brand/15">
                <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            </span>
            <DriverLink id={driverId} className="text-xs font-medium text-brand">Open driver page</DriverLink>
          </div>
        )}
        {invalidRange && <p className="text-sm text-danger">The start date must be before or equal to the end date.</p>}
        <p className="text-xs text-muted">Live checklist updates refresh this view automatically.</p>
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        {list.isLoading ? (
          <div className="animate-pulse divide-y divide-border">
            {Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-20 bg-subtle/30" />)}
          </div>
        ) : list.isError ? (
          <ErrorState message={list.error.message} onRetry={() => list.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState icon="clipboard" title="No checklists match" action={<Button variant="secondary" onClick={clear}>Reset filters</Button>}>
            Try another date range or remove a filter.
          </EmptyState>
        ) : (
          <>
            <div className={`hidden gap-4 bg-subtle/70 px-6 py-3 text-xs font-semibold uppercase text-muted md:grid ${ROW_GRID}`}>
              <span>Driver & vehicle</span>
              <span>Date</span>
              <span>Phase</span>
              <span>Status</span>
              <span>Analysis</span>
              <span>Flags</span>
            </div>
            <ul className="divide-y divide-border">
              {items.map((checklist) => (
                <li
                  key={checklist.id}
                  onClick={() => setSelected(checklist.id)}
                  className={`grid cursor-pointer items-center gap-x-4 gap-y-2.5 px-4 py-4 transition hover:bg-subtle/50 sm:px-6 ${ROW_GRID}`}
                >
                  <DriverVehicleCell checklist={checklist} />
                  <p className="text-sm">{dateLabel(checklist.checklist_date)}</p>
                  <div><Badge tone={phaseTone(checklist.phase)}>{PHASE_LABEL[checklist.phase]}</Badge></div>
                  <p className="text-sm">{STATUS_LABEL[checklist.status]}</p>
                  <div><Badge tone={statusTone(checklist)}>{checklist.analysis ? ANALYSIS_LABEL[checklist.analysis.status] : "Not started"}</Badge></div>
                  <div className="flex flex-wrap gap-1.5">
                    {checklist.needs_review && <Badge tone="danger">Review</Badge>}
                    {!checklist.needs_review && checklist.reviewed && <Badge tone="success">Reviewed</Badge>}
                    {checklist.flags.slice(0, 2).map((flag) => <Badge key={flag.code} tone={severityTone(flag.severity)}>{flag.code.replaceAll("_", " ")}</Badge>)}
                    {checklist.flags.length > 2 && <Badge>+{checklist.flags.length - 2}</Badge>}
                  </div>
                </li>
              ))}
            </ul>
            <Pagination pagination={list.data?.pagination} onPage={(page) => url.set({ page })} noun="checklists" />
          </>
        )}
      </section>

      <ChecklistDetail id={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
