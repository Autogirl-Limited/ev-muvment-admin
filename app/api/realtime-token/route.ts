import { NextResponse, type NextRequest } from "next/server";
import { encode, getToken } from "next-auth/jwt";

import {
  authSecret,
  NEXT_AUTH_MAX_AGE,
  NEXT_AUTH_SESSION_COOKIE,
  refreshAuthToken,
  shouldRefreshAuthToken,
  type EVAuthToken,
} from "@/lib/auth/next-auth-shared";

const NO_STORE = { "Cache-Control": "no-store" };

function apiOrigin() {
  const base =
    process.env.NEXT_PUBLIC_WS_BASE ??
    process.env.API_BASE_URL ??
    (process.env.NODE_ENV === "production" ? undefined : "http://localhost:8000");
  if (!base) return null;
  return base.replace(/\/+$/, "").replace(/\/api\/v1$/, "");
}

function wsUrl(accessToken: string) {
  const origin = apiOrigin();
  if (!origin) return null;
  const wsOrigin = origin.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
  return `${wsOrigin}/api/v1/notifications/ws?token=${encodeURIComponent(accessToken)}`;
}

export async function GET(request: NextRequest) {
  let token = (await getToken({
    req: request,
    secret: authSecret(),
    cookieName: NEXT_AUTH_SESSION_COOKIE,
  })) as EVAuthToken | null;

  if (!token?.accessToken) {
    return NextResponse.json({ message: "Not signed in" }, { status: 401, headers: NO_STORE });
  }

  let encoded: string | null = null;
  if (shouldRefreshAuthToken(token)) {
    const refreshed = await refreshAuthToken(token);
    if (refreshed.authError || !refreshed.accessToken) {
      return NextResponse.json({ message: "Session expired" }, { status: 401, headers: NO_STORE });
    }
    token = refreshed;
    encoded = await encode({ token, secret: authSecret(), maxAge: NEXT_AUTH_MAX_AGE });
  }

  const accessToken = token.accessToken;
  if (!accessToken) {
    return NextResponse.json({ message: "Session expired" }, { status: 401, headers: NO_STORE });
  }

  const url = wsUrl(accessToken);
  if (!url) {
    return NextResponse.json({ message: "Realtime endpoint is not configured" }, { status: 500, headers: NO_STORE });
  }

  const response = NextResponse.json({ url }, { headers: NO_STORE });
  if (encoded) {
    response.cookies.set(NEXT_AUTH_SESSION_COOKIE, encoded, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: new Date(token.refreshTokenExpires ?? Date.now() + NEXT_AUTH_MAX_AGE * 1000),
    });
  }
  return response;
}
