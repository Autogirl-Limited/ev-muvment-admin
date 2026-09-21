import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

import { forwardToApi } from "@/lib/api/client";
import {
  authSecret,
  NEXT_AUTH_SESSION_COOKIE,
  type EVAuthToken,
} from "@/lib/auth/next-auth-shared";

/**
 * Same-origin gateway for browser data fetching (TanStack Query). The EV API
 * access token lives inside the encrypted NextAuth cookie, so page JavaScript
 * can't read it. The browser calls /api/proxy/<api path>; this handler decodes
 * the server-side JWT, adds the Bearer token and forwards to the EV API.
 */

const NO_STORE = { "Cache-Control": "no-store" };

function errorResponse(status: number, message: string, code: string) {
  return NextResponse.json(
    { status: "error", message, data: null, error: { code, details: null } },
    { status, headers: NO_STORE },
  );
}

/** Rejects cross-site writes. SameSite=Lax cookies already block most; this is the backstop. */
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

async function handle(request: NextRequest, ctx: RouteContext<"/api/proxy/[...path]">) {
  const segments = (await ctx.params).path;
  const path = `/${segments.join("/")}`;

  // Auth endpoints rotate tokens and must go through the Server Actions that
  // also update the cookies; calling them here would desync the session.
  if (segments[0] === "auth") {
    return errorResponse(404, "Not found", "NOT_FOUND");
  }

  if (request.method !== "GET" && isCrossSite(request)) {
    return errorResponse(403, "Cross-site request blocked", "FORBIDDEN");
  }

  const token = (await getToken({
    req: request,
    secret: authSecret(),
    cookieName: NEXT_AUTH_SESSION_COOKIE,
  })) as EVAuthToken | null;
  if (!token?.accessToken) {
    return errorResponse(401, "Not signed in", "UNAUTHORIZED");
  }

  const hasBody = request.method !== "GET" && request.method !== "DELETE";
  const upstream = await forwardToApi(`${path}${request.nextUrl.search}`, {
    method: request.method as "GET" | "POST" | "PATCH" | "DELETE",
    rawBody: hasBody ? (await request.text()) || undefined : undefined,
    token: token.accessToken,
  });

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": "application/json", ...NO_STORE },
  });
}

export {
  handle as GET,
  handle as POST,
  handle as PATCH,
  handle as DELETE,
};
