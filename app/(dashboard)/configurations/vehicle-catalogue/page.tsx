import type { Metadata } from "next";

import { VehicleCataloguePage } from "@/components/configurations/vehicle-catalogue-page";

export const metadata: Metadata = { title: "Vehicle catalogue" };

export default function Page() {
  return <VehicleCataloguePage />;
}
