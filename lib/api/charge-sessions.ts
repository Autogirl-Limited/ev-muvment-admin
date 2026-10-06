import { apiFetch } from "@/lib/api/browser";
import { toQuery } from "@/lib/api/configuration";
import type { Paginated } from "@/lib/api/staff";

export interface ChargeSessionDriver {
  id: string;
  first_name: string;
  last_name: string;
  phone_number: string | null;
  email: string | null;
}

/**
 * Outcome of a session (2026-09-25). `STARTED` until LotGrids reports back by
 * webhook, then `COMPLETED` (dispensed in full) or `INTERRUPTED` (stopped early,
 * the undispensed part refunded to the driver's wallet).
 */
export type ChargeSessionStatus = "STARTED" | "COMPLETED" | "INTERRUPTED";

export interface ChargeSession {
  id: string;
  created_at: string;
  updated_at: string;
  user_id: string;
  /**
   * The driver who started the session (2026-09-22). Populated on the admin
   * list and get-by-id; always `null` on `/charge-sessions/mine`, and also
   * `null` if the driver's account has since been deleted.
   */
  driver: ChargeSessionDriver | null;
  lotgrids_session_id: string;
  charger_id: string;
  connector_id: string;
  amount: number;
  /** Computed by this API from the pre-debit balance minus `amount`, not passed through from LotGrids. */
  remaining_balance: number;
  status: ChargeSessionStatus;
  /** Naira worth of energy the charger actually dispensed; `null` while STARTED. */
  actual_dispensed_value: number | null;
  /** Naira refunded to the driver's wallet; `null` while STARTED, 0 when COMPLETED. */
  refund_amount: number | null;
  /** When LotGrids reported the session ended; `null` while STARTED. */
  ended_at: string | null;
  /** Priced energy implied by the net spend (`amount - refund_amount`) at the rate in force at `created_at`; `null` for sessions before any rate existed. */
  energy_kwh: number | null;
}

export interface ChargeSessionStats {
  user_id: string | null;
  date_from: string | null;
  date_to: string | null;
  /** Net of interrupted-session refunds. */
  total_amount: number;
  session_count: number;
  unique_drivers: number;
  /** Average net amount per session. */
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

/** What the driver actually paid: the debit less any refund. */
export function netAmount(session: ChargeSession) {
  return session.amount - (session.refund_amount ?? 0);
}
