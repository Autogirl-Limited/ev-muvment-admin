"use client";

import { useState, type ReactNode } from "react";

import { EmailOtpSetup, TotpSetup, useSubmit } from "@/components/security/two-factor-setup";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal, ModalActions } from "@/components/ui/modal";
import { PasswordField } from "@/components/ui/password-field";
import type { ActionResult } from "@/lib/auth/action-result";
import { disableEmailOtp, disableTotp } from "@/lib/auth/actions";
import { useCurrentUser, useInvalidateCurrentUser } from "@/lib/query/user";

type Dialog = "enable-email" | "disable-email" | "enable-totp" | "disable-totp" | null;

const LAST_METHOD_NOTE = "Required: turn on another method before you can disable this one.";

export function SecuritySettings() {
  const user = useCurrentUser();
  const refreshUser = useInvalidateCurrentUser();
  const emailOtpEnabled = user.two_factor_enabled;
  const totpEnabled = user.totp_enabled;
  const hasEmail = Boolean(user.email);
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);
  const done = () => {
    refreshUser();
    close();
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Two-factor authentication is required for all staff. Keep at least one method turned on.
      </p>

      <MethodCard
        title="Email verification"
        description="Get a 6-digit code by email each time you sign in."
        enabled={emailOtpEnabled}
        action={
          emailOtpEnabled ? (
            // Policy: the last remaining method can't be turned off.
            <Button
              variant="secondary"
              disabled={!totpEnabled}
              onClick={() => setDialog("disable-email")}
            >
              Disable
            </Button>
          ) : (
            <Button onClick={() => setDialog("enable-email")} disabled={!hasEmail}>
              Enable
            </Button>
          )
        }
        note={
          !hasEmail && !emailOtpEnabled
            ? "Your account needs an email address first."
            : emailOtpEnabled && !totpEnabled
              ? LAST_METHOD_NOTE
              : undefined
        }
      />

      <MethodCard
        title="Authenticator app"
        description="Use an app such as Google Authenticator, 1Password or Authy to generate sign-in codes. If both methods are on, the app takes priority."
        enabled={totpEnabled}
        action={
          totpEnabled ? (
            <Button
              variant="secondary"
              disabled={!emailOtpEnabled}
              onClick={() => setDialog("disable-totp")}
            >
              Disable
            </Button>
          ) : (
            // Only offered while off: running setup while on replaces the secret
            // and locks the user out of their existing authenticator entry.
            <Button onClick={() => setDialog("enable-totp")}>Set up</Button>
          )
        }
        note={totpEnabled && !emailOtpEnabled ? LAST_METHOD_NOTE : undefined}
      />

      <Modal open={dialog === "enable-email"} onClose={close} title="Enable email verification">
        <EmailOtpSetup layout="modal" onDone={done} onCancel={close} />
      </Modal>
      <Modal open={dialog === "enable-totp"} onClose={close} title="Set up authenticator app">
        <TotpSetup layout="modal" onDone={done} onCancel={close} />
      </Modal>
      <DisableDialog
        open={dialog === "disable-email"}
        onClose={close}
        onDone={done}
        title="Disable email verification"
        submit={(password) => disableEmailOtp({ password })}
      />
      <DisableDialog
        open={dialog === "disable-totp"}
        onClose={close}
        onDone={done}
        title="Disable authenticator app"
        submit={(password) => disableTotp({ password })}
      />
    </div>
  );
}

function MethodCard({
  title,
  description,
  enabled,
  action,
  note,
}: {
  title: string;
  description: string;
  enabled: boolean;
  action: ReactNode;
  note?: string;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="max-w-xl">
        <div className="flex items-center gap-2">
          <h3 className="font-medium">{title}</h3>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              enabled ? "bg-success-soft text-success" : "bg-subtle text-muted"
            }`}
          >
            {enabled ? "Enabled" : "Off"}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted">{description}</p>
        {note && <p className="mt-1 text-xs text-muted">{note}</p>}
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

function DisableDialog({
  open,
  onClose,
  onDone,
  title,
  submit,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  title: string;
  submit: (password: string) => Promise<ActionResult>;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <DisableBody onClose={onClose} onDone={onDone} submit={submit} />
    </Modal>
  );
}

function DisableBody({
  onClose,
  onDone,
  submit,
}: {
  onClose: () => void;
  onDone: () => void;
  submit: (password: string) => Promise<ActionResult>;
}) {
  const [password, setPassword] = useState("");
  const { error, fieldErrors, pending, run } = useSubmit();

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        run(() => submit(password), onDone);
      }}
    >
      <p className="text-sm text-muted">
        Enter your current password to turn this off. Your account will be less protected.
      </p>
      {error && <Alert tone="error">{error}</Alert>}
      <PasswordField
        label="Current password"
        autoComplete="current-password"
        autoFocus
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        error={fieldErrors.password}
        disabled={pending}
      />
      <ModalActions>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="danger" loading={pending}>
          Disable
        </Button>
      </ModalActions>
    </form>
  );
}
