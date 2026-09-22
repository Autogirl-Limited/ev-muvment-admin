import { apiFetch } from "@/lib/api/browser";
import { toQuery } from "@/lib/api/configuration";

export type DashboardInterval = "day" | "week" | "month";

export interface DashboardRange {
  dateFrom?: string;
  dateTo?: string;
}

export interface Overview {
  drivers: { total: number; active: number; on_shift: number };
  vehicles: { total: number; assigned: number; unassigned: number };
  pending_applications: number;
  awaiting_allocation: number;
  checklists_needing_review: number;
  review_window_days: number;
  current_rate_per_kwh: number | null;
}

export interface Metric {
  key: string;
  label: string;
  unit: "NGN" | "kWh";
  value: number;
  previous_value: number;
  change_percent: number | null;
}

export interface FinancialSummary {
  date_from: string;
  date_to: string;
  previous_date_from: string;
  previous_date_to: string;
  metrics: Metric[];
}

export interface AttentionItem {
  key: string;
  label: string;
  count: number;
  oldest_at: string | null;
  list_endpoint: string;
}

export interface NeedsAttention {
  total_count: number;
  items: AttentionItem[];
}

export interface PieSlice {
  key: string;
  label: string;
  value: number;
  percentage: number;
  amount: number | null;
}

export interface PieChart {
  total: number;
  slices: PieSlice[];
  date_from?: string | null;
  date_to?: string | null;
}

export interface Series {
  key: string;
  label: string;
  unit: "NGN" | "kWh" | string;
  total: number;
  data: number[];
}

export interface TimeSeries {
  interval: DashboardInterval;
  date_from: string;
  date_to: string;
  utc_offset_hours: number;
  points: string[];
  series: Series[];
}

const BASE = "/admin/dashboard";

export function getDashboardOverview(signal?: AbortSignal) {
  return apiFetch<Overview>(`${BASE}/overview`, { signal });
}

export function getFinancialSummary(range: DashboardRange, signal?: AbortSignal) {
  return apiFetch<FinancialSummary>(`${BASE}/financial-summary${toQuery({ ...range })}`, { signal });
}

export function getNeedsAttention(signal?: AbortSignal) {
  return apiFetch<NeedsAttention>(`${BASE}/needs-attention`, { signal });
}

export function getAllocationsByStatus(range: DashboardRange, signal?: AbortSignal) {
  return apiFetch<PieChart>(`${BASE}/charts/allocations-by-status${toQuery({ ...range })}`, { signal });
}

export function getVehicleCondition(signal?: AbortSignal) {
  return apiFetch<PieChart>(`${BASE}/charts/vehicle-condition`, { signal });
}

export function getMoneyTrend(params: DashboardRange & { interval: DashboardInterval }, signal?: AbortSignal) {
  return apiFetch<TimeSeries>(`${BASE}/trends/money${toQuery({ ...params })}`, { signal });
}
