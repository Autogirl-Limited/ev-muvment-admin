"use client";

import { PageHeader } from "@/components/dashboard/page-header";
import { useCurrentUser } from "@/lib/query/user";

export function DashboardWelcome() {
  const user = useCurrentUser();
  return <PageHeader title="Dashboard" description={`Welcome back, ${user.first_name}.`} />;
}
