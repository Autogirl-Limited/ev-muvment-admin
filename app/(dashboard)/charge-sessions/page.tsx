import type { Metadata } from "next";

import { ChargeSessionsPage } from "@/components/charge-sessions/charge-sessions-page";

export const metadata: Metadata = { title: "Charge sessions" };

export default function Page() {
  return <ChargeSessionsPage />;
}
