"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Modal, ModalActions } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/browser";
import { unassignDriver } from "@/lib/api/configuration";
import { listDvaTransactions, sendDriverCredentials } from "@/lib/api/staff";
import { STAFF_ROLES, type ManagedUser, type StaffRole } from "@/lib/api/users";
import { listWalletAllocations } from "@/lib/api/wallet";
import type { DeliveryChannel } from "@/lib/api/types";
import { fullName } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/navigation";
import { CACHE } from "@/lib/query/cache";
import { queryKeys } from "@/lib/query/keys";
import { useDeleteUser, useRefreshPeople, useUpdateUser } from "@/lib/query/users";

const errorText = (error: unknown, fallback: string) => (error instanceof ApiError ? error.message : fallback);

interface DialogProps {
  user: ManagedUser | null;
  onClose: () => void;
}

// ---------- Deactivate / reactivate ----------
export function ToggleActiveDialog({ user, onClose }: DialogProps) {
  const name = user ? fullName(user) : "";
  return (
    <Modal open={user !== null} onClose={onClose} title={user?.is_active ? `Deactivate ${name}?` : `Reactivate ${name}?`}>
      {user && <ToggleActiveBody user={user} onClose={onClose} />}
    </Modal>
  );
}

function ToggleActiveBody({ user, onClose }: { user: ManagedUser; onClose: () => void }) {
  const update = useUpdateUser();
  const refresh = useRefreshPeople();
  const toast = useToast();
  const [alsoUnassign, setAlsoUnassign] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const deactivating = user.is_active;
  const name = fullName(user);

  const submit = async () => {
    setError(null);
    try {
      await update.mutateAsync({ id: user.id, patch: { is_active: !deactivating } });
    } catch (err) {
      return setError(errorText(err, "Couldn't update this account. Try again."));
    }
    if (deactivating && user.vehicle && alsoUnassign) {
      try {
        await unassignDriver(user.vehicle.id);
        refresh();
      } catch {
        toast.error(`${name} was deactivated, but ${user.vehicle.name} couldn't be unassigned. Unassign it from the driver page.`);
        return onClose();
      }
    }
    toast.success(deactivating ? `${name} was deactivated.` : `${name} can sign in again.`);
    onClose();
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3 text-sm text-muted">
        {deactivating ? (
          <>
            <p>{name} will be signed out immediately and won&apos;t be able to log in. Their data, wallet and bank account are kept, and you can reactivate them at any time.</p>
            {user.vehicle && (
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-subtle/50 p-3 text-foreground">
                <input type="checkbox" checked={alsoUnassign} onChange={(event) => setAlsoUnassign(event.target.checked)} className="mt-0.5 size-4 accent-brand" />
                <span className="text-sm">
                  <span className="font-medium">Also unassign {user.vehicle.name}</span>
                  <span className="mt-0.5 block text-xs text-muted">Deactivating alone keeps the vehicle assigned, so nobody else can drive it.</span>
                </span>
              </label>
            )}
          </>
        ) : (
          <p>{name} will be able to sign in again with their existing password. Nothing else changes.</p>
        )}
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <ModalActions>
        <Button variant="secondary" onClick={onClose} disabled={update.isPending}>Cancel</Button>
        <Button variant={deactivating ? "danger" : "primary"} onClick={submit} loading={update.isPending}>{deactivating ? "Deactivate" : "Reactivate"}</Button>
      </ModalActions>
    </div>
  );
}

// ---------- Reset credentials ----------
export function ResetCredentialsDialog({ user, onClose }: DialogProps) {
  return (
    <Modal open={user !== null} onClose={onClose} title={user ? `Reset credentials for ${fullName(user)}` : "Reset credentials"}>
      {user && <ResetCredentialsBody user={user} onClose={onClose} />}
    </Modal>
  );
}

function ResetCredentialsBody({ user, onClose }: { user: ManagedUser; onClose: () => void }) {
  const toast = useToast();
  const [channel, setChannel] = useState<DeliveryChannel>(user.email ? "EMAIL" : "SMS");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options: Array<{ id: DeliveryChannel; label: string; detail: string | null }> = [
    { id: "EMAIL", label: "Email", detail: user.email },
    { id: "SMS", label: "SMS", detail: user.phone_number },
  ];

  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      await sendDriverCredentials(user.id, channel);
      toast.success(`New credentials sent by ${channel === "EMAIL" ? "email" : "SMS"}.`);
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 502
          ? "The password was reset, but the message couldn't be delivered. Try again; this issues another new password."
          : errorText(err, "Couldn't send credentials. Try again."),
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        This issues a new temporary password. Their current password stops working, their refresh sessions end, and they must choose a new password when they next sign in.
      </p>
      <div role="radiogroup" aria-label="Delivery channel" className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const unavailable = !option.detail;
          const selected = channel === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={unavailable}
              onClick={() => setChannel(option.id)}
              className={`rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${selected ? "border-brand bg-brand-soft" : "border-border hover:bg-subtle/60"}`}
            >
              <span className="block text-sm font-semibold">{option.label}</span>
              <span className="mt-0.5 block truncate text-xs text-muted">{option.detail ?? `No ${option.id === "EMAIL" ? "email address" : "phone number"} on file`}</span>
            </button>
          );
        })}
      </div>
      {!user.email && !user.phone_number && <Alert tone="error">This account has no email or phone number, so credentials can&apos;t be delivered.</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      <ModalActions>
        <Button variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
        <Button onClick={submit} loading={pending} disabled={!options.find((option) => option.id === channel)?.detail}>Send new credentials</Button>
      </ModalActions>
    </div>
  );
}

// ---------- Change role (staff only) ----------
const ROLE_NOTE: Record<StaffRole, string> = {
  ADMIN: "Full access, including inviting and managing every user.",
  ACCOUNT_OFFICER: "Payments, fleet and checklists. No user management.",
  RELATIONSHIP_OFFICER: "Driver relations, fleet and checklists. No user management.",
};

export function ChangeRoleDialog({ user, onClose }: DialogProps) {
  return (
    <Modal open={user !== null} onClose={onClose} title={user ? `Change role for ${fullName(user)}` : "Change role"}>
      {user && <ChangeRoleBody user={user} onClose={onClose} />}
    </Modal>
  );
}

function ChangeRoleBody({ user, onClose }: { user: ManagedUser; onClose: () => void }) {
  const update = useUpdateUser();
  const toast = useToast();
  const [role, setRole] = useState<StaffRole>(user.user_type as StaffRole);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    update.mutate(
      { id: user.id, patch: { user_type: role } },
      {
        onSuccess: () => {
          toast.success(`${fullName(user)} is now ${ROLE_LABELS[role]}.`);
          onClose();
        },
        onError: (err) => setError(errorText(err, "Couldn't change the role. Try again.")),
      },
    );
  };

  return (
    <div className="space-y-4">
      <Select label="Role" value={role} onChange={(event) => setRole(event.target.value as StaffRole)} hint={ROLE_NOTE[role]}>
        {STAFF_ROLES.map((item) => <option key={item} value={item}>{ROLE_LABELS[item]}</option>)}
      </Select>
      <p className="text-xs text-muted">The change applies on their next request. Their open session picks up the new access after it refreshes.</p>
      {error && <Alert tone="error">{error}</Alert>}
      <ModalActions>
        <Button variant="secondary" onClick={onClose} disabled={update.isPending}>Cancel</Button>
        <Button onClick={submit} loading={update.isPending} disabled={role === user.user_type}>Change role</Button>
      </ModalActions>
    </div>
  );
}

// ---------- Delete ----------
export function DeleteUserDialog({ user, onClose, onDeleted }: DialogProps & { onDeleted: () => void }) {
  return (
    <Modal open={user !== null} onClose={onClose} title={user ? `Delete ${fullName(user)}?` : "Delete user"}>
      {user && <DeleteUserBody user={user} onClose={onClose} onDeleted={onDeleted} />}
    </Modal>
  );
}

function DeleteUserBody({ user, onClose, onDeleted }: { user: ManagedUser; onClose: () => void; onDeleted: () => void }) {
  const remove = useDeleteUser();
  const toast = useToast();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const isDriver = user.user_type === "DRIVER";

  // Deleting a driver erases their money history; show exactly how much.
  const allocations = useQuery({
    queryKey: queryKeys.walletAllocations.list({ page: 1, page_size: 1, userId: user.id }),
    queryFn: ({ signal }) => listWalletAllocations({ page: 1, page_size: 1, userId: user.id }, signal),
    enabled: isDriver,
    ...CACHE.live,
  });
  const transactions = useQuery({
    queryKey: queryKeys.dvaTransactions.list({ page: 1, page_size: 1, userId: user.id }),
    queryFn: ({ signal }) => listDvaTransactions({ page: 1, page_size: 1, userId: user.id }, signal),
    enabled: isDriver,
    ...CACHE.live,
  });
  const count = (value: number | undefined) => (value === undefined ? "…" : value.toLocaleString());

  const submit = () => {
    setError(null);
    remove.mutate(user.id, {
      onSuccess: () => {
        toast.success(`${fullName(user)} was deleted.`);
        onDeleted();
      },
      onError: (err) => setError(errorText(err, "Couldn't delete this account. Try again.")),
    });
  };

  return (
    <div className="space-y-4">
      <Alert tone="error">Deleting is permanent and can&apos;t be undone. Deactivate the account instead unless it was created by mistake.</Alert>
      <div className="space-y-2 text-sm text-muted">
        <p>This permanently erases:</p>
        <ul className="list-disc space-y-1 pl-5">
          {isDriver && (
            <>
              <li><span className="font-medium text-foreground">{count(allocations.data?.pagination.total_items)}</span> wallet allocations and <span className="font-medium text-foreground">{count(transactions.data?.pagination.total_items)}</span> DVA transactions (platform totals shrink)</li>
              <li>Their bank account record. The account at the payment provider is <span className="font-medium text-foreground">not</span> closed.</li>
              {user.vehicle && <li>{user.vehicle.name} is freed and becomes unassigned.</li>}
            </>
          )}
          <li>Notifications, group memberships and sessions.</li>
        </ul>
        <p>Their checklists, driver applications and audit references are kept, but no longer point to a person.</p>
      </div>
      <Field label={`Type ${user.username} to confirm`} value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} />
      {error && <Alert tone="error">{error}</Alert>}
      <ModalActions>
        <Button variant="secondary" onClick={onClose} disabled={remove.isPending}>Cancel</Button>
        <Button variant="danger" onClick={submit} loading={remove.isPending} disabled={typed.trim() !== user.username}>Delete {fullName(user)}</Button>
      </ModalActions>
    </div>
  );
}
