import type { JWT } from "next-auth/jwt";

import type { LoginResponse, TwoFactorMethod, User } from "@/lib/api/types";
import { jwtExpiry } from "./jwt";
import { refreshTokens } from "./refresh";

export const NEXT_AUTH_SESSION_COOKIE = "ev_next_auth";
export const NEXT_AUTH_MAX_AGE = 45 * 24 * 60 * 60;
export const REFRESH_SKEW_MS = 5 * 60 * 1000;

export type AuthStep = "authenticated" | "two_factor";

export interface TwoFactorSessionChallenge {
  method: TwoFactorMethod;
  token: string;
  identifier: string;
}

export interface EVAuthToken extends JWT {
  authStep?: AuthStep;
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpires?: number | null;
  refreshTokenExpires?: number | null;
  user?: User;
  hasChangedTemporaryPassword?: boolean | null;
  challenge?: TwoFactorSessionChallenge;
  authError?: "RefreshAccessTokenError";
}

export function authSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
  // Allows local/CI builds to complete before environment variables are wired.
  // Real deployments must set NEXTAUTH_SECRET so existing sessions survive restarts.
  if (!secret) return "ev-muvment-admin-dev-next-auth-secret";
  return secret;
}

export function tokenFromLoginResponse(data: LoginResponse): EVAuthToken {
  return {
    authStep: "authenticated",
    sub: data.user?.id,
    name: data.user ? `${data.user.first_name} ${data.user.last_name}`.trim() : undefined,
    email: data.user?.email ?? undefined,
    accessToken: data.access_token ?? undefined,
    refreshToken: data.refresh_token ?? undefined,
    accessTokenExpires: jwtExpiry(data.access_token ?? undefined),
    refreshTokenExpires: jwtExpiry(data.refresh_token ?? undefined),
    user: data.user ?? undefined,
    hasChangedTemporaryPassword: data.has_changed_temporary_password,
  };
}

export function shouldRefreshAuthToken(token: EVAuthToken): boolean {
  if (!token.refreshToken || token.authStep !== "authenticated") return false;
  const accessExpiry = token.accessTokenExpires ?? null;
  const refreshExpiry = token.refreshTokenExpires ?? null;
  if (refreshExpiry !== null && refreshExpiry <= Date.now()) return true;
  return accessExpiry === null || accessExpiry - Date.now() < REFRESH_SKEW_MS;
}

export async function refreshAuthToken(token: EVAuthToken): Promise<EVAuthToken> {
  if (!token.refreshToken) return { ...token, authError: "RefreshAccessTokenError" };
  const refreshExpiry = token.refreshTokenExpires ?? null;
  if (refreshExpiry !== null && refreshExpiry <= Date.now()) {
    return { ...token, accessToken: undefined, authError: "RefreshAccessTokenError" };
  }

  const result = await refreshTokens(token.refreshToken);
  if (!result.ok) {
    return result.reason === "invalid"
      ? { ...token, accessToken: undefined, authError: "RefreshAccessTokenError" }
      : token;
  }
  return tokenFromLoginResponse(result.data);
}
