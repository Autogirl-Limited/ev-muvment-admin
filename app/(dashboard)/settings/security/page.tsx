import type { Metadata } from "next";

import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { PageHeader } from "@/components/dashboard/page-header";
import { SecuritySettings } from "@/components/settings/security-settings";
import { getCurrentUser } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Security" };

export default async function SecurityPage() {
  // Uncached on purpose: the 2FA flags must reflect the change just made.
  const user = await getCurrentUser();

  return (
    <div className="max-w-2xl space-y-8">
      <PageHeader title="Security" description="Manage your password and two-factor sign-in." />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Password</h2>
        <div className="max-w-md rounded-xl border border-border bg-surface p-5 sm:p-6">
          <ChangePasswordForm />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Two-factor authentication</h2>
        <SecuritySettings
          emailOtpEnabled={user.two_factor_enabled}
          totpEnabled={user.totp_enabled}
          hasEmail={Boolean(user.email)}
        />
      </section>
    </div>
  );
}
