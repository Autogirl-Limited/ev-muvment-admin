import type { Metadata } from "next";

import { BoltReconciliationsPage } from "@/components/bolt-reconciliations/reconciliations-page";

export const metadata: Metadata = { title: "Bolt reconciliation" };

export default function Page() {
  return <BoltReconciliationsPage />;
}
