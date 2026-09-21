import type { Metadata } from "next";

import { DriverDetailPage } from "@/components/people/driver-detail-page";

export const metadata: Metadata = { title: "Driver" };

export default async function Page({ params }: PageProps<"/drivers/[id]">) {
  const { id } = await params;
  return <DriverDetailPage id={id} />;
}
