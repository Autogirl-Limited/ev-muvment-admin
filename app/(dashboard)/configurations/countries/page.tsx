import type { Metadata } from "next";

import { CountriesPage } from "@/components/configurations/countries-page";

export const metadata: Metadata = { title: "Countries" };

export default function Page() {
  return <CountriesPage />;
}
