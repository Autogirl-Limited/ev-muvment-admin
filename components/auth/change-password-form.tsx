"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/ui/password-field";
import { changePassword } from "@/lib/auth/actions";
import { advanceToEmptyField } from "@/lib/form-nav";
import { DASHBOARD_PATH } from "@/lib/auth/constants";

/**
 * `forced` is the first-login flow: the user is on a temporary password and
 * is taken to the dashboard once they've set their own.
 */
export function ChangePasswordForm({ forced = false }: { forced?: boolean }) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!done || !forced) return;
    const timer = setTimeout(() => router.replace(DASHBOARD_PATH), 1200);
    return () => clearTimeout(timer);
  }, [done, forced, router]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setDone(false);

    if (next !== confirm) {
      setFieldErrors({ confirm: "Passwords don't match." });
      return;
    }
    setFieldErrors({});

    startTransition(async () => {
      const result = await changePassword({ currentPassword: current, newPassword: next });
      if (!result.ok) {
        setError(result.message || null);
        setFieldErrors(result.fieldErrors);
        return;
      }
      setDone(true);
      if (!forced) {
        setCurrent("");
        setNext("");
        setConfirm("");
      }
    });
  }

  return (
    <form onSubmit={submit} onKeyDown={advanceToEmptyField} className="space-y-4" noValidate>
      {error && <Alert tone="error">{error}</Alert>}
      {done && (
        <Alert tone="success">
          {forced ? "Password updated. Taking you to the dashboard…" : "Password updated."}
        </Alert>
      )}

      <PasswordField
        label={forced ? "Temporary password" : "Current password"}
        name="current-password"
        autoComplete="current-password"
        value={current}
        onChange={(event) => setCurrent(event.target.value)}
        error={fieldErrors.currentPassword}
        disabled={pending || (done && forced)}
      />
      <PasswordField
        label="New password"
        name="new-password"
        autoComplete="new-password"
        showStrength
        value={next}
        onChange={(event) => setNext(event.target.value)}
        error={fieldErrors.newPassword}
        hint="8–128 characters, different from your current password."
        disabled={pending || (done && forced)}
      />
      <PasswordField
        label="Confirm new password"
        name="confirm-password"
        autoComplete="new-password"
        value={confirm}
        onChange={(event) => setConfirm(event.target.value)}
        error={fieldErrors.confirm}
        disabled={pending || (done && forced)}
      />

      <Button type="submit" fullWidth={forced} loading={pending} disabled={done && forced}>
        {forced ? "Set password" : "Update password"}
      </Button>
    </form>
  );
}
