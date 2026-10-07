"use client";

import { useState, type ReactNode } from "react";

import { EmailOtpSetup, TotpSetup, useSubmit } from "@/components/security/two-factor-setup";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal, ModalActions } from "@/components/ui/modal";
import { PasswordField } from "@/components/ui/password-field";
import { useToast } from "@/components/ui/toast";
import type { TwoFactorMethod, TwoFactorMethodOption } from "@/lib/api/types";
import type { ActionResult } from "@/lib/auth/action-result";
import { disableEmailOtp, disableTotp } from "@/lib/auth/actions";
import { useMyTwoFactorMethods, useSetPreferredTwoFactorMethod } from "@/lib/query/two-factor";
import { useCurrentUser, useInvalidateCurrentUser } from "@/lib/query/user";

type Dialog = "enable-email" | "disable-email" | "enable-totp" | "disable-totp" | null;

const LAST_METHOD_NOTE = "Required: turn on another method before you can disable this one.";
const ADMIN_PAUSED_NOTE = "An administrator has turned this method off, so it isn't used at sign-in. You can still remove it.";
const ADMIN_UNAVAILABLE_NOTE = "Not offered right now: an administrator has turned this method off.";

export function SecuritySettings() {
  const user = useCurrentUser();
  const refreshUser = useInvalidateCurrentUser();
  const methods = useMyTwoFactorMethods();
  const emailOtpEnabled = user.two_factor_enabled;
  const totpEnabled = user.totp_enabled;
  const hasEmail = Boolean(user.email);
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);
  const done = () => {
    refreshUser(); // also refreshes the method list: its key sits under `me`
    close();
  };

  // Until the list loads, assume a method is offered; the API refuses setup of one that's off anyway.
  const available = (method: TwoFactorMethod) =>
    methods.data?.methods.find((item) => item.method === method)?.is_available ?? true;
  const usable = (methods.data?.methods ?? []).filter((item) => item.is_available && item.is_enrolled);
  // Policy: the last method that actually protects sign-in can't be turned off.
  const isLastUsable = (method: TwoFactorMethod) =>
    methods.data ? usable.length === 1 && usable[0].method === method : true;

  const emailAvailable = available("EMAIL_OTP");
  const totpAvailable = available("TOTP");

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Two-factor authentication is required for all staff. Keep at least one method turned on.
      </p>
      {methods.isError && <Alert tone="error">{methods.error.message}</Alert>}

      <MethodCard
        title="Email verification"
        description="Get a 6-digit code by email each time you sign in."
        enabled={emailOtpEnabled}
        paused={emailOtpEnabled && !emailAvailable}
        action={
          emailOtpEnabled ? (
            <Button
              variant="secondary"
              disabled={isLastUsable("EMAIL_OTP")}
              onClick={() => setDialog("disable-email")}
            >
              Disable
            </Button>
          ) : (
            <Button onClick={() => setDialog("enable-email")} disabled={!hasEmail || !emailAvailable}>
              Enable
            </Button>
          )
        }
        note={
          emailOtpEnabled
            ? !emailAvailable
              ? ADMIN_PAUSED_NOTE
              : methods.data && isLastUsable("EMAIL_OTP")
                ? LAST_METHOD_NOTE
                : undefined
            : !emailAvailable
              ? ADMIN_UNAVAILABLE_NOTE
              : !hasEmail
                ? "Your account needs an email address first."
                : undefined
        }
      />

      <MethodCard
        title="Authenticator app"
        description="Use an app such as Google Authenticator, 1Password or Authy to generate sign-in codes."
        enabled={totpEnabled}
        paused={totpEnabled && !totpAvailable}
        action={
          totpEnabled ? (
            <Button
              variant="secondary"
              disabled={isLastUsable("TOTP")}
              onClick={() => setDialog("disable-totp")}
            >
              Disable
            </Button>
          ) : (
            // Only offered while off: running setup while on replaces the secret
            // and locks the user out of their existing authenticator entry.
            <Button onClick={() => setDialog("enable-totp")} disabled={!totpAvailable}>
              Set up
            </Button>
          )
        }
        note={
          totpEnabled
            ? !totpAvailable
              ? ADMIN_PAUSED_NOTE
              : methods.data && isLastUsable("TOTP")
                ? LAST_METHOD_NOTE
                : undefined
            : !totpAvailable
              ? ADMIN_UNAVAILABLE_NOTE
              : undefined
        }
      />

      {methods.data && usable.length > 1 && (
        <PreferredMethodPicker options={usable} preferred={methods.data.preferred_method} />
      )}

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

/** Shown once two or more methods work at sign-in: picks which one is asked for first. */
function PreferredMethodPicker({
  options,
  preferred,
}: {
  options: TwoFactorMethodOption[];
  preferred: TwoFactorMethod | null;
}) {
  const toast = useToast();
  const setPreferred = useSetPreferredTwoFactorMethod();

  return (
    <fieldset className="rounded-xl border border-border bg-surface p-5" disabled={setPreferred.isPending}>
      <legend className="sr-only">Preferred sign-in method</legend>
      <h3 className="font-medium">Ask me first for</h3>
      <p className="mt-1 text-sm text-muted">
        Used first each time you sign in. You can still switch to your other method on the sign-in screen.
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {options.map((item) => {
          const checked = item.method === preferred;
          return (
            <label
              key={item.method}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand ${
                checked ? "border-brand bg-brand-soft/60" : "border-border hover:bg-subtle"
              } ${setPreferred.isPending ? "cursor-wait opacity-70" : ""}`}
            >
              <input
                type="radio"
                name="preferred-two-factor-method"
                className="size-4 accent-brand"
                checked={checked}
                onChange={() =>
                  setPreferred.mutate(item.method, {
                    onSuccess: () => toast.success(`${item.label} will be asked for first.`),
                    onError: (error) => toast.error(error.message),
                  })
                }
              />
              <span className="font-medium">{item.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function MethodCard({
  title,
  description,
  enabled,
  paused = false,
  action,
  note,
}: {
  title: string;
  description: string;
  enabled: boolean;
  /** Set up by the user, but turned off platform-wide by an admin. */
  paused?: boolean;
  action: ReactNode;
  note?: string;
}) {
  const [label, tone] = paused
    ? ["Paused", "bg-subtle text-foreground ring-1 ring-border"]
    : enabled
      ? ["Enabled", "bg-success-soft text-success"]
      : ["Off", "bg-subtle text-muted"];

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="max-w-xl">
        <div className="flex items-center gap-2">
          <h3 className="font-medium">{title}</h3>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{label}</span>
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
