import type { Metadata } from "next";

import { PageHeader } from "@/components/dashboard/page-header";
import { getCurrentUser } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await getCurrentUser();

  return <PageHeader title="Dashboard" description={`Welcome back, ${user.first_name}.`} />;
}
