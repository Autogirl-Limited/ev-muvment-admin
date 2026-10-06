import type { Metadata } from "next";

import { LotGridsPage } from "@/components/configurations/lotgrids-page";

export const metadata: Metadata = { title: "LotGrids" };

export default function Page() {
  return <LotGridsPage />;
}
