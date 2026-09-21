import type { Metadata } from "next";

import { ChecklistSettingsPage } from "@/components/configurations/checklist-settings-page";

export const metadata: Metadata = { title: "Checklist settings" };

export default function Page() {
  return <ChecklistSettingsPage />;
}
