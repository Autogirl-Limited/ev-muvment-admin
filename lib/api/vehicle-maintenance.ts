import { apiFetch } from "@/lib/api/browser";
import { toQuery } from "@/lib/api/configuration";
import type { Paginated } from "@/lib/api/staff";

export type MaintenanceType =
  | "ROUTINE_SERVICE"
  | "TYRES"
  | "BRAKES"
  | "BATTERY"
  | "ELECTRICAL"
  | "BODY_REPAIR"
  | "INSPECTION"
  | "OTHER";

export interface MaintenanceReceipt {
  file_name: string;
  content_type: string;
  size_bytes: number;
  download_url: string;
}

export interface MaintenanceRecord {
  id: string;
  vehicle_id: string;
  maintenance_type: MaintenanceType;
  work_performed: string;
  completed_on: string;
  service_provider: string | null;
  cost_amount: string | number | null;
  currency: string | null;
  parts_replaced: string | null;
  notes: string | null;
  next_service_date: string | null;
  receipt: MaintenanceReceipt | null;
  recorded_by: string | null;
  updated_by: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReceiptInput {
  object_key: string;
  file_name: string;
  content_type: string;
}

export interface MaintenanceRecordInput {
  maintenance_type: MaintenanceType;
  work_performed: string;
  completed_on: string;
  service_provider?: string | null;
  cost_amount?: number | null;
  currency?: "NGN" | null;
  parts_replaced?: string | null;
  notes?: string | null;
  next_service_date?: string | null;
  receipt?: ReceiptInput | null;
}

interface ReceiptUploadUrl extends ReceiptInput {
  upload_url: string;
  method: "PUT";
  headers: Record<string, string>;
  expires_at: string;
  max_size_bytes: number;
}

export function listMaintenanceRecords(vehicleId: string, page: number, signal?: AbortSignal) {
  return apiFetch<Paginated<MaintenanceRecord>>(
    `/vehicles/${vehicleId}/maintenance-records${toQuery({ page, page_size: 10 })}`,
    { signal },
  );
}

export function createMaintenanceRecord(vehicleId: string, input: MaintenanceRecordInput) {
  return apiFetch<MaintenanceRecord>(`/vehicles/${vehicleId}/maintenance-records`, {
    method: "POST",
    body: input,
  });
}

export function updateMaintenanceRecord(
  vehicleId: string,
  recordId: string,
  input: Partial<MaintenanceRecordInput>,
) {
  return apiFetch<MaintenanceRecord>(`/vehicles/${vehicleId}/maintenance-records/${recordId}`, {
    method: "PATCH",
    body: input,
  });
}

export function voidMaintenanceRecord(vehicleId: string, recordId: string, reason: string) {
  return apiFetch<MaintenanceRecord>(`/vehicles/${vehicleId}/maintenance-records/${recordId}/void`, {
    method: "POST",
    body: { reason: reason.trim() },
  });
}

export async function uploadMaintenanceReceipt(vehicleId: string, file: File): Promise<ReceiptInput> {
  const upload = await apiFetch<ReceiptUploadUrl>(
    `/vehicles/${vehicleId}/maintenance-records/receipt-uploads`,
    { method: "POST", body: { file_name: file.name, content_type: file.type } },
  );
  if (file.size > upload.max_size_bytes) {
    throw new Error(`Receipt must be smaller than ${Math.round(upload.max_size_bytes / 1024 / 1024)} MB.`);
  }
  const response = await fetch(upload.upload_url, {
    method: upload.method,
    headers: upload.headers,
    body: file,
  });
  if (!response.ok) throw new Error("The receipt could not be uploaded. Please try again.");
  return {
    object_key: upload.object_key,
    file_name: upload.file_name,
    content_type: upload.content_type,
  };
}
