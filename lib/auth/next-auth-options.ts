import type { NextAuthOptions, User as NextAuthUser } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import { apiRequest } from "@/lib/api/client";
import type { LoginResponse, TwoFactorMethod } from "@/lib/api/types";
import {
  authSecret,
  NEXT_AUTH_MAX_AGE,
  NEXT_AUTH_SESSION_COOKIE,
  refreshAuthToken,
  shouldRefreshAuthToken,
  tokenFromLoginResponse,
  type EVAuthToken,
} from "./next-auth-shared";

function field(credentials: Record<string, string> | undefined, key: string): string {
  return credentials?.[key]?.trim() ?? "";
}

function assertStaff(data: LoginResponse): void {
  if (!data.access_token || !data.refresh_token || !data.user) {
    throw new Error("Something went wrong. Please try again.");
  }
  if (data.user.user_type === "DRIVER") {
    void apiRequest("/auth/logout", { body: { refresh_token: data.refresh_token } });
    throw new Error("This dashboard is for staff only. Drivers should use the mobile app.");
  }
}

function userFromLogin(data: LoginResponse): NextAuthUser {
  assertStaff(data);
  const token = tokenFromLoginResponse(data);
  return {
    id: data.user!.id,
    name: token.name,
    email: data.user!.email,
    authStep: "authenticated",
    apiUser: data.user!,
    accessToken: data.access_token!,
    refreshToken: data.refresh_token!,
    accessTokenExpires: token.accessTokenExpires,
    refreshTokenExpires: token.refreshTokenExpires,
    hasChangedTemporaryPassword: data.has_changed_temporary_password,
  };
}

async function passwordSignIn(credentials: Record<string, string> | undefined) {
  const identifier = field(credentials, "identifier");
  const password = credentials?.password ?? "";
  if (!identifier || !password) throw new Error("Enter your username and password.");

  const result = await apiRequest<LoginResponse>("/auth/login", {
    body: { identifier, password },
  });
  if (!result.ok) throw new Error(result.message);

  if (result.data.status === "two_factor_required") {
    if (!result.data.challenge_token || !result.data.two_factor_method) {
      throw new Error("Something went wrong. Please try again.");
    }
    return {
      id: `challenge:${result.data.challenge_token}`,
      authStep: "two_factor",
      challengeMethod: result.data.two_factor_method,
      challengeToken: result.data.challenge_token,
      challengeIdentifier: identifier,
    } satisfies NextAuthUser;
  }
  return userFromLogin(result.data);
}

async function twoFactorSignIn(credentials: Record<string, string> | undefined) {
  const method = field(credentials, "method") as TwoFactorMethod;
  const challengeToken = field(credentials, "challengeToken");
  const code = field(credentials, "code");
  if (!challengeToken || !code) throw new Error("Enter the verification code.");
  if (method !== "TOTP" && method !== "EMAIL_OTP") throw new Error("Please sign in again.");

  const path = method === "TOTP" ? "/auth/login/verify-totp" : "/auth/login/verify-email-otp";
  const result = await apiRequest<LoginResponse>(path, {
    body: { challenge_token: challengeToken, code },
  });
  if (!result.ok) throw new Error(result.message);
  return userFromLogin(result.data);
}

export const authOptions: NextAuthOptions = {
  secret: authSecret(),
  session: {
    strategy: "jwt",
    maxAge: NEXT_AUTH_MAX_AGE,
    updateAge: 0,
  },
  cookies: {
    sessionToken: {
      name: NEXT_AUTH_SESSION_COOKIE,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "EV Muvment API",
      credentials: {
        mode: { type: "text" },
        identifier: { type: "text" },
        password: { type: "password" },
        method: { type: "text" },
        challengeToken: { type: "text" },
        code: { type: "text" },
      },
      async authorize(credentials) {
        return credentials?.mode === "twoFactor"
          ? twoFactorSignIn(credentials)
          : passwordSignIn(credentials);
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.authStep === "two_factor") {
        return {
          sub: user.id,
          authStep: "two_factor",
          challenge: {
            method: user.challengeMethod!,
            token: user.challengeToken!,
            identifier: user.challengeIdentifier!,
          },
        } satisfies EVAuthToken;
      }

      if (user?.authStep === "authenticated") {
        return {
          sub: user.id,
          name: user.name,
          email: user.email ?? undefined,
          authStep: "authenticated",
          accessToken: user.accessToken,
          refreshToken: user.refreshToken,
          accessTokenExpires: user.accessTokenExpires,
          refreshTokenExpires: user.refreshTokenExpires,
          user: user.apiUser,
          hasChangedTemporaryPassword: user.hasChangedTemporaryPassword,
        } satisfies EVAuthToken;
      }

      const authToken = token as EVAuthToken;
      return shouldRefreshAuthToken(authToken) ? refreshAuthToken(authToken) : authToken;
    },
    async session({ session, token }) {
      const authToken = token as EVAuthToken;
      session.authStep = authToken.authStep;
      session.user = authToken.user;
      session.hasChangedTemporaryPassword = authToken.hasChangedTemporaryPassword;
      session.twoFactorChallenge = authToken.challenge;
      session.authError = authToken.authError;
      return session;
    },
  },
  events: {
    async signOut(message) {
      const token = "token" in message ? (message.token as EVAuthToken) : null;
      if (token?.refreshToken) {
        await apiRequest("/auth/logout", { body: { refresh_token: token.refreshToken } });
      }
    },
  },
};
