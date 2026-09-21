import type { Metadata } from "next";

import { DriversPage } from "@/components/people/drivers-page";

export const metadata: Metadata = { title: "Drivers" };

export default function Page() {
  return <DriversPage />;
}
