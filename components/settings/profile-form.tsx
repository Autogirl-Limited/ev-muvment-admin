"use client";

import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { ApiError } from "@/lib/api/browser";
import { ROLE_LABELS } from "@/lib/navigation";
import { useCurrentUser, useUpdateProfile } from "@/lib/query/user";

const READ_ONLY_HINT = "Contact an admin to change this.";
const NAME_ERROR = "Must be 1–100 characters.";

const validName = (value: string) => value.length >= 1 && value.length <= 100;

export function ProfileForm() {
  const user = useCurrentUser();
  const update = useUpdateProfile();

  const [firstName, setFirstName] = useState(user.first_name);
  const [lastName, setLastName] = useState(user.last_name);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});

  const dirty = firstName.trim() !== user.first_name || lastName.trim() !== user.last_name;
  const apiError = update.error instanceof ApiError ? update.error : null;
  const fieldErrors = { ...apiError?.fieldErrors, ...clientErrors };
  // A field-level 422 is shown under its input; anything else goes in the alert.
  const formError =
    update.error && !Object.keys(fieldErrors).length ? update.error.message : null;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const first = firstName.trim();
    const last = lastName.trim();

    const errors: Record<string, string> = {
      ...(!validName(first) && { first_name: NAME_ERROR }),
      ...(!validName(last) && { last_name: NAME_ERROR }),
    };
    setClientErrors(errors);
    if (Object.keys(errors).length) return;

    update.mutate({ first_name: first, last_name: last });
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {formError && <Alert tone="error">{formError}</Alert>}
      {update.isSuccess && !dirty && <Alert tone="success">Profile updated.</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="First name"
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
          error={fieldErrors.first_name}
          maxLength={100}
          disabled={update.isPending}
        />
        <Field
          label="Last name"
          value={lastName}
          onChange={(event) => setLastName(event.target.value)}
          error={fieldErrors.last_name}
          maxLength={100}
          disabled={update.isPending}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Username" value={user.username} readOnly hint={READ_ONLY_HINT} />
        <Field label="Email" value={user.email ?? "—"} readOnly hint={READ_ONLY_HINT} />
        <Field label="Phone" value={user.phone_number ?? "—"} readOnly hint={READ_ONLY_HINT} />
        <Field label="Role" value={ROLE_LABELS[user.user_type]} readOnly hint={READ_ONLY_HINT} />
      </div>

      <Button type="submit" loading={update.isPending} disabled={!dirty}>
        Save changes
      </Button>
    </form>
  );
}
