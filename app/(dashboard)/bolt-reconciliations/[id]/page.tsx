import type { Metadata } from "next";

import { BoltReconciliationDetailPage } from "@/components/bolt-reconciliations/reconciliation-detail-page";

export const metadata: Metadata = { title: "Bolt report" };

export default async function Page({ params }: PageProps<"/bolt-reconciliations/[id]">) {
  const { id } = await params;
  return <BoltReconciliationDetailPage id={id} />;
}
