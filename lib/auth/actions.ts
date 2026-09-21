"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { apiRequest, type ApiFailure } from "@/lib/api/client";
import type { LoginResponse, TotpSetupResponse, TwoFactorMethod, User } from "@/lib/api/types";
import { fail, succeed, type ActionResult } from "./action-result";
import {
  CHANGE_PASSWORD_REQUIRED_PATH,
  MUST_CHANGE_COOKIE,
  REFRESH_COOKIE,
  SETUP_2FA_COOKIE,
  SETUP_2FA_PATH,
} from "./constants";
import { authedRequest } from "./dal";
import { safeNextPath } from "./redirect";
import { hasTwoFactor } from "./two-factor";
import { clearSessionCookies, writeSessionCookies } from "./session";

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;

function fromApi(result: ApiFailure): Extract<ActionResult, { ok: false }> {
  return fail(result.message, result.fieldErrors);
}

function passwordError(password: string, field: string): Record<string, string> | null {
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return { [field]: `Password must be ${PASSWORD_MIN}–${PASSWORD_MAX} characters.` };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Sign in
// ---------------------------------------------------------------------------

export interface TwoFactorChallenge {
  method: TwoFactorMethod;
  challengeToken: string;
}

/**
 * Step 1 of sign-in. Redirects on success; returns a challenge when the
 * account has 2FA (both outcomes are HTTP 200, so branch on `data.status`).
 */
export async function login(input: {
  identifier: string;
  password: string;
  next?: string;
}): Promise<ActionResult<TwoFactorChallenge>> {
  const identifier = input.identifier.trim();
  const fieldErrors: Record<string, string> = {};
  if (!identifier) fieldErrors.identifier = "Enter your username, email or phone number.";
  if (!input.password) fieldErrors.password = "Enter your password.";
  if (Object.keys(fieldErrors).length) return fail("", fieldErrors);

  const result = await apiRequest<LoginResponse>("/auth/login", {
    body: { identifier, password: input.password },
  });
  if (!result.ok) return fromApi(result);

  if (result.data.status === "two_factor_required") {
    if (!result.data.challenge_token || !result.data.two_factor_method) {
      return fail("Something went wrong. Please try again.");
    }
    return succeed(result.message, {
      method: result.data.two_factor_method,
      challengeToken: result.data.challenge_token,
    });
  }
  return finishLogin(result.data, input.next);
}

/** Step 2 of sign-in when the account has 2FA enabled. */
export async function verifyTwoFactor(input: {
  method: TwoFactorMethod;
  challengeToken: string;
  code: string;
  next?: string;
}): Promise<ActionResult> {
  const code = input.code.trim();
  if (input.method === "TOTP" ? !/^\d{6}$/.test(code) : !/^\d{4,10}$/.test(code)) {
    return fail("Enter the 6-digit code.", { code: "Enter the 6-digit code." });
  }

  const path =
    input.method === "TOTP" ? "/auth/login/verify-totp" : "/auth/login/verify-email-otp";
  const result = await apiRequest<LoginResponse>(path, {
    body: { challenge_token: input.challengeToken, code },
  });
  if (!result.ok) {
    return {
      ...fromApi(result),
      challengeExpired: result.message.toLowerCase().includes("login challenge"),
    };
  }
  return finishLogin(result.data, input.next);
}

/** Redirects on success, so it only ever *returns* a failure. */
async function finishLogin(
  data: LoginResponse,
  next: string | undefined,
): Promise<Extract<ActionResult, { ok: false }>> {
  if (!data.access_token || !data.refresh_token || !data.user) {
    return fail("Something went wrong. Please try again.");
  }

  // The web dashboard is for staff; drivers use the mobile app.
  if (data.user.user_type === "DRIVER") {
    await apiRequest("/auth/logout", { body: { refresh_token: data.refresh_token } });
    return fail("This dashboard is for staff only. Drivers should use the mobile app.");
  }

  writeSessionCookies(await cookies(), data);
  // Onboarding order: replace a temporary password, then set up 2FA, then go on.
  if (data.has_changed_temporary_password === false) redirect(CHANGE_PASSWORD_REQUIRED_PATH);
  if (!hasTwoFactor(data.user)) redirect(SETUP_2FA_PATH);
  redirect(safeNextPath(next));
}

/**
 * Doesn't redirect: the caller navigates once this resolves, so the cleared
 * cookies are guaranteed to have reached the browser first (see SignOutButton).
 */
export async function logout(): Promise<void> {
  const store = await cookies();
  const refreshToken = store.get(REFRESH_COOKIE)?.value;
  if (refreshToken) {
    // Best effort: local state is cleared even if this call fails. It only
    // revokes the refresh token; the access token just stops being sent.
    await apiRequest("/auth/logout", { body: { refresh_token: refreshToken } });
  }
  clearSessionCookies(store);
}

// ---------------------------------------------------------------------------
// Forgot / reset / change password
// ---------------------------------------------------------------------------

export async function forgotPassword(input: { identifier: string }): Promise<ActionResult> {
  const identifier = input.identifier.trim();
  if (!identifier) {
    return fail("", { identifier: "Enter your username, email or phone number." });
  }
  // Always neutral on success: the API never confirms whether an account exists.
  const result = await apiRequest("/auth/forgot-password", { body: { identifier } });
  if (!result.ok) return fromApi(result);
  return succeed("If an account exists, we've sent a code.", null);
}

export async function resetPassword(input: {
  identifier: string;
  code: string;
  newPassword: string;
}): Promise<ActionResult> {
  const identifier = input.identifier.trim();
  const code = input.code.trim();
  const fieldErrors: Record<string, string> = {
    ...(!identifier && { identifier: "Enter your username, email or phone number." }),
    ...(!/^\d{4,10}$/.test(code) && { code: "Enter the code we sent you." }),
    ...passwordError(input.newPassword, "newPassword"),
  };
  if (Object.keys(fieldErrors).length) return fail("", fieldErrors);

  const result = await apiRequest("/auth/reset-password", {
    body: { identifier, code, new_password: input.newPassword },
  });
  if (!result.ok) return fromApi(result);
  return succeed(result.message, null);
}

export async function changePassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<ActionResult> {
  const fieldErrors: Record<string, string> = {
    ...(!input.currentPassword && { currentPassword: "Enter your current password." }),
    ...passwordError(input.newPassword, "newPassword"),
  };
  if (Object.keys(fieldErrors).length) return fail("", fieldErrors);
  if (input.newPassword === input.currentPassword) {
    return fail("", { newPassword: "Choose a password different from your current one." });
  }

  const result = await authedRequest("/auth/change-password", {
    body: { current_password: input.currentPassword, new_password: input.newPassword },
  });
  if (!result.ok) {
    return result.status === 400
      ? fail("", { currentPassword: result.message })
      : fromApi(result);
  }

  // Lifts the forced-change gate in the proxy. The session itself continues.
  (await cookies()).delete(MUST_CHANGE_COOKIE);
  return succeed(result.message, null);
}

// ---------------------------------------------------------------------------
// Two-factor management
// ---------------------------------------------------------------------------

export async function requestEmailOtp(): Promise<ActionResult> {
  const result = await authedRequest("/auth/2fa/email/request");
  return result.ok ? succeed(result.message, null) : fromApi(result);
}

export async function confirmEmailOtp(input: { code: string }): Promise<ActionResult> {
  const code = input.code.trim();
  if (!/^\d{4,10}$/.test(code)) return fail("", { code: "Enter the 6-digit code." });

  const result = await authedRequest("/auth/2fa/email/confirm", { body: { code } });
  if (!result.ok) return fromApi(result);
  (await cookies()).delete(SETUP_2FA_COOKIE); // a second factor now exists
  return succeed(result.message, null);
}

/**
 * Policy: 2FA is mandatory, so the last method can never be turned off. The
 * API would allow it, so this is enforced here (and hidden in the UI).
 */
async function refuseIfLastMethod(
  disabling: "email" | "totp",
): Promise<Extract<ActionResult, { ok: false }> | null> {
  const me = await authedRequest<User>("/users/me", { method: "GET" });
  if (!me.ok) return fromApi(me);
  const other = disabling === "email" ? me.data.totp_enabled : me.data.two_factor_enabled;
  return other
    ? null
    : fail("Two-factor authentication is required. Set up another method before turning this one off.");
}

export async function disableEmailOtp(input: { password: string }): Promise<ActionResult> {
  if (!input.password) return fail("", { password: "Enter your password." });
  const refusal = await refuseIfLastMethod("email");
  if (refusal) return refusal;
  const result = await authedRequest("/auth/2fa/email/disable", {
    body: { password: input.password },
  });
  if (!result.ok) return fromApi(result);
  return succeed(result.message, null);
}

export async function setupTotp(): Promise<ActionResult<TotpSetupResponse>> {
  const result = await authedRequest<TotpSetupResponse>("/auth/2mfa/totp/setup");
  return result.ok ? succeed(result.message, result.data) : fromApi(result);
}

export async function confirmTotp(input: { code: string }): Promise<ActionResult> {
  const code = input.code.trim();
  if (!/^\d{6}$/.test(code)) return fail("", { code: "Enter the 6-digit code." });

  const result = await authedRequest("/auth/2mfa/totp/confirm", { body: { code } });
  if (!result.ok) return fromApi(result);
  (await cookies()).delete(SETUP_2FA_COOKIE); // a second factor now exists
  return succeed(result.message, null);
}

export async function disableTotp(input: { password: string }): Promise<ActionResult> {
  if (!input.password) return fail("", { password: "Enter your password." });
  const refusal = await refuseIfLastMethod("totp");
  if (refusal) return refusal;
  const result = await authedRequest("/auth/2mfa/totp/disable", {
    body: { password: input.password },
  });
  if (!result.ok) return fromApi(result);
  return succeed(result.message, null);
}
