import type { Metadata } from "next";

import { StaffDetailPage } from "@/components/people/staff-detail-page";

export const metadata: Metadata = { title: "Staff member" };

export default async function Page({ params }: PageProps<"/staff/[id]">) {
  const { id } = await params;
  return <StaffDetailPage id={id} />;
}
