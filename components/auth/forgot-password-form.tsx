"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { forgotPassword } from "@/lib/auth/actions";
import { RESET_IDENTIFIER_KEY } from "@/lib/auth/constants";

export function ForgotPasswordForm() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldError(undefined);
    startTransition(async () => {
      const result = await forgotPassword({ identifier });
      if (!result.ok) {
        setError(result.message || null);
        setFieldError(result.fieldErrors.identifier);
        return;
      }
      // The reset step must send the same identifier, so carry it across.
      try {
        sessionStorage.setItem(RESET_IDENTIFIER_KEY, identifier.trim());
      } catch {
        // Storage unavailable; the reset form lets the user retype it.
      }
      router.push("/reset-password");
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
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
        error={fieldError}
        disabled={pending}
      />
      <Button type="submit" fullWidth loading={pending}>
        Send reset code
      </Button>
    </form>
  );
}
