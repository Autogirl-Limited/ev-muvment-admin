import { redirect } from "next/navigation";

import { DASHBOARD_PATH } from "@/lib/auth/constants";

// proxy.ts redirects signed-out visitors to /login before this renders.
export default function Home() {
  redirect(DASHBOARD_PATH);
}
