"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { AccessDenied } from "@/components/dashboard/access-denied";
import { EmptyState, Icon } from "@/components/dashboard/screen-kit";
import { AccountsTeamCard } from "@/components/people/accounts-team";
import { ActionMenu, type MenuAction } from "@/components/people/action-menu";
import { ActiveBadge, Avatar, Card, CopyButton, InfoRow, RoleBadge } from "@/components/people/people-parts";
import { ChangeRoleDialog, DeleteUserDialog, ResetCredentialsDialog, ToggleActiveDialog } from "@/components/people/user-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/browser";
import type { StaffRole } from "@/lib/api/users";
import { formatDateTime, fullName } from "@/lib/format";
import { useUserGuards } from "@/lib/hooks/use-user-guards";
import { ROLE_LABELS } from "@/lib/navigation";
import { useCurrentUser } from "@/lib/query/user";
import { useManagedUser } from "@/lib/query/users";

const OFFICER_ACCESS = ["Bank transfers, fleet vehicles and daily checklists", "EV wallet performance stats (the allocation queue and free grants are admin-only)", "Platform configuration"];
const ACCESS: Record<StaffRole, string[]> = {
  ADMIN: ["Everything an officer can, plus inviting and managing every user", "Driver applications, wallet allocations and free grants", "Drivers and staff pages"],
  ACCOUNT_OFFICER: OFFICER_ACCESS,
  RELATIONSHIP_OFFICER: OFFICER_ACCESS,
};

export function StaffDetailPage({ id }: { id: string }) {
  const me = useCurrentUser();
  const isAdmin = me.user_type === "ADMIN";
  const router = useRouter();
  const query = useManagedUser(id, isAdmin);
  const person = query.data;
  const guards = useUserGuards(person);
  const [dialog, setDialog] = useState<"role" | "credentials" | "active" | "delete" | null>(null);
  const close = () => setDialog(null);

  // A driver id typed into /staff/… belongs on the driver page.
  const isDriverRecord = person?.user_type === "DRIVER";
  useEffect(() => {
    if (isDriverRecord) router.replace(`/drivers/${id}`);
  }, [id, isDriverRecord, router]);

  if (!isAdmin) return <AccessDenied />;

  if (query.isLoading || isDriverRecord) {
    return (
      <div className="space-y-5" role="status" aria-label="Loading staff member">
        <div className="h-24 animate-pulse rounded-2xl bg-subtle/50" />
        <div className="h-64 animate-pulse rounded-2xl bg-subtle/40" />
      </div>
    );
  }

  if (query.isError || !person) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <section className="rounded-2xl border border-border bg-surface shadow-card">
        <EmptyState
          icon="idCard"
          title={notFound ? "Staff member not found" : "Couldn't load this staff member"}
          action={
            <div className="flex gap-2">
              {!notFound && <Button variant="secondary" onClick={() => query.refetch()}>Try again</Button>}
              <Link href="/staff" className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium transition hover:bg-subtle">Back to staff</Link>
            </div>
          }
        >
          {notFound ? "This account may have been deleted." : query.error?.message}
        </EmptyState>
      </section>
    );
  }

  const role = person.user_type as StaffRole;
  const secured = person.two_factor_enabled || person.totp_enabled;
  const menu: MenuAction[] = [
    { label: "Change role", icon: "idCard", onSelect: () => setDialog("role"), disabledReason: guards.changeRole },
    { label: person.is_active ? "Deactivate account" : "Reactivate account", icon: person.is_active ? "userMinus" : "user", onSelect: () => setDialog("active"), disabledReason: person.is_active ? guards.deactivate : null },
    { label: "Delete staff member", icon: "trash", tone: "danger", onSelect: () => setDialog("delete"), disabledReason: guards.remove },
  ];

  return (
    <div className="space-y-5">
      <Link href="/staff" className="inline-flex items-center gap-1.5 rounded-md py-1 text-sm font-medium text-muted transition hover:text-foreground pointer-coarse:py-2">
        <Icon name="arrowLeft" className="size-4" />
        Staff
      </Link>

      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <Avatar person={person} size="lg" />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{fullName(person)}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <RoleBadge role={role} />
              <ActiveBadge active={person.is_active} />
              {guards.isSelf && <Badge tone="brand">You</Badge>}
            </div>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <span>@{person.username}</span>
              {person.email && <span className="inline-flex min-w-0 items-center gap-1"><Icon name="mail" className="size-3.5 shrink-0" /><span className="truncate">{person.email}</span></span>}
              {person.phone_number && <span className="inline-flex items-center gap-1"><Icon name="phone" className="size-3.5" />{person.phone_number}</span>}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setDialog("credentials")}><Icon name="key" className="size-4" />Reset credentials</Button>
          <ActionMenu actions={menu} />
        </div>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0 space-y-5">
          <Card title="Role & access" icon="shield" action={<Button variant="secondary" onClick={() => setDialog("role")} disabled={Boolean(guards.changeRole)} title={guards.changeRole ?? undefined}>Change role</Button>}>
            <div className="space-y-3 p-4 sm:p-5">
              <p className="text-sm">
                <span className="font-semibold">{fullName(person)}</span> is {role === "ADMIN" ? "an" : "a"} <span className="font-semibold">{ROLE_LABELS[role]}</span>. They can access:
              </p>
              <ul className="space-y-2 text-sm text-muted">
                {ACCESS[role].map((line) => (
                  <li key={line} className="flex items-start gap-2.5"><Icon name="check" className="mt-0.5 size-4 shrink-0 text-success" />{line}</li>
                ))}
              </ul>
              {guards.changeRole && <p className="text-xs text-muted">{guards.changeRole}</p>}
            </div>
          </Card>

          <AccountsTeamCard user={person} />
        </div>

        <aside className="space-y-5 lg:sticky lg:top-20">
          <Card title="Account" icon="user">
            <dl className="divide-y divide-border px-4 sm:px-5">
              <InfoRow label="Username">@{person.username}</InfoRow>
              <InfoRow label="Email">{person.email ? <span className="inline-flex items-center gap-1">{person.email}<CopyButton value={person.email} label="Copy email" /></span> : "-"}</InfoRow>
              <InfoRow label="Phone">{person.phone_number ? <span className="inline-flex items-center gap-1">{person.phone_number}<CopyButton value={person.phone_number} label="Copy phone number" /></span> : "-"}</InfoRow>
              <InfoRow label="Joined">{formatDateTime(person.created_at)}</InfoRow>
              <InfoRow label="Last updated">{formatDateTime(person.updated_at)}</InfoRow>
            </dl>
            <p className="border-t border-border px-4 py-3 text-xs text-muted sm:px-5">Contact details can&apos;t be edited after the invite.</p>
          </Card>
          <Card title="Security" icon="lock">
            <dl className="divide-y divide-border px-4 sm:px-5">
              <InfoRow label="Email OTP"><Badge tone={person.two_factor_enabled ? "success" : "neutral"}>{person.two_factor_enabled ? "On" : "Off"}</Badge></InfoRow>
              <InfoRow label="Authenticator"><Badge tone={person.totp_enabled ? "success" : "neutral"}>{person.totp_enabled ? "On" : "Off"}</Badge></InfoRow>
            </dl>
            <p className="border-t border-border px-4 py-3 text-xs text-muted sm:px-5">
              {secured ? "Two-factor sign-in is on." : "No two-factor sign-in yet. Ask them to turn it on under Security."} These flags can lag a few minutes.
            </p>
          </Card>
        </aside>
      </div>

      <ChangeRoleDialog user={dialog === "role" ? person : null} onClose={close} />
      <ResetCredentialsDialog user={dialog === "credentials" ? person : null} onClose={close} />
      <ToggleActiveDialog user={dialog === "active" ? person : null} onClose={close} />
      <DeleteUserDialog user={dialog === "delete" ? person : null} onClose={close} onDeleted={() => router.replace("/staff")} />
    </div>
  );
}
