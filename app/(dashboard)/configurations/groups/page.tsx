import type { Metadata } from "next";

import { GroupsPage } from "@/components/configurations/groups-page";

export const metadata: Metadata = { title: "Groups" };

export default function Page() {
  return <GroupsPage />;
}
