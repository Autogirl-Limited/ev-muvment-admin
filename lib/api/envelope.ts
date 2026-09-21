import type { ApiEnvelope } from "./types";

/** Shared by the server client (lib/api/client.ts) and the browser fetcher (lib/api/browser.ts). */

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

export const NETWORK_ERROR_MESSAGE =
  "We couldn't reach the server. Check your connection and try again.";
export const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

export function failure(status: number, message: string): ApiFailure {
  return { ok: false, status, message, code: null, fieldErrors: {} };
}

/** Turns an HTTP status plus the (possibly missing) JSON envelope into a result. */
export function toResult<T>(
  status: number,
  ok: boolean,
  envelope: ApiEnvelope<T> | null,
): ApiResult<T> {
  if (ok && envelope?.status === "success") {
    return { ok: true, status, message: envelope.message, data: envelope.data as T };
  }

  const fieldErrors: Record<string, string> = {};
  for (const detail of envelope?.error?.details ?? []) {
    // Pydantic locations can arrive prefixed ("body.identifier").
    const field = detail.field.split(".").pop() ?? detail.field;
    fieldErrors[field] ??= detail.issue;
  }

  // Server-side faults carry internal wording; keep the UI message generic.
  const message = status >= 500 || !envelope?.message ? GENERIC_ERROR_MESSAGE : envelope.message;

  return {
    ok: false,
    status,
    message,
    code: envelope?.error?.code ?? null,
    fieldErrors,
  };
}
