"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { EmailOtpSetup, TotpSetup, useSubmit } from "@/components/security/two-factor-setup";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Alert } from "@/components/ui/alert";
import type { TotpSetupResponse } from "@/lib/api/types";
import { requestEmailOtp, setupTotp } from "@/lib/auth/actions";
import { DASHBOARD_PATH } from "@/lib/auth/constants";

type Step =
  | { name: "choose" }
  | { name: "totp"; setup: TotpSetupResponse }
  | { name: "email" }
  | { name: "done" };

/**
 * Mandatory two-factor setup, shown right after sign-in until the user has
 * turned on a method. Picking a method starts it straight away (generates the
 * secret / sends the code), so the next screen is already useful.
 */
export function TwoFactorOnboarding({ hasEmail }: { hasEmail: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ name: "choose" });
  const [picking, setPicking] = useState<"totp" | "email" | null>(null);
  const { error, pending, run } = useSubmit();

  useEffect(() => {
    if (step.name !== "done") return;
    const timer = setTimeout(() => router.replace(DASHBOARD_PATH), 1200);
    return () => clearTimeout(timer);
  }, [step.name, router]);

  const backToChoice = () => {
    setPicking(null);
    setStep({ name: "choose" });
  };
  const finished = () => setStep({ name: "done" });

  if (step.name === "done") {
    return <Alert tone="success">Two-factor authentication is on. Taking you to the dashboard…</Alert>;
  }

  if (step.name === "totp") {
    return (
      <div className="space-y-4">
        <TotpSetup layout="page" initialSetup={step.setup} onDone={finished} onCancel={backToChoice} />
      </div>
    );
  }

  if (step.name === "email") {
    return (
      <div className="space-y-4">
        <EmailOtpSetup layout="page" initialSent onDone={finished} onCancel={backToChoice} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}

      <MethodOption
        title="Authenticator app"
        badge="Recommended"
        description="Use Google Authenticator, 1Password or Authy to generate a code each time you sign in."
        loading={pending && picking === "totp"}
        disabled={pending}
        onClick={() => {
          setPicking("totp");
          run(setupTotp, (setup) => setStep({ name: "totp", setup }));
        }}
      />
      <MethodOption
        title="Email code"
        description="We email you a 6-digit code each time you sign in."
        loading={pending && picking === "email"}
        disabled={pending || !hasEmail}
        note={hasEmail ? undefined : "Your account has no email address."}
        onClick={() => {
          setPicking("email");
          run(requestEmailOtp, () => setStep({ name: "email" }));
        }}
      />

      <p className="pt-2 text-center text-sm text-muted">
        Not now? You&apos;ll need to finish this to use the dashboard.{" "}
        <SignOutButton variant="link">Sign out</SignOutButton>
      </p>
    </div>
  );
}

function MethodOption({
  title,
  description,
  badge,
  note,
  loading,
  disabled,
  onClick,
}: {
  title: string;
  description: string;
  badge?: string;
  note?: string;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={loading || undefined}
      className="group flex w-full items-center gap-4 rounded-xl border border-border bg-surface p-4 text-left transition hover:border-brand hover:bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border disabled:hover:bg-surface"
    >
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{title}</span>
          {badge && (
            <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand">
              {badge}
            </span>
          )}
        </span>
        <span className="mt-1 block text-sm text-muted">{description}</span>
        {note && <span className="mt-1 block text-xs text-muted">{note}</span>}
      </span>
      {loading ? (
        <span
          aria-hidden
          className="size-5 shrink-0 animate-spin rounded-full border-2 border-brand border-t-transparent"
        />
      ) : (
        <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-brand" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m9 6 6 6-6 6" />
        </svg>
      )}
    </button>
  );
}
