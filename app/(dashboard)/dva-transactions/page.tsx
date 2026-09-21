import type { Metadata } from "next";

import { DvaTransactionsPage } from "@/components/dva-transactions/dva-transactions-page";

export const metadata: Metadata = { title: "Transactions" };

export default function Page() {
  return <DvaTransactionsPage />;
}
