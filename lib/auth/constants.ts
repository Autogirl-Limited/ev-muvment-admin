export const ACCESS_COOKIE = "ev_access";
export const REFRESH_COOKIE = "ev_refresh";
/** Present (value "1") while the user is still on a temporary password. */
export const MUST_CHANGE_COOKIE = "ev_must_change";
/** Present (value "1") while the user has no two-factor method enabled (policy: staff must). */
export const SETUP_2FA_COOKIE = "ev_setup_2fa";

export const LOGIN_PATH = "/login";
export const DASHBOARD_PATH = "/dashboard";
export const CHANGE_PASSWORD_REQUIRED_PATH = "/change-password-required";
export const SETUP_2FA_PATH = "/setup-2fa";
/** Same-origin gateway the browser uses for data (see app/api/proxy). */
export const API_PROXY_PREFIX = "/api/proxy/";

/** Routes reachable without a session. */
export const PUBLIC_PATHS = ["/login", "/forgot-password", "/reset-password"];

/**
 * `/login?reason=<one of these>` means "the session is over": the proxy clears
 * any leftover cookies when it sees it (Server Components can't), so a dead
 * session never bounces between /login and the dashboard.
 */
export type SessionEndReason = "expired" | "ended";
export const SESSION_END_REASONS: readonly SessionEndReason[] = ["expired", "ended"];

/** sessionStorage key carrying the identifier from forgot- to reset-password. */
export const RESET_IDENTIFIER_KEY = "ev-reset-identifier";
/** BroadcastChannel used to sign out every open tab together. */
export const AUTH_CHANNEL = "ev-auth";
