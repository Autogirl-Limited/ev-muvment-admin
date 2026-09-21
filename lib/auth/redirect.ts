import { PUBLIC_PATHS, CHANGE_PASSWORD_REQUIRED_PATH, DASHBOARD_PATH } from "./constants";

/**
 * Validates a post-login destination taken from user-controlled input.
 * Only same-origin absolute paths are allowed, so `?next=` can't be used as an
 * open redirect.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return DASHBOARD_PATH;
  }
  const pathname = next.split(/[?#]/)[0];
  if (
    pathname === "/" ||
    pathname.startsWith("/api/") ||
    pathname === CHANGE_PASSWORD_REQUIRED_PATH ||
    PUBLIC_PATHS.includes(pathname)
  ) {
    return DASHBOARD_PATH;
  }
  return next;
}
