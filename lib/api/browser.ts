import {
  NETWORK_ERROR_MESSAGE,
  failure,
  toResult,
  type ApiFailure,
} from "./envelope";
import type { ApiEnvelope } from "./types";

/** Thrown by `apiFetch` for any non-success response. TanStack Query surfaces it as `error`. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly fieldErrors: Record<string, string>;

  constructor(result: ApiFailure) {
    super(result.message);
    this.name = "ApiError";
    this.status = result.status;
    this.code = result.code;
    this.fieldErrors = result.fieldErrors;
  }

  /** Worth retrying: the API was unreachable or had a server fault. */
  get isTransient(): boolean {
    return this.status === 0 || this.status >= 500;
  }
}

const PROXY_PREFIX = "/api/proxy";

let redirecting = false;
function endSessionInBrowser(): Promise<never> {
  if (!redirecting) {
    redirecting = true;
    // A full navigation on purpose: it also drops the in-memory query cache, and
    // the proxy clears the dead cookies when it sees this reason on /login.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login?reason=expired");
  }
  // The page is leaving; never settle so no error UI flashes first.
  return new Promise<never>(() => {});
}

interface FetchOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
}

/**
 * Browser-side call to the EV Muvment API, via the same-origin gateway at
 * /api/proxy (which adds the httpOnly access token). Returns the unwrapped
 * `data`, or throws `ApiError`. Use it as a TanStack Query `queryFn` /
 * `mutationFn`. Auth endpoints (/auth/*) are not reachable here by design.
 */
export async function apiFetch<T>(path: string, { method = "GET", body, signal }: FetchOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${PROXY_PREFIX}${path}`, {
      method,
      signal,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(failure(0, NETWORK_ERROR_MESSAGE));
  }

  let envelope: ApiEnvelope<T> | null = null;
  try {
    envelope = (await res.json()) as ApiEnvelope<T>;
  } catch {}

  const result = toResult(res.status, res.ok, envelope);
  if (result.ok) return result.data;

  // 401 means the session is over. A 403 is a role mismatch and must NOT log out.
  if (result.status === 401) return endSessionInBrowser();
  throw new ApiError(result);
}
