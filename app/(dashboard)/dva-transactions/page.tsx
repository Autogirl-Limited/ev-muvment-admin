import type { Metadata } from "next";

import { DvaTransactionsPage } from "@/components/dva-transactions/dva-transactions-page";

export const metadata: Metadata = { title: "DVA transactions" };

export default function Page() {
  return <DvaTransactionsPage />;
}
