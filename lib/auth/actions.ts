"use server";

import { apiRequest, type ApiFailure } from "@/lib/api/client";
import type {
  LoginResponse,
  TotpSetupResponse,
  TwoFactorMethod,
  TwoFactorMethods,
  User,
} from "@/lib/api/types";
import { fail, succeed, type ActionResult } from "./action-result";
import { authedRequest, getCurrentUser, twoFactorSetupRequired } from "./dal";
import { readAuthTokenFromCookies, updateAuthToken } from "./next-auth-cookie";

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

  // Lifts the forced-change gate in the NextAuth token. The session itself continues.
  await updateAuthToken((token) => ({ ...token, hasChangedTemporaryPassword: true }));
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
  await refreshUserInAuthToken(); // a second factor now exists
  return succeed(result.message, null);
}

/**
 * Policy: 2FA is mandatory, so the last method that actually protects the
 * account can never be turned off. The API would allow it, so this is enforced
 * here (and hidden in the UI). A method an admin has disabled protects nothing,
 * so it neither counts as the "other" method nor is blocked from being removed.
 */
async function refuseIfLastMethod(
  disabling: "email" | "totp",
): Promise<Extract<ActionResult, { ok: false }> | null> {
  const result = await authedRequest<TwoFactorMethods>("/auth/2fa/methods", { method: "GET" });
  if (!result.ok) return fromApi(result);
  const target: TwoFactorMethod = disabling === "email" ? "EMAIL_OTP" : "TOTP";
  const usable = result.data.methods.filter((option) => option.is_available && option.is_enrolled);
  if (!usable.some((option) => option.method === target)) return null;
  return usable.length > 1
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
  await refreshUserInAuthToken();
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
  await refreshUserInAuthToken(); // a second factor now exists
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
  await refreshUserInAuthToken();
  return succeed(result.message, null);
}

async function refreshUserInAuthToken(): Promise<void> {
  const me = await authedRequest<User>("/users/me", { method: "GET" });
  if (!me.ok) return;
  await updateAuthToken((token) => ({ ...token, user: me.data }));
}

// ---------------------------------------------------------------------------
// Choosing a two-factor method (2026-10-07)
// ---------------------------------------------------------------------------

export async function getTwoFactorMethods(): Promise<ActionResult<TwoFactorMethods>> {
  const result = await authedRequest<TwoFactorMethods>("/auth/2fa/methods", { method: "GET" });
  return result.ok ? succeed(result.message, result.data) : fromApi(result);
}

/** `null` clears the preference (the authenticator app is then asked for first). */
export async function setPreferredTwoFactorMethod(input: {
  method: TwoFactorMethod | null;
}): Promise<ActionResult<TwoFactorMethods>> {
  const result = await authedRequest<TwoFactorMethods>("/auth/2fa/preferred-method", {
    method: "PUT",
    body: { method: input.method },
  });
  if (!result.ok) return fromApi(result);
  await refreshUserInAuthToken();
  return succeed(result.message, result.data);
}

/**
 * Mid-login: switches the pending challenge to another of the user's methods,
 * or, called with the current method, resends the email code. The API keeps
 * the same challenge token, so only the method in the cookie changes.
 */
export async function switchLoginTwoFactorMethod(input: {
  method: TwoFactorMethod;
}): Promise<ActionResult<{ method: TwoFactorMethod; availableMethods: TwoFactorMethod[] }>> {
  const token = await readAuthTokenFromCookies();
  const challenge = token?.authStep === "two_factor" ? token.challenge : undefined;
  if (!challenge) {
    return { ...fail("Your verification expired. Please sign in again."), challengeExpired: true };
  }

  const result = await apiRequest<LoginResponse>("/auth/login/two-factor-method", {
    body: { challenge_token: challenge.token, method: input.method },
  });
  if (!result.ok) {
    const expired = result.message.toLowerCase().includes("login challenge");
    return { ...fromApi(result), challengeExpired: expired || undefined };
  }

  const method = result.data.two_factor_method ?? input.method;
  const availableMethods = result.data.available_two_factor_methods ?? challenge.availableMethods;
  await updateAuthToken((current) => ({
    ...current,
    challenge: current.challenge && { ...current.challenge, method, availableMethods },
  }));
  return succeed(result.message, { method, availableMethods });
}

/**
 * Lets a staff member past /setup-2fa when an admin offers no two-factor
 * method at all. Re-checked against the API, never trusted from the client.
 */
export async function continueWithoutTwoFactor(): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (await twoFactorSetupRequired(user)) {
    return fail("Two-factor authentication is available again. Set up a method to continue.");
  }
  await updateAuthToken((token) => ({ ...token, twoFactorWaived: true }));
  return succeed("", null);
}
