"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { LAGOS } from "@/lib/format";

export function lagosToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: LAGOS }).format(new Date());
}

function addDays(dateText: string, days: number) {
  const [year, month, day] = dateText.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12));
  return date.toISOString().slice(0, 10);
}

function monthStart(dateText: string) {
  return `${dateText.slice(0, 8)}01`;
}

function monthLabel(month: string) {
  const [year, value] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-NG", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, value - 1, 1)));
}

function daysInMonth(month: string) {
  const [year, value] = month.split("-").map(Number);
  return new Date(Date.UTC(year, value, 0)).getUTCDate();
}

function weekdayOffset(month: string) {
  const [year, value] = month.split("-").map(Number);
  return new Date(Date.UTC(year, value - 1, 1)).getUTCDay();
}

function shiftMonth(month: string, delta: number) {
  const [year, value] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, value - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

export function dateLabel(date: string) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

function rangeLabel(from: string, to: string) {
  if (!from && !to) return "All time";
  if (from && to && from === to) return dateLabel(from);
  if (from && to) return `${dateLabel(from)} to ${dateLabel(to)}`;
  if (from) return `From ${dateLabel(from)}`;
  return `Until ${dateLabel(to)}`;
}

type Preset = "today" | "yesterday" | "7" | "month" | "all";

const PRESETS: Array<[Preset, string]> = [
  ["today", "Today"],
  ["yesterday", "Yesterday"],
  ["7", "Last 7 days"],
  ["month", "This month"],
  ["all", "All time"],
];

interface DateRangePickerProps {
  from: string;
  to: string;
  onApply: (range: { from: string; to: string }) => void;
  align?: "start" | "end";
  className?: string;
  /** Single-line, input-height trigger for filter bars. */
  compact?: boolean;
  /** Offer the "All time" (no bounds) range. Turn off when the API needs dates. */
  allowAll?: boolean;
}

export function DateRangePicker({ from, to, onApply, align = "start", className = "", compact = false, allowAll = true }: DateRangePickerProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const [month, setMonth] = useState((from || lagosToday()).slice(0, 7));
  const days = Array.from({ length: daysInMonth(month) }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`);
  const offset = weekdayOffset(month);
  const today = lagosToday();

  const pick = (day: string) => {
    if (!draftFrom || (draftFrom && draftTo)) {
      setDraftFrom(day);
      setDraftTo("");
    } else if (day < draftFrom) {
      setDraftFrom(day);
      setDraftTo(draftFrom);
    } else {
      setDraftTo(day);
    }
  };

  const setPreset = (preset: Preset) => {
    if (preset === "all") {
      setDraftFrom("");
      setDraftTo("");
      return;
    }
    if (preset === "today") {
      setDraftFrom(today);
      setDraftTo(today);
      setMonth(today.slice(0, 7));
      return;
    }
    if (preset === "yesterday") {
      const yesterday = addDays(today, -1);
      setDraftFrom(yesterday);
      setDraftTo(yesterday);
      setMonth(yesterday.slice(0, 7));
      return;
    }
    if (preset === "7") {
      setDraftFrom(addDays(today, -6));
      setDraftTo(today);
      setMonth(today.slice(0, 7));
      return;
    }
    setDraftFrom(monthStart(today));
    setDraftTo(today);
    setMonth(today.slice(0, 7));
  };

  const apply = () => {
    onApply({ from: draftFrom, to: draftTo || draftFrom });
    setOpen(false);
  };
  const panelAlign = align === "end" ? "sm:left-auto sm:right-0" : "sm:right-auto";
  const presets = allowAll ? PRESETS : PRESETS.filter(([id]) => id !== "all");
  const canApply = allowAll || Boolean(draftFrom);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!popoverRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={popoverRef} className={`relative ${className}`}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setDraftFrom(from);
          setDraftTo(to);
          setMonth((from || lagosToday()).slice(0, 7));
          setOpen((value) => !value);
        }}
        className={`group flex w-full items-center justify-between gap-3 border border-border bg-surface text-left text-sm transition hover:border-brand/50 hover:bg-subtle focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/20 ${
          compact ? "h-10 rounded-lg px-3 pointer-coarse:h-11 pointer-coarse:text-base" : "h-12 rounded-xl px-3 shadow-card pointer-coarse:text-base"
        } ${open ? "border-brand ring-3 ring-brand/20" : ""}`}
      >
        {compact ? (
          <svg aria-hidden viewBox="0 0 24 24" className="size-4 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 2v4M16 2v4M4 10h16" />
            <rect x="4" y="4" width="16" height="18" rx="2" />
          </svg>
        ) : (
          <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 2v4M16 2v4M4 10h16" />
              <rect x="4" y="4" width="16" height="18" rx="2" />
            </svg>
          </span>
        )}
        <span className="min-w-0 flex-1">
          {!compact && <span className="block text-[0.7rem] font-semibold uppercase tracking-wide text-muted">Date range</span>}
          <span className={`block truncate ${compact ? "font-medium" : "font-semibold"}`}>
            {compact && <span className="sr-only">Date range: </span>}
            {rangeLabel(from, to)}
          </span>
        </span>
        <span aria-hidden className={`flex shrink-0 items-center justify-center text-muted transition group-hover:text-foreground ${compact ? "" : "size-8 rounded-lg group-hover:bg-surface"}`}>
          <svg viewBox="0 0 24 24" className={`size-4 transition ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>

      {open && (
        <div role="dialog" aria-label="Choose date range" className={`absolute left-0 right-0 z-20 mt-2 overflow-hidden rounded-xl border border-border bg-surface shadow-card sm:w-[42rem] ${panelAlign}`}>
          <div className="grid gap-0 sm:grid-cols-[12rem_minmax(0,1fr)]">
            <div className="border-b border-border bg-subtle/50 p-3 sm:border-b-0 sm:border-r">
              <p className="px-1 text-xs font-semibold uppercase text-muted">Quick ranges</p>
              <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-1">
                {presets.map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPreset(id)}
                    className="rounded-lg px-3 py-2 text-left text-sm font-medium transition hover:bg-surface"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-3">
              <div className="flex items-center justify-between gap-3">
                <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} className="flex size-9 items-center justify-center rounded-lg text-muted hover:bg-subtle hover:text-foreground" aria-label="Previous month">
                  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="m15 18-6-6 6-6" />
                  </svg>
                </button>
                <p className="font-semibold">{monthLabel(month)}</p>
                <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} className="flex size-9 items-center justify-center rounded-lg text-muted hover:bg-subtle hover:text-foreground" aria-label="Next month">
                  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
              </div>

              <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-1">
                {Array.from({ length: offset }).map((_, index) => <span key={`blank-${index}`} />)}
                {days.map((day) => {
                  const selected = day === draftFrom || day === draftTo;
                  const ranged = draftFrom && draftTo && day > draftFrom && day < draftTo;
                  return (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={selected}
                      aria-label={dateLabel(day)}
                      onClick={() => pick(day)}
                      className={`h-9 rounded-lg text-sm font-medium transition ${
                        selected
                          ? "bg-brand text-brand-foreground"
                          : ranged
                            ? "bg-brand-soft text-brand"
                            : day === today
                              ? "bg-subtle text-foreground"
                              : "hover:bg-subtle"
                      }`}
                    >
                      {Number(day.slice(-2))}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted">{rangeLabel(draftFrom, draftTo)}</p>
                <div className="grid grid-cols-2 gap-2 sm:flex">
                  <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button onClick={apply} disabled={!canApply}>Apply</Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
