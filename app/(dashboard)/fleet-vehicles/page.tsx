import type { Metadata } from "next";

import { FleetVehiclesPage } from "@/components/fleet-vehicles/fleet-vehicles-page";

export const metadata: Metadata = { title: "Fleet vehicles" };

export default function Page() {
  return <FleetVehiclesPage />;
}
