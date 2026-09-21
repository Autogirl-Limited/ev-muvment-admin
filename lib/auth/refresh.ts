import { apiRequest } from "@/lib/api/client";
import type { LoginResponse } from "@/lib/api/types";

export type RefreshResult =
  | { ok: true; data: LoginResponse }
  /** The refresh token is rejected: the session is over. */
  | { ok: false; reason: "invalid" }
  /** The API couldn't be reached or errored: the session may still be fine. */
  | { ok: false; reason: "unavailable" };

/**
 * Refresh tokens are single-use: the API revokes the one presented and issues
 * a new pair. If two requests (page load plus prefetches, several tabs) refresh
 * with the same token at once, the loser is rejected and the user gets signed
 * out. So concurrent callers share one in-flight request, and the outcome is
 * kept briefly so requests that still carry the old cookie get the same new
 * pair instead of racing a second refresh.
 */
const REUSE_WINDOW_MS = 60_000;
const inflight = new Map<string, Promise<RefreshResult>>();

export function refreshTokens(refreshToken: string): Promise<RefreshResult> {
  const existing = inflight.get(refreshToken);
  if (existing) return existing;

  const promise = callRefresh(refreshToken).then((result) => {
    if (result.ok || result.reason === "invalid") {
      setTimeout(() => inflight.delete(refreshToken), REUSE_WINDOW_MS).unref?.();
    } else {
      // Transient failure: let the next request try again straight away.
      inflight.delete(refreshToken);
    }
    return result;
  });
  inflight.set(refreshToken, promise);
  return promise;
}

async function callRefresh(refreshToken: string): Promise<RefreshResult> {
  const res = await apiRequest<LoginResponse>("/auth/refresh", {
    body: { refresh_token: refreshToken },
  });
  if (res.ok) {
    return res.data.access_token && res.data.refresh_token
      ? { ok: true, data: res.data }
      : { ok: false, reason: "unavailable" };
  }
  return { ok: false, reason: res.status === 401 ? "invalid" : "unavailable" };
}
