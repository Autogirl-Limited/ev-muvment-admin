import { apiFetch } from "@/lib/api/browser";
import { toQuery } from "@/lib/api/configuration";
import type { Paginated } from "@/lib/api/staff";

export type AllocationType = "PAID_TOPUP" | "FREE_GRANT";
export type AllocationStatus = "PENDING_PAYMENT" | "AWAITING_ALLOCATION" | "COMPLETED" | "CANCELLED" | "EXPIRED";

export interface WalletAllocation {
  id: string;
  created_at: string;
  updated_at: string;
  user_id: string;
  type: AllocationType;
  status: AllocationStatus;
  amount: number;
  rate_per_kwh: number;
  kwh_equivalent: number;
  checkout_transaction_reference: string | null;
  checkout_account_number: string | null;
  checkout_account_name: string | null;
  checkout_bank_name: string | null;
  checkout_bank_code: string | null;
  checkout_expires_at: string | null;
  payment_reference: string | null;
  paid_at: string | null;
  recorded_by: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  notes: string | null;
}

export interface WalletStats {
  total_credited: number;
  total_free_grants: number;
  total_paid_topups: number;
  pending_amount: number;
  total_kwh_allocated: number;
  completed_count: number;
  pending_count: number;
  cancelled_count: number;
  expired_count: number;
  total_count: number;
  unique_drivers: number;
  average_topup_amount: number;
}

export interface ListWalletAllocationsParams {
  page: number;
  page_size: number;
  status?: AllocationStatus;
  type?: AllocationType;
  userId?: string;
}

export function listWalletAllocations(params: ListWalletAllocationsParams, signal?: AbortSignal) {
  return apiFetch<Paginated<WalletAllocation>>(`/wallet-allocations${toQuery({ ...params })}`, { signal });
}

export function getWalletAllocation(id: string, signal?: AbortSignal) {
  return apiFetch<WalletAllocation>(`/wallet-allocations/${id}`, { signal });
}

export function getWalletStats(params: { dateFrom?: string; dateTo?: string }, signal?: AbortSignal) {
  return apiFetch<WalletStats>(`/wallet-allocations/stats${toQuery(params)}`, { signal });
}

export function recordFreeGrant(input: { user_id: string; amount: number; notes?: string }) {
  return apiFetch<WalletAllocation>("/wallet-allocations/free-grants", {
    method: "POST",
    body: {
      user_id: input.user_id,
      amount: input.amount,
      ...(input.notes ? { notes: input.notes } : {}),
    },
  });
}

export function confirmWalletAllocation(id: string) {
  return apiFetch<WalletAllocation>(`/wallet-allocations/${id}/confirm-allocation`, { method: "POST" });
}

export function getTopupPreview(amount: number, signal?: AbortSignal) {
  return apiFetch<{ amount: number; rate_per_kwh: number; kwh_equivalent: number }>(
    `/wallet-allocations/topup-preview${toQuery({ amount })}`,
    { signal },
  );
}
