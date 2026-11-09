import type { Metadata } from "next";

import { VehicleTrackingPage } from "@/components/vehicle-tracking/vehicle-tracking-page";

export const metadata: Metadata = { title: "Live vehicle tracking" };

export default function Page() {
  return <VehicleTrackingPage />;
}
