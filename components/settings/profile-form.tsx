"use client";

import { useState, useTransition } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import type { User } from "@/lib/api/types";
import { updateProfile } from "@/lib/auth/actions";
import { ROLE_LABELS } from "@/lib/navigation";

const READ_ONLY_HINT = "Contact an admin to change this.";

export function ProfileForm({ user }: { user: User }) {
  const [firstName, setFirstName] = useState(user.first_name);
  const [lastName, setLastName] = useState(user.last_name);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const dirty = firstName.trim() !== user.first_name || lastName.trim() !== user.last_name;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateProfile({ firstName, lastName });
      if (!result.ok) {
        setError(result.message || null);
        setFieldErrors(result.fieldErrors);
        return;
      }
      setFieldErrors({});
      setSaved(true);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error && <Alert tone="error">{error}</Alert>}
      {saved && <Alert tone="success">Profile updated.</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="First name"
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
          error={fieldErrors.firstName}
          maxLength={100}
          disabled={pending}
        />
        <Field
          label="Last name"
          value={lastName}
          onChange={(event) => setLastName(event.target.value)}
          error={fieldErrors.lastName}
          maxLength={100}
          disabled={pending}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Username" value={user.username} readOnly hint={READ_ONLY_HINT} />
        <Field label="Email" value={user.email ?? "—"} readOnly hint={READ_ONLY_HINT} />
        <Field label="Phone" value={user.phone_number ?? "—"} readOnly hint={READ_ONLY_HINT} />
        <Field label="Role" value={ROLE_LABELS[user.user_type]} readOnly hint={READ_ONLY_HINT} />
      </div>

      <Button type="submit" loading={pending} disabled={!dirty}>
        Save changes
      </Button>
    </form>
  );
}
