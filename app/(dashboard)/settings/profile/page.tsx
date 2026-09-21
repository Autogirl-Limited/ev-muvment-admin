import type { Metadata } from "next";

import { PageHeader } from "@/components/dashboard/page-header";
import { ProfileForm } from "@/components/settings/profile-form";
import { getCurrentUser } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const user = await getCurrentUser();

  return (
    <div className="max-w-2xl">
      <PageHeader title="Profile" description="Your account details." />
      <div className="rounded-xl border border-border bg-surface p-5 sm:p-6">
        <ProfileForm user={user} />
      </div>
    </div>
  );
}
