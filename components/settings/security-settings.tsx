"use client";

import { QRCodeSVG } from "qrcode.react";
import { useState, useTransition, type ReactNode } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CodeField } from "@/components/ui/code-field";
import { Modal } from "@/components/ui/modal";
import { PasswordField } from "@/components/ui/password-field";
import type { TotpSetupResponse } from "@/lib/api/types";
import type { ActionResult } from "@/lib/auth/action-result";
import {
  confirmEmailOtp,
  confirmTotp,
  disableEmailOtp,
  disableTotp,
  requestEmailOtp,
  setupTotp,
} from "@/lib/auth/actions";

interface SecuritySettingsProps {
  emailOtpEnabled: boolean;
  totpEnabled: boolean;
  hasEmail: boolean;
}

type Dialog = "enable-email" | "disable-email" | "enable-totp" | "disable-totp" | null;

export function SecuritySettings({ emailOtpEnabled, totpEnabled, hasEmail }: SecuritySettingsProps) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);

  return (
    <div className="space-y-4">
      <MethodCard
        title="Email verification"
        description="Get a 6-digit code by email each time you sign in."
        enabled={emailOtpEnabled}
        action={
          emailOtpEnabled ? (
            <Button variant="secondary" onClick={() => setDialog("disable-email")}>
              Disable
            </Button>
          ) : (
            <Button onClick={() => setDialog("enable-email")} disabled={!hasEmail}>
              Enable
            </Button>
          )
        }
        note={!hasEmail && !emailOtpEnabled ? "Your account needs an email address first." : undefined}
      />

      <MethodCard
        title="Authenticator app"
        description="Use an app such as Google Authenticator, 1Password or Authy to generate sign-in codes. If both methods are on, the app takes priority."
        enabled={totpEnabled}
        action={
          totpEnabled ? (
            <Button variant="secondary" onClick={() => setDialog("disable-totp")}>
              Disable
            </Button>
          ) : (
            // Only offered while off: running setup while on replaces the secret
            // and locks the user out of their existing authenticator entry.
            <Button onClick={() => setDialog("enable-totp")}>Set up</Button>
          )
        }
      />

      <EnableEmailDialog open={dialog === "enable-email"} onClose={close} />
      <EnableTotpDialog open={dialog === "enable-totp"} onClose={close} />
      <DisableDialog
        open={dialog === "disable-email"}
        onClose={close}
        title="Disable email verification"
        submit={(password) => disableEmailOtp({ password })}
      />
      <DisableDialog
        open={dialog === "disable-totp"}
        onClose={close}
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
              enabled ? "bg-success-soft text-success" : "bg-background text-muted"
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

/** Runs an action and reports its outcome; the code/password fields share this. */
function useSubmit() {
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  function run<T>(action: () => Promise<ActionResult<T>>, onSuccess: (data: T) => void) {
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.message || null);
        setFieldErrors(result.fieldErrors);
        return;
      }
      onSuccess(result.data);
    });
  }

  return { error, fieldErrors, pending, run };
}

function EnableEmailDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Enable email verification">
      <EnableEmailBody onClose={onClose} />
    </Modal>
  );
}

function EnableEmailBody({ onClose }: { onClose: () => void }) {
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const { error, fieldErrors, pending, run } = useSubmit();

  if (!sent) {
    return (
      <>
        <p className="text-sm text-muted">
          We&apos;ll email a 6-digit code to your address to confirm it works.
        </p>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={pending} onClick={() => run(requestEmailOtp, () => setSent(true))}>
            Send code
          </Button>
        </div>
      </>
    );
  }

  const confirm = (value: string) => run(() => confirmEmailOtp({ code: value }), onClose);

  return (
    <>
      <p className="text-sm text-muted">Enter the code we just emailed you.</p>
      {error && <Alert tone="error">{error}</Alert>}
      <CodeField
        label="Verification code"
        value={code}
        onChange={setCode}
        onComplete={confirm}
        error={fieldErrors.code}
        disabled={pending}
        autoFocus
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button loading={pending} disabled={code.length !== 6} onClick={() => confirm(code)}>
          Confirm
        </Button>
      </div>
    </>
  );
}

function EnableTotpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Set up authenticator app">
      <EnableTotpBody onClose={onClose} />
    </Modal>
  );
}

function EnableTotpBody({ onClose }: { onClose: () => void }) {
  const [setup, setSetup] = useState<TotpSetupResponse | null>(null);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const { error, fieldErrors, pending, run } = useSubmit();

  if (!setup) {
    return (
      <>
        <p className="text-sm text-muted">
          You&apos;ll scan a QR code with your authenticator app, then enter the code it shows.
        </p>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={pending} onClick={() => run(setupTotp, setSetup)}>
            Continue
          </Button>
        </div>
      </>
    );
  }

  const confirm = (value: string) => run(() => confirmTotp({ code: value }), onClose);

  return (
    <>
      <p className="text-sm text-muted">
        Scan this QR code with your authenticator app, or enter the key manually.
      </p>
      <div className="flex justify-center rounded-lg bg-white p-3">
        <QRCodeSVG value={setup.otpauth_url} size={176} />
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
        <code className="min-w-0 flex-1 break-all font-mono text-xs">{setup.secret}</code>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(setup.secret);
              setCopied(true);
            } catch {}
          }}
          className="shrink-0 text-xs font-medium text-brand hover:underline"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      <CodeField
        label="Code from your app"
        value={code}
        onChange={setCode}
        onComplete={confirm}
        error={fieldErrors.code}
        disabled={pending}
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button loading={pending} disabled={code.length !== 6} onClick={() => confirm(code)}>
          Enable
        </Button>
      </div>
    </>
  );
}

function DisableDialog({
  open,
  onClose,
  title,
  submit,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  submit: (password: string) => Promise<ActionResult>;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <DisableBody onClose={onClose} submit={submit} />
    </Modal>
  );
}

function DisableBody({
  onClose,
  submit,
}: {
  onClose: () => void;
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
        run(() => submit(password), onClose);
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
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="danger" loading={pending}>
          Disable
        </Button>
      </div>
    </form>
  );
}
