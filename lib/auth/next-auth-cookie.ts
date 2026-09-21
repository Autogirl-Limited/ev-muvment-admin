import "server-only";

import { cookies } from "next/headers";
import { decode, encode } from "next-auth/jwt";

import {
  authSecret,
  NEXT_AUTH_MAX_AGE,
  NEXT_AUTH_SESSION_COOKIE,
  type EVAuthToken,
} from "./next-auth-shared";

function expires(token: EVAuthToken): Date {
  return new Date(token.refreshTokenExpires ?? Date.now() + NEXT_AUTH_MAX_AGE * 1000);
}

export async function readAuthTokenFromCookies(): Promise<EVAuthToken | null> {
  const value = (await cookies()).get(NEXT_AUTH_SESSION_COOKIE)?.value;
  if (!value) return null;
  return (await decode({ token: value, secret: authSecret() })) as EVAuthToken | null;
}

export async function writeAuthTokenCookie(token: EVAuthToken): Promise<void> {
  const encoded = await encode({
    token,
    secret: authSecret(),
    maxAge: NEXT_AUTH_MAX_AGE,
  });
  (await cookies()).set(NEXT_AUTH_SESSION_COOKIE, encoded, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expires(token),
  });
}

export async function updateAuthToken(
  update: (token: EVAuthToken) => EVAuthToken | Promise<EVAuthToken>,
): Promise<void> {
  const token = await readAuthTokenFromCookies();
  if (!token) return;
  await writeAuthTokenCookie(await update(token));
}

