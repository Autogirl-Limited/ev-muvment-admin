import type { Metadata } from "next";

import { StaffPage } from "@/components/people/staff-page";

export const metadata: Metadata = { title: "Staff" };

export default function Page() {
  return <StaffPage />;
}
