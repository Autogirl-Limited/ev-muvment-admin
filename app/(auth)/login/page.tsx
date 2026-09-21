import type { Metadata } from "next";

import { AuthPanel } from "@/components/auth/auth-panel";
import { LoginForm } from "@/components/auth/login-form";
import { safeNextPath } from "@/lib/auth/redirect";

export const metadata: Metadata = { title: "Sign in" };

const NOTICES: Record<string, string> = {
  expired: "Your session has expired. Please sign in again.",
  ended: "Your session has ended. Please sign in again.",
  reset: "Your password has been reset. Sign in with your new password.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const reason = typeof params.reason === "string" ? params.reason : undefined;
  const next = typeof params.next === "string" ? params.next : undefined;

  return (
    <AuthPanel title="Welcome back" description="Sign in to your staff account to continue.">
      <LoginForm
        next={next ? safeNextPath(next) : undefined}
        notice={reason ? NOTICES[reason] : undefined}
      />
    </AuthPanel>
  );
}
