import type { Metadata } from "next";

import { DriverApplicationsPage } from "@/components/driver-applications/driver-applications-page";

export const metadata: Metadata = { title: "Driver applications" };

export default function Page() {
  return <DriverApplicationsPage />;
}
