import type { Metadata } from "next";

import { ConfigurationsHub } from "@/components/configurations/configurations-hub";

export const metadata: Metadata = { title: "Configurations" };

export default function Page() {
  return <ConfigurationsHub />;
}
