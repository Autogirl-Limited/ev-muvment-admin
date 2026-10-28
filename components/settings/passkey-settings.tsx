"use client";

import { useEffect, useState } from "react";

import { Icon } from "@/components/dashboard/screen-kit";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import type { Passkey } from "@/lib/api/types";
import { formatDate, formatRelative } from "@/lib/format";
import { biometricLabel, passkeyErrorMessage, passkeysSupported } from "@/lib/passkey";
import { useAddPasskey, useMyPasskeys, useRemovePasskey } from "@/lib/query/passkeys";

/** Fingerprint / face sign-in: add this device, see and remove the devices that have it. */
export function PasskeySettings() {
  const toast = useToast();
  const passkeys = useMyPasskeys();
  const add = useAddPasskey();
  const remove = useRemovePasskey();
  const [supported, setSupported] = useState<boolean | null>(null);
  // Device-specific, so only known after mount (the server renders the generic name).
  const [sensor, setSensor] = useState("fingerprint");
  const [removing, setRemoving] = useState<Passkey | null>(null);
  const items = passkeys.data ?? [];

  useEffect(() => {
    void passkeysSupported().then((ok) => {
      setSupported(ok);
      setSensor(biometricLabel());
    });
  }, []);

  function addThisDevice() {
    add.mutate(undefined, {
      onSuccess: (passkey) => toast.success(`${passkey.name} can now sign in with ${sensor}.`),
      onError: (error) => {
        const message = passkeyErrorMessage(error);
        if (message) toast.error(message);
      },
    });
  }

  function confirmRemove() {
    if (!removing) return;
    remove.mutate(removing.id, {
      onSuccess: () => {
        toast.success(`Removed ${removing.name}.`);
        setRemoving(null);
      },
    });
  }

  const [label, tone] = items.length
    ? ["Enabled", "bg-success-soft text-success"]
    : ["Off", "bg-subtle text-muted"];

  return (
    <div className="space-y-3">
      {passkeys.isError && <Alert tone="error">{passkeys.error.message}</Alert>}

      <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-xl">
          <div className="flex items-center gap-2">
            <h3 className="font-medium">Sign in with {sensor}</h3>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{label}</span>
          </div>
          <p className="mt-1 text-sm text-muted">
            Use this device&apos;s fingerprint, face or screen lock instead of your password and code. Set up each
            device you use. Your fingerprint never leaves the device.
          </p>
          {supported === false && (
            <p className="mt-1 text-xs text-muted">This browser or device can&apos;t use fingerprint or face sign-in.</p>
          )}
        </div>
        <div className="shrink-0">
          <Button onClick={addThisDevice} loading={add.isPending} disabled={!supported}>
            <Icon name="fingerprint" className="size-4" />
            Add this device
          </Button>
        </div>
      </div>

      {items.length > 0 && (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{item.name}</p>
                <p className="text-xs text-muted">
                  {item.last_used_at ? `Last used ${formatRelative(item.last_used_at)}` : `Added ${formatDate(item.created_at)}`}
                </p>
              </div>
              <Button variant="secondary" onClick={() => setRemoving(item)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={removing !== null}
        onClose={() => {
          remove.reset();
          setRemoving(null);
        }}
        onConfirm={confirmRemove}
        title={`Remove ${removing?.name ?? "device"}?`}
        confirmLabel="Remove"
        loading={remove.isPending}
        error={remove.error?.message}
      >
        <p>That device will need your password and two-factor code to sign in again.</p>
      </ConfirmDialog>
    </div>
  );
}
