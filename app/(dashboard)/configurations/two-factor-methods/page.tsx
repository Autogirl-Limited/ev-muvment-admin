import type { Metadata } from "next";

import { TwoFactorMethodsPage } from "@/components/configurations/two-factor-methods-page";

export const metadata: Metadata = { title: "Two-factor methods" };

export default function Page() {
  return <TwoFactorMethodsPage />;
}
