import type { Metadata } from "next";

import { GroupDetailPage } from "@/components/configurations/group-detail-page";

export const metadata: Metadata = { title: "Group" };

export default async function Page({ params }: PageProps<"/configurations/groups/[id]">) {
  const { id } = await params;
  return <GroupDetailPage id={id} />;
}
