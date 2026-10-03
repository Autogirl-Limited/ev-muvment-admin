import type { ReactNode } from "react";

import type { EntryStatus, MatchMethod, PersonRef, Reconciliation } from "@/lib/api/bolt-reconciliations";
import { dateLabel } from "@/components/ui/date-range-picker";
import { fullName, naira } from "@/lib/format";

/** Bolt reports kobo; show it only when there is some, so whole amounts stay clean. */
export function money(value: number) {
  return naira(value, Number.isInteger(Math.round(value * 100) / 100) ? 0 : 2);
}

/** "₦2,600 short" / "₦500 over" / "Balanced", from `dva_amount - collected_cash`. */
export function signedMoney(value: number) {
  if (value === 0) return money(0);
  return `${value > 0 ? "+" : "−"}${money(Math.abs(value))}`;
}

export function periodLabel(report: Pick<Reconciliation, "period_start" | "period_end">) {
  return report.period_start === report.period_end
    ? dateLabel(report.period_start)
    : `${dateLabel(report.period_start)} to ${dateLabel(report.period_end)}`;
}

export function weekday(date: string) {
  return new Intl.DateTimeFormat("en-NG", { weekday: "long", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

export function personName(person: PersonRef | null | undefined) {
  return person ? fullName(person) : null;
}

export const STATUS_META: Record<EntryStatus, { label: string; hint: string; pill: string; dot: string }> = {
  SHORT: {
    label: "Short",
    hint: "Paid in less than they collected",
    pill: "bg-danger-soft text-danger",
    dot: "bg-danger",
  },
  UNMATCHED: {
    label: "Unmatched",
    hint: "No driver account matched this row's email or phone. Link it to check it",
    pill: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  OVER: {
    label: "Over",
    hint: "Paid in more than they collected",
    pill: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
    dot: "bg-sky-500",
  },
  NOT_IN_REPORT: {
    label: "Not in report",
    hint: "Their DVA was funded but they aren't in the Bolt report",
    pill: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
    dot: "bg-violet-500",
  },
  DUPLICATE: {
    label: "Duplicate",
    hint: "Listed twice in the report; their cash is counted on the first row",
    pill: "bg-subtle text-muted",
    dot: "bg-zinc-400",
  },
  BALANCED: {
    label: "Balanced",
    hint: "Paid in what they collected (within ₦1)",
    pill: "bg-success-soft text-success",
    dot: "bg-success",
  },
  NO_CASH: {
    label: "No cash",
    hint: "Nothing collected and nothing paid in",
    pill: "bg-subtle text-muted",
    dot: "bg-zinc-300 dark:bg-zinc-600",
  },
};

export const STATUS_COUNT_KEY: Record<EntryStatus, keyof Reconciliation["summary"]> = {
  SHORT: "short_count",
  UNMATCHED: "unmatched_rows",
  OVER: "over_count",
  NOT_IN_REPORT: "not_in_report_count",
  DUPLICATE: "duplicate_count",
  BALANCED: "balanced_count",
  NO_CASH: "no_cash_count",
};

export const MATCH_LABELS: Record<MatchMethod, string> = {
  EMAIL: "Matched by email",
  LOTGRIDS_EMAIL: "Matched by LotGrids email",
  PHONE: "Matched by phone",
  MANUAL: "Linked by an admin",
  NONE: "Not matched",
  DVA: "Found from DVA payments",
};

export function StatusBadge({ status }: { status: EntryStatus }) {
  const meta = STATUS_META[status];
  return (
    <span title={meta.hint} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.pill}`}>
      <span aria-hidden className={`size-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

/** The difference, coloured: red when short, blue when over, muted when there is nothing to compare. */
export function VarianceText({ value, className = "" }: { value: number | null; className?: string }) {
  if (value === null) return <span className={`text-muted ${className}`}>-</span>;
  const tone = Math.abs(value) <= 1 ? "text-success" : value < 0 ? "text-danger" : "text-sky-700 dark:text-sky-300";
  return <span className={`font-semibold tabular-nums ${tone} ${className}`}>{signedMoney(value)}</span>;
}

/** A thin stacked bar of every entry status, in worst-first order. */
export function StatusBar({ summary, className = "" }: { summary: Reconciliation["summary"]; className?: string }) {
  const parts = (Object.keys(STATUS_COUNT_KEY) as EntryStatus[])
    .map((status) => ({ status, count: summary[STATUS_COUNT_KEY[status]] as number }))
    .filter((part) => part.count > 0);
  const total = parts.reduce((sum, part) => sum + part.count, 0);
  if (total === 0) return <div className={`h-1.5 rounded-full bg-subtle ${className}`} />;
  return (
    <div className={`flex h-1.5 gap-px overflow-hidden rounded-full bg-subtle ${className}`} aria-hidden>
      {parts.map((part) => (
        <span key={part.status} className={STATUS_META[part.status].dot} style={{ width: `${(part.count / total) * 100}%` }} />
      ))}
    </div>
  );
}

/** One-line verdict for a report, used by the list and the detail banner. */
export function reportVerdict(summary: Reconciliation["summary"]): { tone: "danger" | "warning" | "success" | "neutral"; title: string; detail: ReactNode } {
  if (summary.total_shortfall > 0) {
    return {
      tone: "danger",
      title: `${money(summary.total_shortfall)} missing`,
      detail: `${summary.short_count} ${summary.short_count === 1 ? "driver" : "drivers"} paid in less than they collected`,
    };
  }
  if (summary.unmatched_rows > 0) {
    return {
      tone: "warning",
      title: `${summary.unmatched_rows} unmatched`,
      detail: `${money(summary.unmatched_collected_cash)} of cash can't be checked yet`,
    };
  }
  if (summary.report_rows === 0) return { tone: "neutral", title: "Empty report", detail: "No driver rows in the file" };
  return { tone: "success", title: "All accounted for", detail: "No matched driver is short" };
}

export const VERDICT_TONES = {
  danger: "text-danger",
  warning: "text-amber-700 dark:text-amber-300",
  success: "text-success",
  neutral: "text-muted",
} as const;
