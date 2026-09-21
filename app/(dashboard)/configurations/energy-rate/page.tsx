import type { Metadata } from "next";

import { EnergyRatePage } from "@/components/configurations/energy-rate-page";

export const metadata: Metadata = { title: "Energy rate" };

export default function Page() {
  return <EnergyRatePage />;
}
