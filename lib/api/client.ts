import "server-only";

import {
  NETWORK_ERROR_MESSAGE,
  failure,
  toResult,
  type ApiResult,
} from "./envelope";
import type { ApiEnvelope } from "./types";

export type { ApiFailure, ApiResult, ApiSuccess } from "./envelope";

const DEFAULT_DEV_API_BASE_URL = "http://localhost:8000";

function apiBaseUrl(): string {
  const base =
    process.env.API_BASE_URL ??
    (process.env.NODE_ENV === "production" ? undefined : DEFAULT_DEV_API_BASE_URL);
  if (!base) {
    throw new Error("API_BASE_URL is not set. See .env.example.");
  }
  return `${base.replace(/\/+$/, "")}/api/v1`;
}

type Method = "GET" | "POST" | "PATCH" | "DELETE";

interface RequestOptions {
  method?: Method;
  /** Already-serialised JSON body. */
  rawBody?: string;
  body?: unknown;
  /** Access token to send as a Bearer credential. */
  token?: string;
}

async function send(path: string, { method = "POST", body, rawBody, token }: RequestOptions) {
  const payload = rawBody ?? (body !== undefined ? JSON.stringify(body) : undefined);
  return fetch(`${apiBaseUrl()}${path}`, {
    method,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(payload !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: payload,
  });
}

/**
 * Calls the EV Muvment API and unwraps its response envelope. HTTP-level
 * failures are returned, not thrown, so callers can branch on `status`.
 */
export async function apiRequest<T = null>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await send(path, options);
  } catch {
    return failure(0, NETWORK_ERROR_MESSAGE);
  }

  let envelope: ApiEnvelope<T> | null = null;
  try {
    envelope = (await res.json()) as ApiEnvelope<T>;
  } catch {
    // Non-JSON body, e.g. an HTML error page from a gateway.
  }
  return toResult(res.status, res.ok, envelope);
}

/**
 * Forwards a request untouched and returns the raw status and body. Used by
 * the browser-facing BFF route (app/api/proxy), which passes the API's own
 * envelope through so the browser fetcher can interpret it.
 */
export async function forwardToApi(
  path: string,
  options: RequestOptions,
): Promise<{ status: number; body: string }> {
  try {
    const res = await send(path, options);
    return { status: res.status, body: await res.text() };
  } catch {
    return {
      status: 502,
      body: JSON.stringify({
        status: "error",
        message: NETWORK_ERROR_MESSAGE,
        data: null,
        error: { code: "BAD_GATEWAY", details: null },
      }),
    };
  }
}
