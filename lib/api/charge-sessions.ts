import { apiFetch } from "@/lib/api/browser";
import { toQuery } from "@/lib/api/configuration";
import type { Paginated } from "@/lib/api/staff";

export interface ChargeSession {
  id: string;
  created_at: string;
  updated_at: string;
  user_id: string;
  lotgrids_session_id: string;
  charger_id: string;
  connector_id: string;
  amount: number;
  remaining_balance: number;
}

export interface ChargeSessionStats {
  user_id: string | null;
  date_from: string | null;
  date_to: string | null;
  total_amount: number;
  session_count: number;
  unique_drivers: number;
  average_amount: number;
}

export interface ListChargeSessionsParams {
  page: number;
  page_size: number;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export type ChargeSessionStatsParams = {
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
};

export function listChargeSessions(params: ListChargeSessionsParams, signal?: AbortSignal) {
  return apiFetch<Paginated<ChargeSession>>(`/charge-sessions${toQuery({ ...params })}`, { signal });
}

export function getChargeSession(id: string, signal?: AbortSignal) {
  return apiFetch<ChargeSession>(`/charge-sessions/${id}`, { signal });
}

export function getChargeSessionStats(params: ChargeSessionStatsParams, signal?: AbortSignal) {
  return apiFetch<ChargeSessionStats>(`/charge-sessions/stats${toQuery(params)}`, { signal });
}
