"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { Icon } from "@/components/dashboard/screen-kit";
import { useAccountsTeam, useSetAccountsTeamMembership } from "@/components/people/accounts-team";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Modal, ModalActions } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/browser";
import { sendDriverCredentials } from "@/lib/api/staff";
import { STAFF_ROLES, checkUsername, inviteStaff, suggestUsernames, type ManagedUser, type StaffRole } from "@/lib/api/users";
import { useDebounced } from "@/lib/hooks/use-debounced";
import { ROLE_LABELS } from "@/lib/navigation";
import { queryKeys } from "@/lib/query/keys";
import { useRefreshPeople } from "@/lib/query/users";

const USERNAME_PATTERN = /^[a-zA-Z0-9_.]+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Form {
  first_name: string;
  last_name: string;
  username: string;
  email: string;
  phone_number: string;
  user_type: StaffRole;
}

const EMPTY: Form = { first_name: "", last_name: "", username: "", email: "", phone_number: "", user_type: "ACCOUNT_OFFICER" };

function validate(form: Form): Partial<Record<keyof Form, string>> {
  const errors: Partial<Record<keyof Form, string>> = {};
  const first = form.first_name.trim();
  const last = form.last_name.trim();
  if (!first) errors.first_name = "Enter a first name.";
  else if (first.length > 100) errors.first_name = "Use 100 characters or fewer.";
  if (!last) errors.last_name = "Enter a last name.";
  else if (last.length > 100) errors.last_name = "Use 100 characters or fewer.";
  const username = form.username.trim();
  if (username.length < 3 || username.length > 50) errors.username = "Use 3 to 50 characters.";
  else if (!USERNAME_PATTERN.test(username)) errors.username = "Letters, numbers, underscores and dots only.";
  if (!EMAIL_PATTERN.test(form.email.trim())) errors.email = "Enter a valid email address.";
  const phone = form.phone_number.trim();
  if (phone && (phone.length < 7 || phone.length > 20)) errors.phone_number = "Use 7 to 20 characters, e.g. +2348012345678.";
  return errors;
}

export function InviteStaffDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Invite a staff member" size="lg">
      {open && <InviteBody onClose={onClose} />}
    </Modal>
  );
}

function InviteBody({ onClose }: { onClose: () => void }) {
  const refresh = useRefreshPeople();
  const [form, setForm] = useState<Form>(EMPTY);
  const [touched, setTouched] = useState(false);
  const [serverErrors, setServerErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [invited, setInvited] = useState<ManagedUser | null>(null);

  const errors = validate(form);
  const set = (patch: Partial<Form>) => {
    setForm((current) => ({ ...current, ...patch }));
    setServerErrors({});
    setFormError(null);
  };

  // Live username feedback, only once the value could be valid.
  const username = useDebounced(form.username.trim());
  const usernameValid = username.length >= 3 && username.length <= 50 && USERNAME_PATTERN.test(username);
  const availability = useQuery({
    queryKey: queryKeys.users.usernameCheck(username.toLowerCase()),
    queryFn: ({ signal }) => checkUsername(username, signal),
    enabled: usernameValid,
    staleTime: 15_000,
  });
  const usernameTaken = usernameValid && username === form.username.trim() && availability.data?.available === false;

  const first = useDebounced(form.first_name.trim());
  const last = useDebounced(form.last_name.trim());
  const suggestions = useQuery({
    queryKey: queryKeys.users.usernameSuggestions(first, last),
    queryFn: ({ signal }) => suggestUsernames(first, last, signal),
    enabled: Boolean(first && last),
    staleTime: 60_000,
  });
  const showSuggestions = (suggestions.data?.suggestions.length ?? 0) > 0 && (!form.username.trim() || usernameTaken);

  const invite = useMutation({
    mutationFn: () => inviteStaff(form),
    onSuccess: (user) => {
      refresh();
      setInvited(user);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) return setFormError("A user with this username, email or phone number already exists.");
      if (error instanceof ApiError && error.status === 422) {
        const mapped: Partial<Record<keyof Form, string>> = {};
        (Object.keys(EMPTY) as Array<keyof Form>).forEach((key) => {
          if (error.fieldErrors[key]) mapped[key] = error.fieldErrors[key];
        });
        if (Object.keys(mapped).length) return setServerErrors(mapped);
      }
      setFormError(error instanceof ApiError ? error.message : "Couldn't send the invite. Try again.");
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (Object.keys(errors).length || usernameTaken) return;
    invite.mutate();
  };

  if (invited) return <InviteSuccess user={invited} onClose={onClose} onAnother={() => { setInvited(null); setForm(EMPTY); setTouched(false); }} />;

  const shown = (key: keyof Form) => serverErrors[key] ?? (touched ? errors[key] : undefined);
  const usernameHint = !usernameValid ? "Letters, numbers, underscores and dots." : availability.isFetching ? "Checking availability…" : availability.data?.available ? "✓ Available" : undefined;

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" value={form.first_name} onChange={(event) => set({ first_name: event.target.value })} error={shown("first_name")} autoComplete="off" autoFocus />
        <Field label="Last name" value={form.last_name} onChange={(event) => set({ last_name: event.target.value })} error={shown("last_name")} autoComplete="off" />
      </div>

      <div className="space-y-2">
        <Field
          label="Username"
          value={form.username}
          onChange={(event) => set({ username: event.target.value })}
          error={shown("username") ?? (usernameTaken ? "That username is already taken." : undefined)}
          hint={usernameHint}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        {showSuggestions && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted">Suggestions:</span>
            {suggestions.data!.suggestions.map((item) => (
              <button key={item} type="button" onClick={() => set({ username: item })} className="rounded-full border border-border px-2.5 py-1 text-xs font-medium transition hover:border-brand hover:bg-brand-soft hover:text-brand">
                {item}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" type="email" value={form.email} onChange={(event) => set({ email: event.target.value })} error={shown("email")} hint="The temporary password is emailed here." autoComplete="off" />
        <Field label="Phone (optional)" type="tel" value={form.phone_number} onChange={(event) => set({ phone_number: event.target.value })} error={shown("phone_number")} hint="Use +234… so phone sign-in matches." autoComplete="off" />
      </div>

      <Select label="Role" value={form.user_type} onChange={(event) => set({ user_type: event.target.value as StaffRole })} hint={form.user_type === "ADMIN" ? "Admins can manage every user, including other admins." : "Can't manage users."}>
        {STAFF_ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
      </Select>

      {formError && <Alert tone="error">{formError}</Alert>}
      <ModalActions>
        <Button variant="secondary" onClick={onClose} disabled={invite.isPending}>Cancel</Button>
        <Button type="submit" loading={invite.isPending} disabled={usernameTaken}>Send invite</Button>
      </ModalActions>
    </form>
  );
}

function InviteSuccess({ user, onClose, onAnother }: { user: ManagedUser; onClose: () => void; onAnother: () => void }) {
  const toast = useToast();
  const team = useAccountsTeam();
  const membership = useSetAccountsTeamMembership(team.groupId);
  const [added, setAdded] = useState(false);
  const [resending, setResending] = useState(false);

  // The API answers 201 even when the email failed, so resending has to be one click away.
  const resend = async () => {
    setResending(true);
    try {
      await sendDriverCredentials(user.id, "EMAIL");
      toast.success("New credentials sent by email.");
    } catch (error) {
      toast.error(error instanceof ApiError && error.status === 502 ? "The password was reset but the email couldn't be delivered. Try again." : "Couldn't send credentials. Try again.");
    } finally {
      setResending(false);
    }
  };

  const addToTeam = () =>
    membership.mutate(
      { userId: user.id, member: true },
      {
        onSuccess: () => setAdded(true),
        onError: (error) => toast.error(error instanceof ApiError ? error.message : "Couldn't add them to the Accounts Team."),
      },
    );

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-success/30 bg-success-soft p-4">
        <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-success text-white"><Icon name="check" className="size-5" /></span>
        <div className="min-w-0 text-sm">
          <p className="font-semibold">Invite sent to {user.email}</p>
          <p className="mt-0.5 text-muted">They&apos;ll sign in with a temporary password and be asked to choose their own.</p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button variant="secondary" onClick={resend} loading={resending}><Icon name="mail" className="size-4" />Resend credentials</Button>
        {team.groupId && (
          <Button variant="secondary" onClick={addToTeam} loading={membership.isPending} disabled={added}>
            <Icon name="bell" className="size-4" />{added ? "On the Accounts Team" : "Add to Accounts Team"}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted">New staff aren&apos;t on the Accounts Team by default, so they get no live payment alerts until added.</p>

      <ModalActions>
        <Button variant="secondary" onClick={onAnother}>Invite another</Button>
        <Link href={`/staff/${user.id}`} onClick={onClose} className="inline-flex h-10 items-center justify-center rounded-lg bg-brand px-4 text-sm font-medium text-brand-foreground transition hover:brightness-110 pointer-coarse:h-11 pointer-coarse:text-base">
          View profile
        </Link>
      </ModalActions>
    </div>
  );
}
