import type { LoginResponse } from "@/lib/api/types";
import {
  ACCESS_COOKIE,
  MUST_CHANGE_COOKIE,
  REFRESH_COOKIE,
} from "./constants";
import { jwtExpiry } from "./jwt";

const DAY_MS = 24 * 60 * 60 * 1000;

interface CookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  expires: Date;
}

/** The subset of Next's cookie stores (action/route-handler/proxy) we write to. */
export interface CookieWriter {
  set(name: string, value: string, options: CookieOptions): unknown;
  delete(name: string): unknown;
}

function options(token: string, fallbackDays: number): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(jwtExpiry(token) ?? Date.now() + fallbackDays * DAY_MS),
  };
}

/**
 * Persists a successful login/refresh response. Tokens are httpOnly, so page
 * JavaScript can never read them. Both tokens are always replaced together
 * because refresh tokens are single-use.
 */
export function writeSessionCookies(store: CookieWriter, data: LoginResponse): void {
  if (!data.access_token || !data.refresh_token) return;

  store.set(ACCESS_COOKIE, data.access_token, options(data.access_token, 30));
  store.set(REFRESH_COOKIE, data.refresh_token, options(data.refresh_token, 45));

  if (data.has_changed_temporary_password === false) {
    store.set(MUST_CHANGE_COOKIE, "1", options(data.refresh_token, 45));
  } else {
    store.delete(MUST_CHANGE_COOKIE);
  }
}

export function clearSessionCookies(store: CookieWriter): void {
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
  store.delete(MUST_CHANGE_COOKIE);
}
