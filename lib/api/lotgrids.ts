import { apiFetch } from "@/lib/api/browser";

/** Admin-only LotGrids operations (2026-10-06), under `/lotgrids`. */

export interface FleetBalance {
  fleet_id: string;
  /** Naira in the pooled fleet wallet that top-ups and free grants are distributed from. */
  wallet_balance: number;
  /** True when the server is on a LotGrids test key (`lg_test_…`): fake money, simulated chargers. */
  sandbox: boolean;
}

export interface FleetWebhook {
  webhook_url: string;
  /** Goes in the server's LOTGRIDS_WEBHOOK_SECRET. Stable per key; differs between test and live. */
  webhook_secret: string;
  /** Whether LOTGRIDS_WEBHOOK_SECRET already holds this value. Until it does, outcomes are rejected and sessions stay STARTED. */
  secret_matches_config: boolean;
}

export function getFleetBalance(signal?: AbortSignal) {
  return apiFetch<FleetBalance>("/lotgrids/fleet-balance", { signal });
}

/**
 * Points LotGrids' session-outcome webhook at this API and returns the signing
 * secret. Idempotent: the secret doesn't change. Omit `webhook_url` to use the
 * server's LOTGRIDS_WEBHOOK_URL.
 */
export function registerFleetWebhook(webhookUrl?: string) {
  return apiFetch<FleetWebhook>("/lotgrids/webhook", {
    method: "POST",
    body: webhookUrl ? { webhook_url: webhookUrl } : {},
  });
}

/** Sandbox only (403 on a live key). Sets the fleet wallet to `amount` outright; it doesn't add. */
export function setSandboxFleetBalance(amount: number) {
  return apiFetch<{ balance: number }>("/lotgrids/sandbox/fleet-balance", { method: "POST", body: { amount } });
}

/** Sandbox only (403 on a live key). Sets a driver's sub-wallet and `ev_wallet_balance` to `amount` outright. */
export function setSandboxDriverBalance(userId: string, amount: number) {
  return apiFetch<{ balance: number }>("/lotgrids/sandbox/driver-balance", {
    method: "POST",
    body: { user_id: userId, amount },
  });
}
