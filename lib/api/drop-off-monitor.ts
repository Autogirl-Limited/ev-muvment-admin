import { apiFetch } from "@/lib/api/browser";
import type { NamedRef } from "@/lib/api/configuration";

/**
 * Staff dashboard of vehicles pending today's drop-off, most-urgent first.
 * Not cached, no pagination (a bare array). Automatic due-soon/overdue
 * notifications for this feature ride the generic notification pipeline —
 * there's nothing else to call here.
 * See ev-muvment-api/docs/2026/09/22/drop-off-monitor-api.md.
 */

export type ChecklistPhaseStatus = "IN_PROGRESS" | null;
export type DropOffStatus = "UPCOMING" | "DUE_SOON" | "OVERDUE";

export interface PendingDropOffVehicle extends NamedRef {
  plate_number: string;
  location_state: string;
  state: NamedRef | null;
  vehicle_type: NamedRef;
  vehicle_make: NamedRef;
  vehicle_model: NamedRef;
}

export interface PendingDropOffDriver {
  id: string;
  first_name: string;
  last_name: string;
  username: string;
  phone_number: string | null;
}

export interface PendingDropOff {
  vehicle: PendingDropOffVehicle;
  driver: PendingDropOffDriver;
  checklist_status: ChecklistPhaseStatus;
  /** ISO 8601 with a timezone offset. */
  due_at: string;
  /** Negative once overdue. */
  minutes_to_due: number;
  status: DropOffStatus;
}

export function listPendingDropOffs(signal?: AbortSignal) {
  return apiFetch<PendingDropOff[]>("/daily-checklists/pending-drop-offs", { signal });
}
