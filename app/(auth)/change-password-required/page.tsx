import type { Metadata } from "next";

import { AuthCard } from "@/components/auth/auth-card";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { SignOutButton } from "@/components/auth/sign-out-button";

export const metadata: Metadata = { title: "Set your password" };

export default function ChangePasswordRequiredPage() {
  return (
    <AuthCard
      title="Set your password"
      description="You're signed in with a temporary password. Choose your own to continue."
      footer={<SignOutButton variant="link">Sign out</SignOutButton>}
    >
      <ChangePasswordForm forced />
    </AuthCard>
  );
}
