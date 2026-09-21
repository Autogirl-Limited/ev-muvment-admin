/**
 * Reads the `exp` claim of a JWT, in milliseconds. This does NOT verify the
 * signature; it is only used to decide when to refresh. The API remains the
 * authority on whether a token is valid.
 */
export function jwtExpiry(token: string | undefined): number | null {
  if (!token) return null;
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof claims.exp === "number" ? claims.exp * 1000 : null;
  } catch {
    return null;
  }
}
