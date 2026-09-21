import type { User } from "@/lib/api/types";

/** Policy: every staff member must have at least one second factor. */
export function hasTwoFactor(user: Pick<User, "two_factor_enabled" | "totp_enabled">): boolean {
  return user.two_factor_enabled || user.totp_enabled;
}
