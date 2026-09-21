import "server-only";

import type { ApiEnvelope } from "./types";

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

export interface ApiSuccess<T> {
  ok: true;
  status: number;
  message: string;
  data: T;
}

export interface ApiFailure {
  ok: false;
  /** HTTP status, or 0 when the API could not be reached. */
  status: number;
  message: string;
  code: string | null;
  /** Field-level messages from a 422, keyed by field name. */
  fieldErrors: Record<string, string>;
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

const NETWORK_ERROR_MESSAGE =
  "We couldn't reach the server. Check your connection and try again.";
const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Access token to send as a Bearer credential. */
  token?: string;
}

/**
 * Calls the EV Muvment API and unwraps its response envelope. HTTP-level
 * failures are returned, not thrown, so callers can branch on `status`.
 */
export async function apiRequest<T = null>(
  path: string,
  { method = "POST", body, token }: RequestOptions = {},
): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl()}${path}`, {
      method,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    return failure(0, NETWORK_ERROR_MESSAGE);
  }

  let envelope: ApiEnvelope<T> | null = null;
  try {
    envelope = (await res.json()) as ApiEnvelope<T>;
  } catch {
    // Non-JSON body, e.g. an HTML error page from a gateway.
  }

  if (res.ok && envelope?.status === "success") {
    return {
      ok: true,
      status: res.status,
      message: envelope.message,
      data: envelope.data as T,
    };
  }

  const fieldErrors: Record<string, string> = {};
  for (const detail of envelope?.error?.details ?? []) {
    // Pydantic locations can arrive prefixed ("body.identifier").
    const field = detail.field.split(".").pop() ?? detail.field;
    fieldErrors[field] ??= detail.issue;
  }

  // Server-side faults carry internal wording; keep the UI message generic.
  const message =
    res.status >= 500 || !envelope?.message ? GENERIC_ERROR_MESSAGE : envelope.message;

  return {
    ok: false,
    status: res.status,
    message,
    code: envelope?.error?.code ?? null,
    fieldErrors,
  };
}

function failure(status: number, message: string): ApiFailure {
  return { ok: false, status, message, code: null, fieldErrors: {} };
}
