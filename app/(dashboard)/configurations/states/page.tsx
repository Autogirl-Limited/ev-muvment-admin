import type { Metadata } from "next";

import { StatesPage } from "@/components/configurations/states-page";

export const metadata: Metadata = { title: "States" };

export default function Page() {
  return <StatesPage />;
}
