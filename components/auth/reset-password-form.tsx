"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CodeField } from "@/components/ui/code-field";
import { Field } from "@/components/ui/field";
import { PasswordField } from "@/components/ui/password-field";
import { resetPassword } from "@/lib/auth/actions";
import { RESET_IDENTIFIER_KEY } from "@/lib/auth/constants";

const subscribe = () => () => {};
function readStoredIdentifier(): string {
  try {
    return sessionStorage.getItem(RESET_IDENTIFIER_KEY) ?? "";
  } catch {
    return "";
  }
}

export function ResetPasswordForm() {
  const router = useRouter();

  // Server renders "", the client swaps in the stored value after hydration.
  const stored = useSyncExternalStore(subscribe, readStoredIdentifier, () => "");
  const [typedIdentifier, setTypedIdentifier] = useState<string | null>(null);
  const identifier = typedIdentifier ?? stored;

  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (newPassword !== confirm) {
      setFieldErrors({ confirm: "Passwords don't match." });
      return;
    }
    setFieldErrors({});

    startTransition(async () => {
      const result = await resetPassword({ identifier, code, newPassword });
      if (!result.ok) {
        setError(result.message || null);
        setFieldErrors(result.fieldErrors);
        return;
      }
      try {
        sessionStorage.removeItem(RESET_IDENTIFIER_KEY);
      } catch {}
      // Every session for the account was signed out, so start fresh.
      router.replace("/login?reason=reset");
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error && (
        <Alert tone="error">
          {error}{" "}
          {error.toLowerCase().includes("code") && (
            <Link href="/forgot-password" className="font-medium underline">
              Send a new code
            </Link>
          )}
        </Alert>
      )}

      <Field
        label="Username, email or phone"
        name="identifier"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        value={identifier}
        onChange={(event) => setTypedIdentifier(event.target.value)}
        error={fieldErrors.identifier}
        hint="Use the same one you entered when requesting the code."
        disabled={pending}
      />
      <CodeField
        label="Reset code"
        value={code}
        onChange={setCode}
        error={fieldErrors.code}
        disabled={pending}
      />
      <PasswordField
        label="New password"
        name="new-password"
        autoComplete="new-password"
        value={newPassword}
        onChange={(event) => setNewPassword(event.target.value)}
        error={fieldErrors.newPassword}
        hint="8–128 characters."
        disabled={pending}
      />
      <PasswordField
        label="Confirm new password"
        name="confirm-password"
        autoComplete="new-password"
        value={confirm}
        onChange={(event) => setConfirm(event.target.value)}
        error={fieldErrors.confirm}
        disabled={pending}
      />

      <Button type="submit" fullWidth loading={pending}>
        Reset password
      </Button>
    </form>
  );
}
