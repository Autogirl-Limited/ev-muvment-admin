import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

import { authSecret, NEXT_AUTH_SESSION_COOKIE, type EVAuthToken } from "@/lib/auth/next-auth-shared";

/**
 * Puts a Bolt report into object storage on the browser's behalf. The browser
 * used to PUT straight to the presigned URL, which is cross-origin and fails
 * whenever the bucket's CORS rules don't list this app's exact origin. The
 * browser now sends the file here (same origin, so XHR progress still works)
 * along with the upload ticket from POST /bolt-reconciliations/uploads, and
 * this handler does the PUT.
 *
 * Only presigned storage URLs are accepted, so this can't be used to make the
 * server call anywhere else. Outside the proxy matcher on purpose: the proxy
 * would buffer the whole body a second time. The ticket request just before
 * this one goes through /api/proxy, which keeps the session fresh.
 */

const NO_STORE = { "Cache-Control": "no-store" };
const MAX_BYTES = 10 * 1024 * 1024;
const STORAGE_HOSTS = [".r2.cloudflarestorage.com", ".amazonaws.com"];
// The only ticket headers the signature can cover for a plain PUT.
const FORWARDED_HEADERS = /^(content-type|content-disposition|cache-control|x-amz-[a-z0-9-]+)$/i;

function errorResponse(status: number, message: string, code: string) {
  return NextResponse.json({ status: "error", message, data: null, error: { code, details: null } }, { status, headers: NO_STORE });
}

function isCrossSite(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

function storageUrl(value: string | null): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && STORAGE_HOSTS.some((suffix) => url.hostname.endsWith(suffix)) ? url : null;
  } catch {
    return null;
  }
}

function ticketHeaders(value: string | null): Record<string, string> | null {
  try {
    const parsed: unknown = JSON.parse(value ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const headers: Record<string, string> = {};
    for (const [name, header] of Object.entries(parsed)) {
      if (typeof header !== "string" || !FORWARDED_HEADERS.test(name)) return null;
      headers[name] = header;
    }
    return headers;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  if (isCrossSite(request)) return errorResponse(403, "Cross-site request blocked", "FORBIDDEN");

  const token = (await getToken({ req: request, secret: authSecret(), cookieName: NEXT_AUTH_SESSION_COOKIE })) as EVAuthToken | null;
  if (!token?.accessToken) return errorResponse(401, "Not signed in", "UNAUTHORIZED");

  const target = storageUrl(request.headers.get("x-upload-url"));
  const headers = ticketHeaders(request.headers.get("x-upload-headers"));
  if (!target || !headers) return errorResponse(400, "Invalid upload request.", "BAD_REQUEST");

  const file = await request.arrayBuffer();
  if (file.byteLength === 0) return errorResponse(400, "This file is empty.", "BAD_REQUEST");
  if (file.byteLength > MAX_BYTES) return errorResponse(413, "This file is too large.", "BAD_REQUEST");

  try {
    const stored = await fetch(target, { method: "PUT", headers, body: file, cache: "no-store" });
    if (!stored.ok) {
      // 403 is almost always an expired ticket; the dialog starts over on any failure.
      return errorResponse(502, "The file couldn't be uploaded to storage. Please try again.", "UPLOAD_FAILED");
    }
  } catch {
    return errorResponse(502, "Unable to reach storage. Please try again.", "UPLOAD_FAILED");
  }
  return NextResponse.json({ status: "success", message: "Uploaded", data: null, error: null }, { headers: NO_STORE });
}
