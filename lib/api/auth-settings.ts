import { apiFetch } from "@/lib/api/browser";
import type { TwoFactorMethod } from "@/lib/api/types";

/** Admin-only two-factor method settings (2026-10-07), under `/auth-settings`. */

export interface AuthMethodSetting {
  id: string;
  created_at: string;
  updated_at: string;
  method: TwoFactorMethod;
  label: string;
  /** Offered to users. While false, nobody is asked for it at sign-in and nobody can set it up. */
  is_enabled: boolean;
  /** Active users who have it switched on, i.e. who are affected by turning it off. */
  enrolled_users: number;
  /** Admin who last changed it; `null` = untouched since the seed. */
  updated_by: string | null;
}

/** Always both methods, `EMAIL_OTP` then `TOTP`. */
export function listAuthMethodSettings(signal?: AbortSignal) {
  return apiFetch<AuthMethodSetting[]>("/auth-settings/two-factor-methods", { signal });
}

/**
 * Turns a method on or off for everyone. Users' setup is kept either way, so
 * turning it back on restores how they signed in before.
 */
export function updateAuthMethodSetting(method: TwoFactorMethod, isEnabled: boolean) {
  return apiFetch<AuthMethodSetting>(`/auth-settings/two-factor-methods/${method}`, {
    method: "PATCH",
    body: { is_enabled: isEnabled },
  });
}
