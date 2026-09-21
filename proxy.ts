import { NextResponse, type NextRequest } from "next/server";

import {
  ACCESS_COOKIE,
  API_PROXY_PREFIX,
  CHANGE_PASSWORD_REQUIRED_PATH,
  DASHBOARD_PATH,
  LOGIN_PATH,
  MUST_CHANGE_COOKIE,
  PUBLIC_PATHS,
  REFRESH_COOKIE,
  SESSION_END_REASONS,
  type SessionEndReason,
} from "@/lib/auth/constants";
import { jwtExpiry } from "@/lib/auth/jwt";
import { refreshTokens } from "@/lib/auth/refresh";
import { clearSessionCookies, writeSessionCookies } from "@/lib/auth/session";
import type { LoginResponse } from "@/lib/api/types";

/** Refresh when the access token has less than this left. */
const REFRESH_SKEW_MS = 5 * 60 * 1000;

/**
 * Optimistic session gate plus token refresh. Reads cookies only; real
 * authorization happens next to the data (see lib/auth/dal.ts).
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.includes(pathname);

  const access = request.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;

  let refreshed: LoginResponse | null = null;
  // Arriving at /login?reason=expired|ended means the session is over; drop any cookies.
  let sessionDead =
    pathname === LOGIN_PATH &&
    SESSION_END_REASONS.includes(request.nextUrl.searchParams.get("reason") as SessionEndReason);

  if (refresh && !sessionDead) {
    const accessExpiry = jwtExpiry(access);
    const refreshExpiry = jwtExpiry(refresh);
    const refreshUsable = refreshExpiry === null || refreshExpiry > Date.now();

    if (!refreshUsable) {
      sessionDead = true;
    } else if (accessExpiry === null || accessExpiry - Date.now() < REFRESH_SKEW_MS) {
      const result = await refreshTokens(refresh);
      if (result.ok) refreshed = result.data;
      else if (result.reason === "invalid") sessionDead = true;
      // "unavailable": carry on with the tokens we have rather than log out.
    }
  }

  const signedIn = !sessionDead && Boolean(refreshed?.access_token ?? access);
  const mustChange = refreshed
    ? refreshed.has_changed_temporary_password === false
    : request.cookies.get(MUST_CHANGE_COOKIE)?.value === "1";

  const respond = (response: NextResponse) => {
    if (sessionDead) clearSessionCookies(response.cookies);
    else if (refreshed) writeSessionCookies(response.cookies, refreshed);
    return response;
  };
  const redirectTo = (path: string, search?: URLSearchParams) => {
    const url = new URL(path, request.url);
    if (search) url.search = search.toString();
    return respond(NextResponse.redirect(url));
  };

  // Data calls from the browser (TanStack Query) get JSON errors, never redirects.
  if (pathname.startsWith(API_PROXY_PREFIX)) {
    if (!signedIn) return respond(apiError(401, "Not signed in", "UNAUTHORIZED"));
    if (mustChange) {
      return respond(apiError(403, "You must set a new password first", "FORBIDDEN"));
    }
    if (refreshed) {
      // The route handler reads the access cookie, so hand it the fresh one.
      writeSessionCookies(
        {
          set: (name, value) => request.cookies.set(name, value),
          delete: (name) => request.cookies.delete(name),
        },
        refreshed,
      );
      return respond(NextResponse.next({ request: { headers: request.headers } }));
    }
    return NextResponse.next();
  }

  if (!signedIn) {
    // Redirecting a Server Action POST makes the client replay it against
    // /login, which lands on an error page. Let it through instead: with no
    // valid session, authedRequest() ends the session and redirects properly.
    if (isPublic || request.headers.has("next-action")) return respond(NextResponse.next());
    const search = new URLSearchParams();
    if (sessionDead) search.set("reason", "expired");
    if (pathname !== "/" && pathname !== DASHBOARD_PATH) {
      search.set("next", pathname + request.nextUrl.search);
    }
    return redirectTo(LOGIN_PATH, search);
  }

  if (isPublic || pathname === "/") {
    return redirectTo(mustChange ? CHANGE_PASSWORD_REQUIRED_PATH : DASHBOARD_PATH);
  }
  if (mustChange && pathname !== CHANGE_PASSWORD_REQUIRED_PATH) {
    return redirectTo(CHANGE_PASSWORD_REQUIRED_PATH);
  }
  if (!mustChange && pathname === CHANGE_PASSWORD_REQUIRED_PATH) {
    return redirectTo(DASHBOARD_PATH);
  }

  // Forward refreshed tokens to the page being rendered as well as the browser,
  // so Server Components in this same request already see the new access token.
  if (refreshed) {
    writeSessionCookies(
      {
        // RequestCookies takes no attributes; they only matter on the response.
        set: (name, value) => request.cookies.set(name, value),
        delete: (name) => request.cookies.delete(name),
      },
      refreshed,
    );
    return respond(NextResponse.next({ request: { headers: request.headers } }));
  }
  return NextResponse.next();
}

function apiError(status: number, message: string, code: string) {
  return NextResponse.json(
    { status: "error", message, data: null, error: { code, details: null } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export const config = {
  // Skip Next internals, static files (anything with an extension) and API
  // routes, except the data gateway (/api/proxy), which needs token refresh.
  matcher: ["/((?!api(?!/proxy)|_next/static|_next/image|.*\\..*).*)"],
};
