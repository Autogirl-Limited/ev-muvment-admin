export type UserType = "ADMIN" | "ACCOUNT_OFFICER" | "RELATIONSHIP_OFFICER" | "DRIVER";
export type TwoFactorMethod = "EMAIL_OTP" | "TOTP";
export type DeliveryChannel = "EMAIL" | "SMS";

export interface ApiEnvelope<T> {
  status: "success" | "error";
  message: string;
  data: T | null;
  error: {
    code: string;
    details: { field: string; issue: string }[] | null;
  } | null;
}

export interface User {
  id: string;
  created_at: string;
  updated_at: string;
  first_name: string;
  last_name: string;
  username: string;
  email: string | null;
  phone_number: string | null;
  user_type: UserType;
  is_active: boolean;
  /** Email OTP 2FA is on. */
  two_factor_enabled: boolean;
  /** Authenticator-app (TOTP) 2MFA is on. */
  totp_enabled: boolean;
  /** The method the user chose to be asked for first at login; `null` = no preference. */
  preferred_two_factor_method: TwoFactorMethod | null;
  /** Driver wallet balance; staff receive 0. */
  ev_wallet_balance: number;
  virtual_account: unknown | null;
  vehicle: unknown | null;
  /** Drivers are on shift between submitted pick-up and submitted drop-off; staff are always false. */
  shift: boolean;
}

/** Response of /auth/login, /auth/login/verify-* and /auth/refresh. */
export interface LoginResponse {
  status: "success" | "two_factor_required";
  two_factor_method: TwoFactorMethod | null;
  /** Every method the user can finish this challenge with, current one first. `null` on success. */
  available_two_factor_methods: TwoFactorMethod[] | null;
  challenge_token: string | null;
  user: User | null;
  access_token: string | null;
  refresh_token: string | null;
  token_type: "bearer" | null;
  /** `false` means the user is still on a temporary password. */
  has_changed_temporary_password: boolean | null;
}

export interface TotpSetupResponse {
  secret: string;
  otpauth_url: string;
}

/** One entry of `GET /auth/2fa/methods` (2026-10-07). */
export interface TwoFactorMethodOption {
  method: TwoFactorMethod;
  label: string;
  /** An admin offers this method. If false, hide setup; turning it off is still allowed. */
  is_available: boolean;
  /** The user has set it up and switched it on. */
  is_enrolled: boolean;
  /** Login asks for this method first. */
  is_preferred: boolean;
}

/** `GET /auth/2fa/methods` and `PUT /auth/2fa/preferred-method`. */
export interface TwoFactorMethods {
  /** What login will actually ask for first (not necessarily a saved choice); `null` = password only. */
  preferred_method: TwoFactorMethod | null;
  methods: TwoFactorMethodOption[];
}
