import type { Metadata } from "next";

import { PickupRequestsPage } from "@/components/pickup-requests/pickup-requests-page";

export const metadata: Metadata = { title: "Pick-up requests" };

export default function Page() {
  return <PickupRequestsPage />;
}
