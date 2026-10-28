import type { Metadata } from "next";

import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { PageHeader } from "@/components/dashboard/page-header";
import { PasskeySettings } from "@/components/settings/passkey-settings";
import { SecuritySettings } from "@/components/settings/security-settings";

export const metadata: Metadata = { title: "Security" };

export default function SecurityPage() {
  return (
    <div className="max-w-2xl space-y-8">
      <PageHeader title="Security" description="Manage your password, fingerprint sign-in and two-factor sign-in." />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Password</h2>
        <div className="max-w-md rounded-xl border border-border bg-surface p-5 sm:p-6">
          <ChangePasswordForm />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Fingerprint or face sign-in</h2>
        <PasskeySettings />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Two-factor authentication</h2>
        <SecuritySettings />
      </section>
    </div>
  );
}
