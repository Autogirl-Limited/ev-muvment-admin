import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthPanel } from "@/components/auth/auth-panel";
import { NoTwoFactorMethods, TwoFactorOnboarding } from "@/components/security/two-factor-onboarding";
import type { TwoFactorMethod } from "@/lib/api/types";
import { DASHBOARD_PATH } from "@/lib/auth/constants";
import { getCurrentUser, getTwoFactorMethods } from "@/lib/auth/dal";
import { hasTwoFactor } from "@/lib/auth/two-factor";

export const metadata: Metadata = { title: "Set up two-factor authentication" };

export default async function SetupTwoFactorPage() {
  // The real account decides, not the flag cookie the proxy used to get here.
  const user = await getCurrentUser();
  if (hasTwoFactor(user)) redirect(DASHBOARD_PATH);

  // Only methods an admin currently offers can be set up.
  const { methods } = await getTwoFactorMethods();
  const offered = (method: TwoFactorMethod) =>
    methods.some((option) => option.method === method && option.is_available);

  if (!offered("TOTP") && !offered("EMAIL_OTP")) {
    return (
      <AuthPanel
        title="Two-factor authentication is unavailable"
        description="An administrator has turned off every two-factor method, so there's nothing to set up right now."
      >
        <NoTwoFactorMethods />
      </AuthPanel>
    );
  }

  return (
    <AuthPanel
      title="Secure your account"
      description="Two-factor authentication is required for all staff. It only takes a minute."
    >
      <TwoFactorOnboarding
        hasEmail={Boolean(user.email)}
        totpAvailable={offered("TOTP")}
        emailAvailable={offered("EMAIL_OTP")}
      />
    </AuthPanel>
  );
}
