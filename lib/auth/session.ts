import {
  ACCESS_COOKIE,
  MUST_CHANGE_COOKIE,
  REFRESH_COOKIE,
  SETUP_2FA_COOKIE,
} from "./constants";

/** The subset of Next's cookie stores (action/route-handler/proxy) we write to. */
export interface CookieWriter {
  delete(name: string): unknown;
}

/** Clears pre-NextAuth session cookies left behind by older app versions. */
export function clearSessionCookies(store: CookieWriter): void {
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
  store.delete(MUST_CHANGE_COOKIE);
  store.delete(SETUP_2FA_COOKIE);
}
