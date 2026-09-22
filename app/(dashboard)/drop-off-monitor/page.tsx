import type { Metadata } from "next";

import { DropOffMonitorPage } from "@/components/drop-off-monitor/drop-off-monitor-page";

export const metadata: Metadata = { title: "Drop-off monitor" };

export default function Page() {
  return <DropOffMonitorPage />;
}
