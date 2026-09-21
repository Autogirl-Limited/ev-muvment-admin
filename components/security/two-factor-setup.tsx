"use client";

import { QRCodeSVG } from "qrcode.react";
import { useState, useTransition, type ReactNode } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CodeField } from "@/components/ui/code-field";
import { ModalActions } from "@/components/ui/modal";
import type { TotpSetupResponse } from "@/lib/api/types";
import type { ActionResult } from "@/lib/auth/action-result";
import {
  confirmEmailOtp,
  confirmTotp,
  requestEmailOtp,
  setupTotp,
} from "@/lib/auth/actions";

/**
 * The two setup flows, shared by the Settings dialogs (`layout="modal"`) and
 * the mandatory first-login screen (`layout="page"`). They know nothing about
 * where they are shown: the caller decides what "done" and "cancel" do.
 */

type Layout = "modal" | "page";

/** Runs an action and reports its outcome; the code/password fields share this. */
export function useSubmit() {
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

/** Button row: pinned to the bottom of a scrolling dialog, or a plain row on a page. */
export function SetupActions({ layout, children }: { layout: Layout; children: ReactNode }) {
  if (layout === "modal") return <ModalActions>{children}</ModalActions>;
  return <div className="flex justify-end gap-2 pt-1">{children}</div>;
}

interface SetupProps {
  layout: Layout;
  /** Called once the method is confirmed and enabled. */
  onDone: () => void;
  onCancel: () => void;
}

export function EmailOtpSetup({
  layout,
  onDone,
  onCancel,
  initialSent = false,
}: SetupProps & {
  /** The code was already requested (the page flow requests it when you pick the method). */
  initialSent?: boolean;
}) {
  const [sent, setSent] = useState(initialSent);
  const [code, setCode] = useState("");
  const { error, fieldErrors, pending, run } = useSubmit();

  if (!sent) {
    return (
      <>
        <p className="text-sm text-muted">
          We&apos;ll email a 6-digit code to your address to confirm it works.
        </p>
        {error && <Alert tone="error">{error}</Alert>}
        <SetupActions layout={layout}>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button loading={pending} onClick={() => run(requestEmailOtp, () => setSent(true))}>
            Send code
          </Button>
        </SetupActions>
      </>
    );
  }

  const confirm = (value: string) => run(() => confirmEmailOtp({ code: value }), onDone);

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
      <SetupActions layout={layout}>
        <Button variant="ghost" onClick={onCancel}>
          {layout === "page" ? "Back" : "Cancel"}
        </Button>
        <Button loading={pending} disabled={code.length !== 6} onClick={() => confirm(code)}>
          Confirm
        </Button>
      </SetupActions>
    </>
  );
}

export function TotpSetup({
  layout,
  onDone,
  onCancel,
  initialSetup,
}: SetupProps & {
  /** The secret was already generated (the page flow does it when you pick the method). */
  initialSetup?: TotpSetupResponse;
}) {
  const [setup, setSetup] = useState<TotpSetupResponse | null>(initialSetup ?? null);
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
        <SetupActions layout={layout}>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button loading={pending} onClick={() => run(setupTotp, setSetup)}>
            Continue
          </Button>
        </SetupActions>
      </>
    );
  }

  const confirm = (value: string) => run(() => confirmTotp({ code: value }), onDone);

  return (
    <>
      <p className="text-sm text-muted">
        Scan this QR code with your authenticator app, or enter the key manually.
      </p>
      <div className="flex justify-center rounded-lg bg-white p-3">
        <QRCodeSVG
          value={setup.otpauth_url}
          size={176}
          className="h-auto w-full max-w-44 [@media(max-height:640px)]:max-w-32"
        />
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-subtle px-3 py-2">
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
      <SetupActions layout={layout}>
        <Button variant="ghost" onClick={onCancel}>
          {layout === "page" ? "Back" : "Cancel"}
        </Button>
        <Button loading={pending} disabled={code.length !== 6} onClick={() => confirm(code)}>
          Enable
        </Button>
      </SetupActions>
    </>
  );
}
