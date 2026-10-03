import { ApiError, apiFetch } from "@/lib/api/browser";
import { failure, NETWORK_ERROR_MESSAGE } from "@/lib/api/envelope";
import type { Paginated } from "@/lib/api/staff";

/** Bolt "Earnings per driver" exports reconciled against each driver's DVA inflow. */

export type EntryStatus = "SHORT" | "UNMATCHED" | "OVER" | "NOT_IN_REPORT" | "DUPLICATE" | "BALANCED" | "NO_CASH";
export type MatchMethod = "EMAIL" | "LOTGRIDS_EMAIL" | "PHONE" | "MANUAL" | "NONE" | "DVA";

/** Worst first, the order the API sorts entries in. */
export const ENTRY_STATUSES: EntryStatus[] = ["SHORT", "UNMATCHED", "OVER", "NOT_IN_REPORT", "DUPLICATE", "BALANCED", "NO_CASH"];

export interface PersonRef {
  id: string;
  first_name: string;
  last_name: string;
  username: string;
  email: string | null;
  phone_number: string | null;
}

export interface ReconciliationSummary {
  report_rows: number;
  matched_rows: number;
  unmatched_rows: number;
  balanced_count: number;
  short_count: number;
  over_count: number;
  no_cash_count: number;
  duplicate_count: number;
  not_in_report_count: number;
  total_collected_cash: number;
  matched_collected_cash: number;
  unmatched_collected_cash: number;
  total_dva_received: number;
  /** Positive number: money missing across SHORT drivers. */
  total_shortfall: number;
  total_overage: number;
  net_variance: number;
  not_in_report_dva_amount: number;
}

export interface Reconciliation {
  id: string;
  created_at: string;
  updated_at: string;
  period_start: string;
  period_end: string;
  file: { file_name: string; file_format: "CSV" | "XLSX"; content_type: string; size_bytes: number };
  notes: string | null;
  /** `null` if that account has since been deleted. */
  uploaded_by: PersonRef | null;
  reconciled_at: string;
  summary: ReconciliationSummary;
}

export interface BoltRow {
  driver_name: string | null;
  email: string | null;
  phone: string | null;
  gross_earnings_total: number | null;
  gross_earnings_in_app: number | null;
  gross_earnings_cash: number | null;
  collected_cash: number;
  rider_tips: number | null;
  campaign_earnings: number | null;
  expense_reimbursements: number | null;
  cancellation_fees: number | null;
  toll_fees: number | null;
  booking_fees: number | null;
  total_fees: number | null;
  commission_fees: number | null;
  refunds_to_riders: number | null;
  other_fees: number | null;
  net_earnings: number | null;
  projected_payout: number | null;
  gross_earnings_per_hour: number | null;
  net_earnings_per_hour: number | null;
  commission_discount_in_app: number | null;
  commission_discount_cash: number | null;
  bolt_driver_id: string | null;
  bolt_individual_id: string | null;
  tier: string | null;
  active_categories: string | null;
  cash_rides_enabled: boolean | null;
  driver_score: number | null;
  finished_rides: number | null;
  total_acceptance_rate: number | null;
  effective_acceptance_rate: number | null;
  online_time_minutes: number | null;
  utilisation: number | null;
  finish_rate_all_rides: number | null;
  finish_rate_accepted_rides: number | null;
  average_ride_distance_km: number | null;
  total_ride_distance_km: number | null;
  average_driver_rating: number | null;
}

export interface ReconciliationEntry {
  id: string;
  created_at: string;
  updated_at: string;
  reconciliation_id: string;
  /** Line in the uploaded file; `null` for NOT_IN_REPORT. */
  row_number: number | null;
  status: EntryStatus;
  match_method: MatchMethod;
  driver: PersonRef | null;
  collected_cash: number;
  dva_amount: number;
  dva_transaction_count: number;
  /** `dva_amount - collected_cash`; negative = short. `null` for UNMATCHED, DUPLICATE and NOT_IN_REPORT. */
  variance: number | null;
  bolt: BoltRow;
  raw_row: Record<string, unknown> | null;
}

export interface UploadTicket {
  object_key: string;
  file_name: string;
  upload_url: string;
  method: "PUT";
  headers: Record<string, string>;
  expires_at: string;
  max_size_bytes: number;
}

export interface CreateReconciliationInput {
  object_key: string;
  file_name: string;
  period_start?: string;
  period_end?: string;
  notes?: string;
  replace_existing?: boolean;
}

export interface ListReconciliationsParams {
  page: number;
  page_size: number;
  dateFrom?: string;
  dateTo?: string;
}

export interface ListEntriesParams {
  page: number;
  page_size: number;
  status?: EntryStatus[];
  userId?: string;
  searchTerm?: string;
}

/** Like `toQuery`, but array values become repeated keys (`?status=SHORT&status=OVER`). */
function query(params: Record<string, string | number | string[] | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) value.forEach((item) => search.append(key, item));
    else if (value !== undefined && value !== "") search.set(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : "";
}

export function requestReportUpload(fileName: string) {
  return apiFetch<UploadTicket>("/bolt-reconciliations/uploads", { method: "POST", body: { file_name: fileName } });
}

/**
 * Step 2: PUT the raw file straight to S3. XHR rather than fetch so we can
 * report upload progress. The signed headers must be sent exactly; the
 * browser's own `file.type` for CSV is often wrong and would break the signature.
 */
export function uploadReportFile(ticket: UploadTicket, file: File, onProgress?: (fraction: number) => void, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(ticket.method || "PUT", ticket.upload_url);
    Object.entries(ticket.headers).forEach(([name, value]) => xhr.setRequestHeader(name, value));
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new ApiError(failure(xhr.status, "The file couldn't be uploaded to storage. Please try again.")));
    };
    xhr.onerror = () => reject(new ApiError(failure(0, NETWORK_ERROR_MESSAGE)));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

export function createReconciliation(input: CreateReconciliationInput) {
  return apiFetch<Reconciliation>("/bolt-reconciliations", { method: "POST", body: input });
}

export function listReconciliations(params: ListReconciliationsParams, signal?: AbortSignal) {
  return apiFetch<Paginated<Reconciliation>>(`/bolt-reconciliations${query({ ...params })}`, { signal });
}

export function getReconciliation(id: string, signal?: AbortSignal) {
  return apiFetch<Reconciliation>(`/bolt-reconciliations/${id}`, { signal });
}

export function listReconciliationEntries(id: string, params: ListEntriesParams, signal?: AbortSignal) {
  return apiFetch<Paginated<ReconciliationEntry>>(`/bolt-reconciliations/${id}/entries${query({ ...params })}`, { signal });
}

export function getReportDownload(id: string) {
  return apiFetch<{ file_name: string; url: string }>(`/bolt-reconciliations/${id}/download`);
}

export function rerunReconciliation(id: string) {
  return apiFetch<Reconciliation>(`/bolt-reconciliations/${id}/rerun`, { method: "POST" });
}

/** `userId = null` drops a manual link and goes back to automatic matching. The API re-runs the report. */
export function linkReconciliationEntry(id: string, entryId: string, userId: string | null) {
  return apiFetch<ReconciliationEntry>(`/bolt-reconciliations/${id}/entries/${entryId}`, {
    method: "PATCH",
    body: { user_id: userId },
  });
}

export function deleteReconciliation(id: string) {
  return apiFetch<null>(`/bolt-reconciliations/${id}`, { method: "DELETE" });
}

// ---------------------------------------------------------------- file checks

export const REPORT_MAX_BYTES = 10 * 1024 * 1024;
/** Same cap the API enforces on `period_end - period_start`. */
export const MAX_PERIOD_DAYS = 31;

/** `null` when the file looks uploadable, otherwise what to tell the admin. */
export function reportFileProblem(file: File, maxBytes = REPORT_MAX_BYTES): string | null {
  const extension = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
  if (extension === "xls") return "Old Excel (.xls) files can't be read. Open it in Excel and save it as .xlsx, or export a CSV from Bolt.";
  if (extension !== "csv" && extension !== "xlsx") return "Choose Bolt's \"Earnings per driver\" export as a .csv or .xlsx file.";
  if (file.size === 0) return "This file is empty.";
  if (file.size > maxBytes) return `This file is ${formatBytes(file.size)}. The limit is ${formatBytes(maxBytes)}.`;
  return null;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function parseBoltDay(text: string): string | null {
  const match = /^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/.exec(text.trim().replace(/\s+/g, " "));
  if (!match) return null;
  const month = MONTHS.indexOf(match[2].slice(0, 3).toLowerCase());
  const day = Number(match[1]);
  const year = Number(match[3]);
  if (month < 0) return null;
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

/**
 * The period Bolt writes into its file name ("Earnings per driver-24 Sep 2026-24 Sep 2026-...").
 * Mirrors the API's own parser, so what we prefill is what it would have picked.
 */
export function periodFromFileName(name: string): { start: string; end: string } | null {
  const match = /(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})\s*-\s*(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/.exec(name);
  if (!match) return null;
  const start = parseBoltDay(match[1]);
  const end = parseBoltDay(match[2]);
  return start && end && start <= end ? { start, end } : null;
}

export function daysBetween(start: string, end: string) {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
}
