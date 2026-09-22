import { apiFetch } from "@/lib/api/browser";
import { toQuery } from "@/lib/api/configuration";
import type { Paginated } from "@/lib/api/staff";

export type ChecklistPhase = "PICK_UP" | "DROP_OFF";
export type ChecklistStatus = "IN_PROGRESS" | "SUBMITTED";
export type AnalysisStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
export type ImageType = "FRONT" | "REAR" | "LEFT" | "RIGHT" | "DASHBOARD";
export type FlagSeverity = "INFO" | "WARNING" | "CRITICAL";

export interface ChecklistVehicle {
  id: string | null;
  name: string;
  plate_number: string;
}

export interface ChecklistDriver {
  id: string;
  first_name: string;
  last_name: string;
  username: string;
  phone_number: string | null;
}

export interface ChecklistLocationSnapshot {
  latitude: number;
  longitude: number;
  distance_meters: number | null;
  within_radius: boolean | null;
}

export interface ChecklistExpectedLocation {
  address: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
}

export interface ChecklistImage {
  image_type: ImageType;
  url: string;
  content_type: string;
  size_bytes: number;
  uploaded_at: string;
  analysis: {
    image_valid: boolean | null;
    image_issue: string | null;
    condition: "GOOD" | "NOT_GOOD" | "UNCLEAR" | null;
    issues: Array<{ type: string; severity: string; description: string }>;
  } | null;
}

export interface DashboardReading {
  is_electric?: boolean | null;
  odometer_km?: number | null;
  battery_percent?: number | null;
  range_km?: number | null;
  is_charging?: boolean | null;
  fuel_level_percent?: number | null;
  warnings?: Array<{ code: string; label: string; severity: string }> | null;
  dashboard_visible?: boolean | null;
  powertrain?: string | null;
  image_quality?: string | null;
  confidence?: number | null;
  notes?: string | null;
}

export interface ChecklistResponse {
  id: string;
  checklist_date: string;
  phase: ChecklistPhase;
  status: ChecklistStatus;
  vehicle: ChecklistVehicle;
  driver: ChecklistDriver;
  window: { start_time: string; end_time: string };
  expected_location: ChecklistExpectedLocation | null;
  started_at: string | null;
  submitted_at: string | null;
  start_location: ChecklistLocationSnapshot | null;
  submit_location: ChecklistLocationSnapshot | null;
  images: ChecklistImage[];
  missing_images: ImageType[];
  analysis: { status: AnalysisStatus; error: string | null; analyzed_at: string | null; provider: string | null; model: string | null } | null;
  dashboard: {
    ai: DashboardReading | null;
    driver_edits: DashboardReading | null;
    driver_edited_at: string | null;
    effective: DashboardReading | null;
  } | null;
  condition: { status: "GOOD" | "NOT_GOOD" | "UNCLEAR"; summary: string | null } | null;
  comparison: {
    baseline_checklist_id: string | null;
    verdict: string | null;
    new_damage: Array<{ side: string; type: string; severity: string; description: string }>;
    notes: string | null;
    dashboard_changes: Record<string, unknown> | null;
  } | null;
  flags: Array<{ code: string; severity: FlagSeverity; message: string }>;
  needs_review: boolean;
  reviewed: {
    at: string;
    by: ChecklistDriver;
    notes: string | null;
  } | null;
}

export interface ListDailyChecklistsParams {
  page?: number;
  page_size?: number;
  dateFrom?: string;
  dateTo?: string;
  phase?: ChecklistPhase;
  status?: ChecklistStatus;
  analysisStatus?: AnalysisStatus;
  vehicleId?: string;
  driverId?: string;
  needsReview?: boolean;
  reviewed?: boolean;
  searchTerm?: string;
}

export function listDailyChecklists(params: ListDailyChecklistsParams, signal?: AbortSignal) {
  return apiFetch<Paginated<ChecklistResponse>>(`/daily-checklists${toQuery({ ...params })}`, { signal });
}

export function getDailyChecklist(id: string, signal?: AbortSignal) {
  return apiFetch<ChecklistResponse>(`/daily-checklists/${id}`, { signal });
}

export function reanalyzeDailyChecklist(id: string) {
  return apiFetch<ChecklistResponse>(`/daily-checklists/${id}/reanalyze`, { method: "POST" });
}

export function reviewDailyChecklist(id: string, notes?: string | null) {
  return apiFetch<ChecklistResponse>(`/daily-checklists/${id}/review`, { method: "PATCH", body: { notes: notes || null } });
}
