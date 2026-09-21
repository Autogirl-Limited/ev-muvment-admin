import type { Metadata } from "next";

import { NotificationDetailPage } from "@/components/notifications/notification-detail-page";

export const metadata: Metadata = { title: "Notification" };

export default async function Page({ params }: PageProps<"/notifications/[id]">) {
  const { id } = await params;
  return <NotificationDetailPage id={id} />;
}
