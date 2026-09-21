import type { Metadata } from "next";

import { PageHeader } from "@/components/dashboard/page-header";
import { ProfileForm } from "@/components/settings/profile-form";

export const metadata: Metadata = { title: "Profile" };

export default function ProfilePage() {
  return (
    <div className="max-w-2xl">
      <PageHeader title="Profile" description="Your account details." />
      <div className="rounded-xl border border-border bg-surface p-5 sm:p-6">
        <ProfileForm />
      </div>
    </div>
  );
}
