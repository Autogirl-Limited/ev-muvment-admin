"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { AccessDenied } from "@/components/dashboard/access-denied";
import { ConfigPageHeader, ErrorState, Icon, SkeletonRows, type IconName } from "@/components/dashboard/screen-kit";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/browser";
import type { AuthMethodSetting } from "@/lib/api/auth-settings";
import type { TwoFactorMethod } from "@/lib/api/types";
import { formatRelative } from "@/lib/format";
import { authMethodSettingsQuery, useToggleAuthMethod } from "@/lib/query/auth-settings";
import { useStaffNames } from "@/lib/query/staff-names";
import { useCurrentUser } from "@/lib/query/user";

const DETAILS: Record<TwoFactorMethod, { icon: IconName; description: string }> = {
  TOTP: {
    icon: "shield",
    description: "A 6-digit code from an app such as Google Authenticator, 1Password or Authy. The stronger option.",
  },
  EMAIL_OTP: {
    icon: "key",
    description: "A 6-digit code emailed at each sign-in. Needs an email address on the account.",
  },
};

const people = (count: number) => `${count.toLocaleString("en-NG")} ${count === 1 ? "person" : "people"}`;

export function TwoFactorMethodsPage() {
  const user = useCurrentUser();
  const isAdmin = user.user_type === "ADMIN";
  const toast = useToast();
  const [disabling, setDisabling] = useState<AuthMethodSetting | null>(null);

  const settings = useQuery({ ...authMethodSettingsQuery(), enabled: isAdmin });
  const toggle = useToggleAuthMethod();
  const nameOf = useStaffNames(settings.data?.map((item) => item.updated_by) ?? [], isAdmin);

  if (!isAdmin) return <AccessDenied />;

  const items = settings.data;
  const enabledCount = items?.filter((item) => item.is_enabled).length ?? 0;

  function setEnabled(item: AuthMethodSetting, isEnabled: boolean) {
    toggle.mutate(
      { method: item.method, isEnabled },
      {
        onSuccess: () => {
          setDisabling(null);
          toast.success(`${item.label} turned ${isEnabled ? "on" : "off"}.`);
        },
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : `Couldn't update ${item.label}.`),
      },
    );
  }

  // Turning on is harmless; turning off changes how people sign in, so it's confirmed first.
  function onSwitch(item: AuthMethodSetting, isEnabled: boolean) {
    if (isEnabled) setEnabled(item, true);
    else setDisabling(item);
  }

  const lastOne = disabling !== null && enabledCount === 1;

  return (
    <div>
      <ConfigPageHeader
        icon="shield"
        title="Two-factor methods"
        description="Choose which second sign-in steps people can use. Everyone can then pick their preferred one from the methods you offer."
      />

      <div className="mb-4">
        <Alert tone="info">
          A password is always required. These are the extra step after it. Turning a method off doesn&apos;t delete
          anyone&apos;s setup: it&apos;s skipped at sign-in, and comes back as it was when you turn it on again.
        </Alert>
      </div>

      {items && enabledCount === 0 && (
        <div className="mb-4">
          <Alert tone="error">
            Every method is off, so everyone signs in with just their password and new staff aren&apos;t asked to set up
            two-factor authentication.
          </Alert>
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        {settings.isLoading ? (
          <SkeletonRows rows={2} columns={3} />
        ) : settings.isError ? (
          <ErrorState message={settings.error.message} onRetry={() => settings.refetch()} />
        ) : (
          <ul className="divide-y divide-border">
            {items?.map((item) => {
              const changedBy = item.updated_by ? (nameOf(item.updated_by) ?? "An administrator") : null;
              return (
                <li key={item.method} className={`flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-6 ${item.is_enabled ? "" : "bg-subtle/30"}`}>
                  <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
                    <Icon name={DETAILS[item.method].icon} className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{item.label}</p>
                      <Badge tone={item.is_enabled ? "success" : "neutral"} dot>
                        {item.is_enabled ? "Offered" : "Off"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted">{DETAILS[item.method].description}</p>
                    <p className="mt-2 text-xs text-muted">
                      <span className="font-medium text-foreground">{people(item.enrolled_users)}</span> set up
                      {changedBy && <> · Changed {formatRelative(item.updated_at).replace(/^Just now$/, "just now")} by {changedBy}</>}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 sm:justify-end">
                    <span className="text-sm text-muted sm:hidden">{item.is_enabled ? "Offered" : "Off"}</span>
                    <Switch
                      checked={item.is_enabled}
                      disabled={toggle.isPending}
                      onChange={(isEnabled) => onSwitch(item, isEnabled)}
                      label={`${item.label} is ${item.is_enabled ? "offered" : "off"}`}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={disabling !== null}
        onClose={() => setDisabling(null)}
        onConfirm={() => disabling && setEnabled(disabling, false)}
        title={`Turn off ${disabling?.label.toLowerCase() ?? "this method"}?`}
        confirmLabel="Turn off"
        loading={toggle.isPending}
      >
        <div className="space-y-3">
          <p>
            {disabling && disabling.enrolled_users > 0 ? (
              <>
                <strong className="font-semibold text-foreground">{people(disabling.enrolled_users)}</strong>{" "}
                {disabling.enrolled_users === 1 ? "uses" : "use"} it.{" "}
                {lastOne
                  ? "They'll sign in with just their password."
                  : "They'll be asked for their other method instead, or only their password if they have no other."}
              </>
            ) : (
              <>Nobody uses it right now.</>
            )}{" "}
            Nobody will be able to set it up until you turn it back on.
          </p>
          {lastOne && (
            <p>
              This is the <strong className="font-semibold text-foreground">last method on</strong>. With it off, nobody is asked
              for a second step at sign-in, and new staff aren&apos;t required to set one up.
            </p>
          )}
          <p>Their setup is kept and comes back when you turn this on again.</p>
        </div>
      </ConfirmDialog>
    </div>
  );
}
