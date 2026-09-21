import type { User as ApiUser, TwoFactorMethod } from "@/lib/api/types";
import type { AuthStep } from "@/lib/auth/next-auth-shared";

declare module "next-auth" {
  interface User {
    authStep?: AuthStep;
    apiUser?: ApiUser;
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number | null;
    refreshTokenExpires?: number | null;
    hasChangedTemporaryPassword?: boolean | null;
    challengeMethod?: TwoFactorMethod;
    challengeToken?: string;
    challengeIdentifier?: string;
  }

  interface Session {
    user?: ApiUser;
    authStep?: AuthStep;
    hasChangedTemporaryPassword?: boolean | null;
    twoFactorChallenge?: {
      method: TwoFactorMethod;
      token: string;
      identifier: string;
    };
    authError?: "RefreshAccessTokenError";
  }
}

