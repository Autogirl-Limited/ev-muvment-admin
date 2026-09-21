import { NextResponse, type NextRequest } from "next/server";
import { encode, getToken } from "next-auth/jwt";

import {
  API_PROXY_PREFIX,
  CHANGE_PASSWORD_REQUIRED_PATH,
  DASHBOARD_PATH,
  LOGIN_PATH,
  PUBLIC_PATHS,
  SESSION_END_REASONS,
  SETUP_2FA_PATH,
  type SessionEndReason,
} from "@/lib/auth/constants";
import {
  authSecret,
  NEXT_AUTH_MAX_AGE,
  NEXT_AUTH_SESSION_COOKIE,
  refreshAuthToken,
  shouldRefreshAuthToken,
  type EVAuthToken,
} from "@/lib/auth/next-auth-shared";
import { clearSessionCookies } from "@/lib/auth/session";

/**
 * Optimistic session gate plus token refresh. Reads cookies only; real
 * authorization happens next to the data (see lib/auth/dal.ts).
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.includes(pathname);

  const token = (await getToken({
    req: request,
    secret: authSecret(),
    cookieName: NEXT_AUTH_SESSION_COOKIE,
  })) as EVAuthToken | null;
  let authToken = token;
  let encodedRefreshedToken: string | null = null;
  // Arriving at /login?reason=expired|ended means the session is over; drop any cookies.
  let sessionDead =
    pathname === LOGIN_PATH &&
    SESSION_END_REASONS.includes(request.nextUrl.searchParams.get("reason") as SessionEndReason);

  if (authToken && !sessionDead && shouldRefreshAuthToken(authToken)) {
    const refreshed = await refreshAuthToken(authToken);
    if (refreshed.authError) {
      sessionDead = true;
    } else if (refreshed.accessToken !== authToken.accessToken) {
      authToken = refreshed;
      encodedRefreshedToken = await encode({
        token: refreshed,
        secret: authSecret(),
        maxAge: NEXT_AUTH_MAX_AGE,
      });
    }
  }

  const signedIn = !sessionDead && Boolean(authToken?.accessToken);
  const mustChange = authToken?.hasChangedTemporaryPassword === false;

  // Policy: staff must have two-factor authentication. Recomputed from the
  // user the API returns on login/refresh.
  const needs2fa = authToken?.user
    ? !authToken.user.two_factor_enabled && !authToken.user.totp_enabled
    : false;

  const respond = (response: NextResponse) => {
    if (sessionDead) clearAuthCookies(response);
    else if (authToken && encodedRefreshedToken) writeAuthCookie(response, authToken, encodedRefreshedToken);
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
    if (needs2fa) {
      return respond(apiError(403, "Set up two-factor authentication first", "FORBIDDEN"));
    }
    if (authToken && encodedRefreshedToken) {
      // The route handler reads the access cookie, so hand it the fresh one.
      request.cookies.set(NEXT_AUTH_SESSION_COOKIE, encodedRefreshedToken);
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
    return redirectTo(landingPath(mustChange, needs2fa));
  }
  // Order matters: a temporary password is replaced first, then 2FA is set up.
  if (mustChange && pathname !== CHANGE_PASSWORD_REQUIRED_PATH) {
    return redirectTo(CHANGE_PASSWORD_REQUIRED_PATH);
  }
  if (!mustChange && pathname === CHANGE_PASSWORD_REQUIRED_PATH) {
    return redirectTo(landingPath(false, needs2fa));
  }
  // /setup-2fa stays reachable even without the flag: the page itself checks
  // the real user, which is what lets the dashboard send people there when the
  // cookie and the account disagree (see requireUser).
  // Only once the password step is behind them: without this guard, someone who
  // needs both bounces between the two screens forever.
  if (!mustChange && needs2fa && pathname !== SETUP_2FA_PATH) {
    return redirectTo(SETUP_2FA_PATH);
  }

  // Forward refreshed tokens to the page being rendered as well as the browser,
  // so Server Components in this same request already see the new access token.
  if (authToken && encodedRefreshedToken) {
    request.cookies.set(NEXT_AUTH_SESSION_COOKIE, encodedRefreshedToken);
    return respond(NextResponse.next({ request: { headers: request.headers } }));
  }
  return NextResponse.next();
}

function landingPath(mustChange: boolean, needs2fa: boolean): string {
  if (mustChange) return CHANGE_PASSWORD_REQUIRED_PATH;
  return needs2fa ? SETUP_2FA_PATH : DASHBOARD_PATH;
}

function apiError(status: number, message: string, code: string) {
  return NextResponse.json(
    { status: "error", message, data: null, error: { code, details: null } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function writeAuthCookie(response: NextResponse, token: EVAuthToken, value: string) {
  response.cookies.set(NEXT_AUTH_SESSION_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(token.refreshTokenExpires ?? Date.now() + NEXT_AUTH_MAX_AGE * 1000),
  });
}

function clearAuthCookies(response: NextResponse) {
  response.cookies.delete(NEXT_AUTH_SESSION_COOKIE);
  clearSessionCookies(response.cookies);
}

export const config = {
  // Skip Next internals, static files (anything with an extension) and API
  // routes, except the data gateway (/api/proxy), which needs token refresh.
  matcher: ["/((?!api(?!/proxy)|_next/static|_next/image|.*\\..*).*)"],
};
