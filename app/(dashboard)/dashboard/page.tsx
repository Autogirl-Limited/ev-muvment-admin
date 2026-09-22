import type { Metadata } from "next";

import { DashboardPage as DashboardExperience } from "@/components/dashboard/dashboard-page";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return <DashboardExperience />;
}
