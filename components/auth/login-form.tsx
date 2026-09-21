"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CodeField } from "@/components/ui/code-field";
import { Field } from "@/components/ui/field";
import { PasswordField } from "@/components/ui/password-field";
import type { TwoFactorMethod } from "@/lib/api/types";
import { login, verifyTwoFactor } from "@/lib/auth/actions";

const RESEND_COOLDOWN_SECONDS = 30;

interface Challenge {
  method: TwoFactorMethod;
  token: string;
}

function maskEmail(identifier: string): string | null {
  const [local, domain] = identifier.split("@");
  if (!domain) return null;
  return `${local.slice(0, 1)}***@${domain}`;
}

export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const [identifier, setIdentifier] = useState("");
  // Held in memory only, and only so "Resend code" can re-run the password step.
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
    startTransition(async () => {
      const result = await login({ identifier, password, next });
      // On success without 2FA the action redirects and never returns here.
      if (!result) return;
      if (!result.ok) {
        setError(result.message || null);
        setFieldErrors(result.fieldErrors);
        return;
      }
      setChallenge({ method: result.data.method, token: result.data.challengeToken });
      setCooldown(RESEND_COOLDOWN_SECONDS);
    });
  }

  function submitCode(value: string) {
    if (!challenge || pending) return;
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const result = await verifyTwoFactor({
        method: challenge.method,
        challengeToken: challenge.token,
        code: value,
        next,
      });
      if (!result) return; // redirected
      if (result.ok) return;
      if (result.challengeExpired) {
        backToCredentials("Your verification expired. Please sign in again.");
        return;
      }
      setCode("");
      setError(result.message || null);
    });
  }

  function resendCode() {
    if (!challenge || cooldown > 0 || pending) return;
    setError(null);
    setInfo(null);
    startTransition(async () => {
      // There's no resend endpoint: signing in again emails a fresh code and
      // returns a new challenge token that supersedes the old one.
      const result = await login({ identifier, password, next });
      if (!result) return;
      if (!result.ok) {
        setError(result.message || null);
        return;
      }
      setChallenge({ method: result.data.method, token: result.data.challengeToken });
      setCode("");
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setInfo("We've sent a new code.");
    });
  }

  if (challenge) {
    const isTotp = challenge.method === "TOTP";
    const masked = maskEmail(identifier.trim());

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
              onClick={resendCode}
              disabled={cooldown > 0 || pending}
              className="font-medium text-brand hover:underline disabled:cursor-not-allowed disabled:text-muted disabled:no-underline"
            >
              {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
            </button>
          )}
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={submitCredentials} className="space-y-4" noValidate>
      {notice && <Alert tone="info">{notice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      <Field
        label="Username, email or phone"
        name="identifier"
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
