"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSession, signIn } from "next-auth/react";
import { useEffect, useState, useTransition } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CodeField } from "@/components/ui/code-field";
import { Field } from "@/components/ui/field";
import { PasswordField } from "@/components/ui/password-field";
import type { TwoFactorMethod } from "@/lib/api/types";
import { switchLoginTwoFactorMethod } from "@/lib/auth/actions";
import {
  CHANGE_PASSWORD_REQUIRED_PATH,
  DASHBOARD_PATH,
  SETUP_2FA_PATH,
} from "@/lib/auth/constants";
import { hasTwoFactor } from "@/lib/auth/two-factor";
import { advanceToEmptyField } from "@/lib/form-nav";

const RESEND_COOLDOWN_SECONDS = 30;

interface Challenge {
  method: TwoFactorMethod;
  /** Every method the user can finish with, current one first. */
  availableMethods: TwoFactorMethod[];
  token: string;
}

const METHOD_LABELS: Record<TwoFactorMethod, string> = {
  TOTP: "Use your authenticator app",
  EMAIL_OTP: "Email me a code",
};

function maskEmail(identifier: string): string | null {
  const [local, domain] = identifier.split("@");
  if (!domain) return null;
  return `${local.slice(0, 1)}***@${domain}`;
}

export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [code, setCode] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [info, setInfo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  function landingPath(session: Awaited<ReturnType<typeof getSession>>): string {
    if (session?.hasChangedTemporaryPassword === false) return CHANGE_PASSWORD_REQUIRED_PATH;
    if (session?.user && !hasTwoFactor(session.user)) return SETUP_2FA_PATH;
    return next ?? DASHBOARD_PATH;
  }

  async function loadChallengeFromSession() {
    const session = await getSession();
    if (session?.authStep === "two_factor" && session.twoFactorChallenge) {
      const { method, availableMethods, token } = session.twoFactorChallenge;
      setChallenge({ method, availableMethods: availableMethods ?? [method], token });
      setPassword(""); // not needed past this step: switching/resending use the challenge
      return true;
    }
    if (session?.authStep === "authenticated") {
      router.replace(landingPath(session));
      return true;
    }
    return false;
  }

  function backToCredentials(message: string | null) {
    setChallenge(null);
    setCode("");
    setPassword("");
    setFieldErrors({});
    setInfo(null);
    setError(message);
  }

  function submitCredentials(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    const trimmedIdentifier = identifier.trim();
    const nextFieldErrors: Record<string, string> = {};
    if (!trimmedIdentifier) nextFieldErrors.identifier = "Enter your username, email or phone number.";
    if (!password) nextFieldErrors.password = "Enter your password.";
    if (Object.keys(nextFieldErrors).length) {
      setFieldErrors(nextFieldErrors);
      return;
    }

    startTransition(async () => {
      const result = await signIn("credentials", {
        redirect: false,
        mode: "password",
        identifier: trimmedIdentifier,
        password,
      });
      if (result?.error) {
        setError(result.error);
        return;
      }
      if (await loadChallengeFromSession()) setCooldown(RESEND_COOLDOWN_SECONDS);
    });
  }

  function submitCode(value: string) {
    if (!challenge || pending) return;
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const result = await signIn("credentials", {
        redirect: false,
        mode: "twoFactor",
        method: challenge.method,
        challengeToken: challenge.token,
        code: value.trim(),
      });
      if (result?.error?.toLowerCase().includes("login challenge")) {
        backToCredentials("Your verification expired. Please sign in again.");
        return;
      }
      if (result?.error) {
        setCode("");
        setError(result.error);
        return;
      }
      const session = await getSession();
      router.replace(landingPath(session));
    });
  }

  /** Switches the challenge to `method`; with the current email method, this resends the code. */
  function chooseMethod(method: TwoFactorMethod) {
    if (!challenge || pending) return;
    const resending = method === challenge.method;
    if (resending && cooldown > 0) return;
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const result = await switchLoginTwoFactorMethod({ method });
      if (!result.ok) {
        if (result.challengeExpired) backToCredentials("Your verification expired. Please sign in again.");
        else setError(result.message);
        return;
      }
      setChallenge({ ...challenge, method: result.data.method, availableMethods: result.data.availableMethods });
      setCode("");
      if (result.data.method === "EMAIL_OTP") {
        setCooldown(RESEND_COOLDOWN_SECONDS);
        setInfo(resending ? "We've sent a new code." : "We've emailed you a code.");
      }
    });
  }

  if (challenge) {
    const isTotp = challenge.method === "TOTP";
    const masked = maskEmail(identifier.trim());
    const otherMethods = challenge.availableMethods.filter((method) => method !== challenge.method);

    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submitCode(code);
        }}
        className="space-y-5"
        noValidate
      >
        <p className="text-sm text-muted">
          {isTotp
            ? "Enter the 6-digit code from your authenticator app."
            : `Enter the 6-digit code we emailed to ${masked ?? "the email address on your account"}.`}
        </p>

        {error && <Alert tone="error">{error}</Alert>}
        {info && <Alert tone="success">{info}</Alert>}

        <CodeField
          label="Verification code"
          value={code}
          onChange={setCode}
          onComplete={submitCode}
          disabled={pending}
          autoFocus
        />

        <Button type="submit" fullWidth loading={pending} disabled={code.length !== 6}>
          Verify
        </Button>

        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={() => backToCredentials(null)}
            className="text-muted hover:text-foreground"
          >
            Back to sign in
          </button>
          {!isTotp && (
            <button
              type="button"
              onClick={() => chooseMethod(challenge.method)}
              disabled={cooldown > 0 || pending}
              className="font-medium text-brand hover:underline disabled:cursor-not-allowed disabled:text-muted disabled:no-underline"
            >
              {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
            </button>
          )}
        </div>

        {otherMethods.length > 0 && (
          <div className="border-t border-border pt-4 text-center text-sm">
            <p className="text-muted">Can&apos;t use this method?</p>
            <div className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1">
              {otherMethods.map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => chooseMethod(method)}
                  disabled={pending}
                  className="font-medium text-brand hover:underline disabled:cursor-not-allowed disabled:text-muted disabled:no-underline"
                >
                  {METHOD_LABELS[method]}
                </button>
              ))}
            </div>
          </div>
        )}
      </form>
    );
  }

  return (
    <form onSubmit={submitCredentials} onKeyDown={advanceToEmptyField} className="space-y-4" noValidate>
      {notice && <Alert tone="info">{notice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      <Field
        label="Username, email or phone"
        name="identifier"
        enterKeyHint="next"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        autoFocus
        value={identifier}
        onChange={(event) => setIdentifier(event.target.value)}
        error={fieldErrors.identifier}
        disabled={pending}
      />
      <PasswordField
        label="Password"
        name="password"
        enterKeyHint="go"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        error={fieldErrors.password}
        disabled={pending}
      />

      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm font-medium text-brand hover:underline">
          Forgot password?
        </Link>
      </div>

      <Button type="submit" fullWidth loading={pending}>
        Sign in
      </Button>
    </form>
  );
}
