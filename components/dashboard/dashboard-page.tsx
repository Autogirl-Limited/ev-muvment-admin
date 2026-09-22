"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQueryClient, type UseQueryResult } from "@tanstack/react-query";

import { AccessDenied } from "@/components/dashboard/access-denied";
import { ErrorState, Icon, type IconName } from "@/components/dashboard/screen-kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AttentionItem, DashboardInterval, FinancialSummary, Metric, Overview, PieChart, TimeSeries } from "@/lib/api/dashboard";
import { formatDate, formatRelative, naira } from "@/lib/format";
import { queryKeys } from "@/lib/query/keys";
import { useDashboardQueries } from "@/lib/query/dashboard";
import { useCurrentUser } from "@/lib/query/user";

const INTERVALS: { value: DashboardInterval; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

const SLICE_COLORS: Record<string, string> = {
  PENDING_PAYMENT: "#f59e0b",
  AWAITING_ALLOCATION: "#ef4444",
  COMPLETED: "#16a34a",
  CANCELLED: "#71717a",
  EXPIRED: "#a1a1aa",
  GOOD: "#16a34a",
  NOT_GOOD: "#ef4444",
  UNCLEAR: "#f59e0b",
  NO_DATA: "#94a3b8",
};

const SERIES_COLORS: Record<string, string> = {
  dva_inflow: "#0b7a5a",
  free_grants: "#2563eb",
  paid_topups: "#db2777",
};

const ATTENTION_ROUTES: Record<string, string> = {
  AWAITING_ALLOCATION: "/wallet?status=AWAITING_ALLOCATION",
  CHECKLISTS_NEEDING_REVIEW: "/daily-checklists?needsReview=true",
  PENDING_APPLICATIONS: "/admin/driver-applications?status=PENDING",
};

function toInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function initialRange() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 29);
  return { dateFrom: toInputDate(start), dateTo: toInputDate(end) };
}

function formatCompact(value: number, unit?: string) {
  if (unit === "NGN") return naira(value);
  if (unit === "kWh") return `${new Intl.NumberFormat("en-NG", { maximumFractionDigits: 2 }).format(value)} kWh`;
  return new Intl.NumberFormat("en-NG", { maximumFractionDigits: 1 }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-NG").format(value);
}

function labelPoint(point: string, interval: DashboardInterval) {
  const date = new Date(`${point}T00:00:00+01:00`);
  if (interval === "month") {
    return new Intl.DateTimeFormat("en-NG", { month: "short", year: "numeric", timeZone: "Africa/Lagos" }).format(date);
  }
  const text = new Intl.DateTimeFormat("en-NG", { day: "2-digit", month: "short", timeZone: "Africa/Lagos" }).format(date);
  return interval === "week" ? `Week of ${text}` : text;
}

function isLoading(queries: UseQueryResult[]) {
  return queries.some((query) => query.isLoading);
}

function firstError(queries: UseQueryResult[]) {
  return queries.find((query) => query.isError)?.error;
}

function CardShell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-border bg-surface shadow-card ${className}`}>{children}</section>;
}

function LoadingBlock({ className = "h-32" }: { className?: string }) {
  return <div className={`${className} animate-pulse rounded-xl bg-subtle`} />;
}

function HeroMetric({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: IconName }) {
  return (
    <CardShell className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted">{label}</p>
          <p className="mt-2 truncate text-2xl font-semibold tracking-tight sm:text-3xl">{value}</p>
        </div>
        <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
          <Icon name={icon} className="size-5" />
        </span>
      </div>
      <p className="mt-3 truncate text-xs text-muted">{detail}</p>
    </CardShell>
  );
}

function OverviewGrid({ overview }: { overview: Overview }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <HeroMetric
        icon="users"
        label="Drivers"
        value={formatNumber(overview.drivers.total)}
        detail={`${formatNumber(overview.drivers.active)} active · ${formatNumber(overview.drivers.on_shift)} on shift`}
      />
      <HeroMetric
        icon="car"
        label="Fleet vehicles"
        value={formatNumber(overview.vehicles.total)}
        detail={`${formatNumber(overview.vehicles.assigned)} assigned · ${formatNumber(overview.vehicles.unassigned)} available`}
      />
      <HeroMetric
        icon="wallet"
        label="Awaiting allocation"
        value={formatNumber(overview.awaiting_allocation)}
        detail={`${formatNumber(overview.pending_applications)} pending driver applications`}
      />
      <HeroMetric
        icon="bolt"
        label="Energy rate"
        value={overview.current_rate_per_kwh === null ? "Not set" : `${naira(overview.current_rate_per_kwh)}/kWh`}
        detail={`${formatNumber(overview.checklists_needing_review)} checklist reviews in ${overview.review_window_days} days`}
      />
    </div>
  );
}

function ChangeBadge({ metric }: { metric: Metric }) {
  if (metric.change_percent === null) return <Badge tone="neutral">New</Badge>;
  const positive = metric.change_percent >= 0;
  return (
    <Badge tone={positive ? "success" : "danger"}>
      {positive ? "+" : ""}
      {metric.change_percent.toFixed(1)}%
    </Badge>
  );
}

function FinancialCards({ summary }: { summary: FinancialSummary }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {summary.metrics.map((metric) => (
        <CardShell key={metric.key} className="p-4">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm text-muted">{metric.label}</p>
            <ChangeBadge metric={metric} />
          </div>
          <p className="mt-3 break-words text-2xl font-semibold tracking-tight">{formatCompact(metric.value, metric.unit)}</p>
          <p className="mt-2 text-xs text-muted">Previous {formatCompact(metric.previous_value, metric.unit)}</p>
        </CardShell>
      ))}
    </div>
  );
}

function AttentionFeed({ attention, isAdmin }: { attention: AttentionItem[]; isAdmin: boolean }) {
  const visible = attention.filter((item) => item.count > 0);
  return (
    <CardShell className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Needs attention</h2>
          <p className="mt-1 text-sm text-muted">{visible.length ? "Open operational items across the platform." : "Everything urgent is clear."}</p>
        </div>
        <Badge tone={visible.length ? "danger" : "success"}>{formatNumber(visible.reduce((sum, item) => sum + item.count, 0))}</Badge>
      </div>
      <div className="mt-4 space-y-2">
        {visible.length === 0 ? (
          <div className="rounded-lg bg-subtle p-4 text-sm text-muted">No queues need action right now.</div>
        ) : (
          visible.map((item) => {
            const href = ATTENTION_ROUTES[item.key];
            const content = (
              <>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{item.label}</span>
                  <span className="block truncate text-xs text-muted">{item.oldest_at ? `Oldest ${formatRelative(item.oldest_at)}` : "No waiting item"}</span>
                </span>
                <span className="ml-auto flex items-center gap-2">
                  <Badge tone="brand">{formatNumber(item.count)}</Badge>
                  {isAdmin && href && <Icon name="chevronRight" className="size-4 text-muted" />}
                </span>
              </>
            );
            return isAdmin && href ? (
              <Link key={item.key} href={href} className="flex items-center gap-3 rounded-lg border border-border p-3 transition hover:bg-subtle">
                {content}
              </Link>
            ) : (
              <div key={item.key} className="flex items-center gap-3 rounded-lg border border-border p-3">
                {content}
              </div>
            );
          })
        )}
      </div>
    </CardShell>
  );
}

function DateControls({
  dateFrom,
  dateTo,
  interval,
  error,
  onRange,
  onInterval,
  onRefresh,
}: {
  dateFrom: string;
  dateTo: string;
  interval: DashboardInterval;
  error?: string;
  onRange: (range: { dateFrom: string; dateTo: string }) => void;
  onInterval: (interval: DashboardInterval) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:max-w-2xl">
        <label className="min-w-0 text-sm font-medium">
          <span className="mb-1.5 block text-muted">From</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(event) => onRange({ dateFrom: event.target.value, dateTo })}
            className="h-10 w-full rounded-lg border border-input bg-surface px-3 text-sm outline-none transition focus:border-brand focus:ring-3 focus:ring-brand/20"
          />
        </label>
        <label className="min-w-0 text-sm font-medium">
          <span className="mb-1.5 block text-muted">To</span>
          <input
            type="date"
            value={dateTo}
            onChange={(event) => onRange({ dateFrom, dateTo: event.target.value })}
            className="h-10 w-full rounded-lg border border-input bg-surface px-3 text-sm outline-none transition focus:border-brand focus:ring-3 focus:ring-brand/20"
          />
        </label>
        <Button variant="secondary" onClick={onRefresh} className="self-end">
          <Icon name="refresh" className="size-4" />
          Refresh
        </Button>
      </div>
      <div role="group" aria-label="Trend interval" className="grid grid-cols-3 gap-1 rounded-lg bg-subtle p-1 lg:w-64">
        {INTERVALS.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={interval === item.value}
            onClick={() => onInterval(item.value)}
            className={`h-9 rounded-md px-3 text-sm font-medium transition ${interval === item.value ? "bg-surface text-foreground shadow-card" : "text-muted hover:text-foreground"}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      {error && <p className="text-sm font-medium text-danger lg:ml-auto">{error}</p>}
    </div>
  );
}

function DonutChart({ title, chart, totalLabel }: { title: string; chart: PieChart; totalLabel: string }) {
  const nonZero = chart.slices.filter((slice) => slice.value > 0);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const segments = nonZero.map((slice, index) => {
    const previous = nonZero.slice(0, index).reduce((sum, item) => sum + (item.value / Math.max(1, chart.total)) * circumference, 0);
    const length = (slice.value / Math.max(1, chart.total)) * circumference;
    return { slice, length, offset: previous };
  });

  return (
    <CardShell className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted">{totalLabel}</p>
        </div>
        <Badge tone="neutral">{formatNumber(chart.total)}</Badge>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-center">
        <div className="relative mx-auto size-44">
          <svg viewBox="0 0 120 120" className="size-full -rotate-90" role="img" aria-label={title}>
            <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--subtle)" strokeWidth="18" />
            {segments.map(({ slice, length, offset }) => (
                <circle
                  key={slice.key}
                  cx="60"
                  cy="60"
                  r={radius}
                  fill="none"
                  stroke={SLICE_COLORS[slice.key] ?? "#0b7a5a"}
                  strokeWidth="18"
                  strokeDasharray={`${length} ${circumference - length}`}
                  strokeDashoffset={-offset}
                  strokeLinecap="round"
                />
            ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-2xl font-semibold">{formatNumber(chart.total)}</span>
            <span className="text-xs text-muted">total</span>
          </div>
        </div>
        <div className="min-w-0 space-y-2">
          {chart.slices.map((slice) => (
            <div key={slice.key} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 text-sm">
              <span aria-hidden style={{ backgroundColor: SLICE_COLORS[slice.key] ?? "#0b7a5a" }} className="size-2.5 rounded-full" />
              <span className="truncate">{slice.label}</span>
              <span className="text-muted">{formatNumber(slice.value)} · {slice.percentage.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    </CardShell>
  );
}

function TrendChart({ trend }: { trend: TimeSeries }) {
  const width = 760;
  const height = 290;
  const pad = { left: 54, right: 18, top: 22, bottom: 42 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const max = Math.max(1, ...trend.series.flatMap((series) => series.data));
  const x = (index: number) => pad.left + (trend.points.length <= 1 ? plotWidth / 2 : (index / (trend.points.length - 1)) * plotWidth);
  const y = (value: number) => pad.top + plotHeight - (value / max) * plotHeight;
  const yTicks = [0, max / 2, max];
  const visibleIndexes = trend.points.map((_, index) => index).filter((index) => index === 0 || index === trend.points.length - 1 || index === Math.floor((trend.points.length - 1) / 2));

  return (
    <CardShell className="p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Money trend</h2>
          <p className="mt-1 text-sm text-muted">{formatDate(trend.date_from)} to {formatDate(trend.date_to)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {trend.series.map((series) => (
            <Badge key={series.key} tone="neutral" dot>
              <span style={{ color: SERIES_COLORS[series.key] ?? "currentColor" }}>{series.label}</span>
            </Badge>
          ))}
        </div>
      </div>
      <div className="mt-4 overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-72 min-w-[42rem] w-full" role="img" aria-label="Money trend chart">
          {yTicks.map((tick) => (
            <g key={tick}>
              <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} stroke="var(--border)" strokeDasharray="4 6" />
              <text x={pad.left - 10} y={y(tick) + 4} textAnchor="end" className="fill-muted text-[11px]">{tick === 0 ? "0" : naira(tick)}</text>
            </g>
          ))}
          {trend.series.map((series) => {
            const points = series.data.map((value, index) => `${x(index)},${y(value)}`).join(" ");
            return (
              <g key={series.key}>
                <polyline points={points} fill="none" stroke={SERIES_COLORS[series.key] ?? "#0b7a5a"} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
                {series.data.map((value, index) => (
                  <circle key={`${series.key}-${index}`} cx={x(index)} cy={y(value)} r="3.5" fill={SERIES_COLORS[series.key] ?? "#0b7a5a"} />
                ))}
              </g>
            );
          })}
          {visibleIndexes.map((index) => (
            <text key={index} x={x(index)} y={height - 14} textAnchor={index === 0 ? "start" : index === trend.points.length - 1 ? "end" : "middle"} className="fill-muted text-[12px]">
              {labelPoint(trend.points[index], trend.interval)}
            </text>
          ))}
        </svg>
      </div>
    </CardShell>
  );
}

export function DashboardPage() {
  const currentUser = useCurrentUser();
  const isStaff = currentUser.user_type === "ADMIN" || currentUser.user_type === "ACCOUNT_OFFICER" || currentUser.user_type === "RELATIONSHIP_OFFICER";
  const isAdmin = currentUser.user_type === "ADMIN";
  const [range, setRange] = useState(initialRange);
  const [interval, setInterval] = useState<DashboardInterval>("day");
  const queryClient = useQueryClient();

  const rangeError = range.dateFrom && range.dateTo && range.dateFrom > range.dateTo ? "Start date must be before end date." : undefined;
  const filters = useMemo(() => ({ ...range, interval }), [interval, range]);
  const queries = useDashboardQueries(filters, isStaff && !rangeError);
  const allQueries = Object.values(queries);
  const error = firstError(allQueries);

  if (!isStaff) return <AccessDenied />;

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
  const overview = queries.overview.data;
  const summary = queries.financialSummary.data;
  const attention = queries.needsAttention.data;
  const allocations = queries.allocationsByStatus.data;
  const condition = queries.vehicleCondition.data;
  const trend = queries.moneyTrend.data;

  return (
    <div className="mx-auto w-full max-w-[94rem] space-y-5">
      <header className="space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-brand">Dashboard</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
              Welcome back, {currentUser.first_name}.
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Fleet health, wallet flow, and operational queues for the current admin cycle.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
            <Link href="/wallet" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-medium transition hover:bg-subtle">
              <Icon name="wallet" className="size-4" />
              EV Wallet
            </Link>
            <Link href="/daily-checklists" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-medium transition hover:bg-subtle">
              <Icon name="clipboard" className="size-4" />
              Checklists
            </Link>
          </div>
        </div>
        <CardShell className="p-4">
          <DateControls
            dateFrom={range.dateFrom}
            dateTo={range.dateTo}
            interval={interval}
            error={rangeError || (error instanceof Error ? error.message : undefined)}
            onRange={setRange}
            onInterval={setInterval}
            onRefresh={refresh}
          />
        </CardShell>
      </header>

      {error && !rangeError ? (
        <ErrorState message={error instanceof Error ? error.message : "Dashboard data could not be loaded."} onRetry={refresh} />
      ) : isLoading(allQueries) ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => <LoadingBlock key={index} className="h-32" />)}
          </div>
          <LoadingBlock className="h-72" />
          <div className="grid gap-4 xl:grid-cols-2">
            <LoadingBlock className="h-80" />
            <LoadingBlock className="h-80" />
          </div>
        </div>
      ) : (
        <>
          {overview && <OverviewGrid overview={overview} />}
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
            <div className="space-y-4">
              {summary && <FinancialCards summary={summary} />}
              {trend && <TrendChart trend={trend} />}
            </div>
            {attention && <AttentionFeed attention={attention.items} isAdmin={isAdmin} />}
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {allocations && <DonutChart title="Allocations by status" chart={allocations} totalLabel="Wallet allocation count" />}
            {condition && <DonutChart title="Vehicle condition" chart={condition} totalLabel="Latest checklist verdict" />}
          </div>
        </>
      )}
    </div>
  );
}
