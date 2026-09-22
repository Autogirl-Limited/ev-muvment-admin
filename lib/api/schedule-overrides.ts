import { apiFetch } from "@/lib/api/browser";
import { toQuery } from "@/lib/api/configuration";

/**
 * A one-day-only pick-up/drop-off window change for a single vehicle — the
 * "just this once" sibling of the standing per-vehicle checklist override.
 * Admin only to write; every staff role can read.
 * See ev-muvment-api/docs/2026/09/22/vehicle-schedule-overrides-api.md.
 */

export type ChecklistPhase = "PICK_UP" | "DROP_OFF";

export interface ScheduleOverride {
  id: string;
  created_at: string;
  updated_at: string;
  vehicle_id: string;
  /** "YYYY-MM-DD" */
  override_date: string;
  phase: ChecklistPhase;
  /** "HH:MM:SS" */
  start_time: string;
  end_time: string;
  reason: string | null;
  created_by: string | null;
}

export interface CreateScheduleOverrideRequest {
  override_date: string;
  phase: ChecklistPhase;
  start_time: string;
  end_time: string;
  reason?: string;
}

export function listScheduleOverrides(vehicleId: string, params: { dateFrom?: string; dateTo?: string } = {}, signal?: AbortSignal) {
  // Bare array response, not the usual { items, pagination } envelope.
  return apiFetch<ScheduleOverride[]>(`/vehicles/${vehicleId}/schedule-overrides${toQuery(params)}`, { signal });
}

export function createScheduleOverride(vehicleId: string, input: CreateScheduleOverrideRequest) {
  const reason = input.reason?.trim();
  return apiFetch<ScheduleOverride>(`/vehicles/${vehicleId}/schedule-overrides`, {
    method: "POST",
    body: { ...input, ...(reason ? { reason } : {}) },
  });
}

export function cancelScheduleOverride(vehicleId: string, overrideId: string) {
  return apiFetch<null>(`/vehicles/${vehicleId}/schedule-overrides/${overrideId}`, { method: "DELETE" });
}
