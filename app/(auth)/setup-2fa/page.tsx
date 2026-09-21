import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthPanel } from "@/components/auth/auth-panel";
import { TwoFactorOnboarding } from "@/components/security/two-factor-onboarding";
import { DASHBOARD_PATH } from "@/lib/auth/constants";
import { getCurrentUser } from "@/lib/auth/dal";
import { hasTwoFactor } from "@/lib/auth/two-factor";

export const metadata: Metadata = { title: "Set up two-factor authentication" };

export default async function SetupTwoFactorPage() {
  // The real account decides, not the flag cookie the proxy used to get here.
  const user = await getCurrentUser();
  if (hasTwoFactor(user)) redirect(DASHBOARD_PATH);

  return (
    <AuthPanel
      title="Secure your account"
      description="Two-factor authentication is required for all staff. It only takes a minute."
    >
      <TwoFactorOnboarding hasEmail={Boolean(user.email)} />
    </AuthPanel>
  );
}
