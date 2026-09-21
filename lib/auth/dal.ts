import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { apiRequest, type ApiResult } from "@/lib/api/client";
import type { User, UserType } from "@/lib/api/types";
import {
  CHANGE_PASSWORD_REQUIRED_PATH,
  LOGIN_PATH,
  SETUP_2FA_PATH,
  type SessionEndReason,
} from "./constants";
import { readAuthTokenFromCookies } from "./next-auth-cookie";
import { hasTwoFactor } from "./two-factor";

/** Sends the user to the login page; the proxy clears the dead cookies on arrival. */
export function endSession(reason: SessionEndReason): never {
  redirect(`${LOGIN_PATH}?reason=${reason}`);
}

// The API answers 403 (not 401) when the Authorization header is missing or
// malformed. Any other 403 is a genuine role mismatch and must not end the session.
const MISSING_CREDENTIAL_MESSAGES = ["Not authenticated", "Invalid authentication credentials"];

/**
 * Authenticated API call for Server Components and Server Actions.
 *
 * `proxy.ts` refreshes tokens before they expire, so a 401 here means the
 * session is genuinely over (e.g. the user was deactivated) and refreshing
 * again would fail too. Server Components can't write cookies, so all
 * refreshing lives in the proxy.
 */
export async function authedRequest<T = null>(
  path: string,
  init: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown } = {},
): Promise<ApiResult<T>> {
  const token = await readAuthTokenFromCookies();
  if (!token?.accessToken) endSession("expired");

  const result = await apiRequest<T>(path, { ...init, token: token.accessToken });
  if (
    !result.ok &&
    (result.status === 401 ||
      (result.status === 403 && MISSING_CREDENTIAL_MESSAGES.includes(result.message)))
  ) {
    endSession("ended");
  }
  return result;
}

export async function mustChangePassword(): Promise<boolean> {
  const token = await readAuthTokenFromCookies();
  return token?.hasChangedTemporaryPassword === false;
}

/**
 * The signed-in staff member, from `GET /users/me`. Role and 2FA flags come
 * from here, never from the JWT (which carries no role).
 */
export const getCurrentUser = cache(async (): Promise<User> => {
  const result = await authedRequest<User>("/users/me", { method: "GET" });
  if (!result.ok) {
    throw new Error(result.message);
  }
  // This dashboard is for staff. Drivers use the mobile app.
  if (result.data.user_type === "DRIVER" || !result.data.is_active) {
    endSession("ended");
  }
  return result.data;
});

/**
 * Use in pages that need a fully onboarded user: password changed and a second
 * factor set up. The proxy already redirects on the flag cookies, but this is
 * the authoritative check against the real account, so it also catches a
 * cookie that has drifted from the account.
 */
export async function requireUser(): Promise<User> {
  if (await mustChangePassword()) redirect(CHANGE_PASSWORD_REQUIRED_PATH);
  const user = await getCurrentUser();
  if (!hasTwoFactor(user)) redirect(SETUP_2FA_PATH);
  return user;
}

export function hasRole(user: User, allowed: readonly UserType[]): boolean {
  return allowed.includes(user.user_type);
}
