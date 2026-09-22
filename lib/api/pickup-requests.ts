import { apiFetch } from "@/lib/api/browser";
import { toQuery } from "@/lib/api/configuration";
import type { Paginated } from "@/lib/api/staff";

/**
 * Driver-initiated "I'm running late" pick-up requests. Driver-only to create
 * (mobile app); Admin-only to approve/reject; every staff role can list/view.
 * Approving automatically applies the window as a one-day schedule override.
 * See ev-muvment-api/docs/2026/09/22/pickup-requests-api.md.
 */

export type PickupRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface PickupRequestVehicleRef {
  id: string;
  name: string;
  plate_number: string;
}

export interface PickupRequest {
  id: string;
  created_at: string;
  updated_at: string;
  vehicle: PickupRequestVehicleRef;
  driver_id: string;
  requested_date: string;
  requested_start_time: string;
  requested_end_time: string;
  reason: string;
  status: PickupRequestStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
}

export interface ListPickupRequestsParams {
  page?: number;
  page_size?: number;
  status?: PickupRequestStatus;
  vehicleId?: string;
  driverId?: string;
}

export interface ApprovePickupRequestInput {
  start_time?: string;
  end_time?: string;
  notes?: string;
}

export function listPickupRequests(params: ListPickupRequestsParams, signal?: AbortSignal) {
  return apiFetch<Paginated<PickupRequest>>(`/pickup-requests${toQuery({ ...params })}`, { signal });
}

export function getPickupRequest(id: string, signal?: AbortSignal) {
  return apiFetch<PickupRequest>(`/pickup-requests/${id}`, { signal });
}

export function approvePickupRequest(id: string, input: ApprovePickupRequestInput = {}) {
  const notes = input.notes?.trim();
  const body: Record<string, unknown> = {};
  if (input.start_time && input.end_time) {
    body.start_time = input.start_time;
    body.end_time = input.end_time;
  }
  if (notes) body.notes = notes;
  return apiFetch<PickupRequest>(`/pickup-requests/${id}/approve`, { method: "POST", body });
}

export function rejectPickupRequest(id: string, notes?: string) {
  const trimmed = notes?.trim();
  return apiFetch<PickupRequest>(`/pickup-requests/${id}/reject`, { method: "POST", body: trimmed ? { notes: trimmed } : {} });
}
