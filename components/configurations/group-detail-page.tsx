"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AccessDenied } from "@/components/dashboard/access-denied";
import { ConfigPageHeader, EmptyState, ErrorState, Icon, IconButton, SearchInput } from "@/components/dashboard/screen-kit";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal, ModalActions } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/browser";
import {
  addGroupMember,
  deleteGroup,
  isAccountsTeam,
  removeGroupMember,
  searchUsers,
  type Group,
  type GroupMember,
} from "@/lib/api/checklists-groups";
import { formatDate, fullName } from "@/lib/format";
import { useDebounced } from "@/lib/hooks/use-debounced";
import { ROLE_LABELS } from "@/lib/navigation";
import { CACHE } from "@/lib/query/cache";
import { configQueries } from "@/lib/query/configuration";
import { queryKeys } from "@/lib/query/keys";
import { useStaffNames } from "@/lib/query/staff-names";
import { useCurrentUser } from "@/lib/query/user";

const MEMBER_GRID = "md:grid-cols-[minmax(0,1.6fr)_9rem_minmax(0,1.4fr)_minmax(0,1fr)_3rem]";

function RoleBadge({ type }: { type: GroupMember["user_type"] }) {
  return <Badge tone={type === "ADMIN" ? "brand" : "neutral"}>{ROLE_LABELS[type]}</Badge>;
}

// ---------- Add members ----------
type Progress = { status: "working" | "done" | "failed"; message?: string };

function AddMembersDialog({ group, isAdmin, onClose }: { group: Group; isAdmin: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Map<string, string>>(new Map());
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const [running, setRunning] = useState(false);
  const term = useDebounced(search);
  const staffOnly = isAccountsTeam(group.name);
  const memberIds = new Set((group.members ?? []).map((member) => member.id));

  const users = useQuery({
    queryKey: queryKeys.users.search(term.trim()),
    queryFn: ({ signal }) => searchUsers(term, signal),
    enabled: isAdmin,
    placeholderData: keepPreviousData,
    ...CACHE.live,
  });

  // The Accounts Team receives every driver's payment alerts, so drivers can't be added to it.
  const people = (users.data?.items ?? []).filter((person) => !(staffOnly && person.user_type === "DRIVER"));

  const toggle = (id: string, name: string) =>
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(id)) next.delete(id);
      else next.set(id, name);
      return next;
    });

  const run = async () => {
    setRunning(true);
    const ids = [...selected.keys()].filter((id) => progress[id]?.status !== "done");
    let failures = 0;
    // No bulk endpoint: one request per person, with visible progress.
    for (const id of ids) {
      setProgress((current) => ({ ...current, [id]: { status: "working" } }));
      try {
        await addGroupMember(group.id, id);
        setProgress((current) => ({ ...current, [id]: { status: "done" } }));
      } catch (error) {
        failures += 1;
        const message =
          error instanceof ApiError && error.status === 404 && /user/i.test(error.message)
            ? "That user no longer exists."
            : error instanceof ApiError
              ? error.message
              : "Couldn't add this person.";
        setProgress((current) => ({ ...current, [id]: { status: "failed", message } }));
      }
    }
    queryClient.invalidateQueries({ queryKey: queryKeys.groups.all });
    setRunning(false);
    if (failures === 0) {
      toast.success(`${ids.length} ${ids.length === 1 ? "person" : "people"} added to ${group.name}.`);
      onClose();
    }
  };

  if (!isAdmin) {
    return (
      <div className="space-y-4">
        <EmptyState icon="lock" title="Only administrators can look people up">
          Finding someone to add needs the user directory, which only administrators can search. Ask an administrator to add members for you.
        </EmptyState>
        <ModalActions>
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </ModalActions>
      </div>
    );
  }

  const hasFailures = Object.values(progress).some((item) => item.status === "failed");

  return (
    <div className="space-y-4">
      <div className="relative">
        <label htmlFor="member-search" className="sr-only">Search people</label>
        <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input
          id="member-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value.slice(0, 200))}
          placeholder="Search by name, username, email or phone"
          disabled={running}
          autoFocus
          className="h-10 w-full rounded-lg border border-input bg-surface pl-9 pr-3 text-sm outline-none transition placeholder:text-muted/60 pointer-coarse:h-11 pointer-coarse:text-base focus:border-brand focus:ring-3 focus:ring-brand/20 disabled:opacity-60"
        />
      </div>

      {staffOnly && (
        <Alert tone="info">Only staff can join the Accounts Team, because members receive alerts about every driver&apos;s payments.</Alert>
      )}

      <div className="max-h-[min(22rem,48dvh)] overflow-y-auto rounded-xl border border-border">
        {users.isLoading ? (
          <div role="status" aria-label="Loading people" className="animate-pulse divide-y divide-border">
            {[0, 1, 2, 3].map((row) => <div key={row} className="h-16 bg-subtle/40" />)}
          </div>
        ) : users.isError ? (
          <div className="p-4"><Alert tone="error">{users.error.message}</Alert></div>
        ) : people.length === 0 ? (
          <EmptyState icon="user" title="No one found">Try a different name, username, email or phone number.</EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {people.map((person) => {
              const isMember = memberIds.has(person.id);
              const blocked = isMember || !person.is_active;
              const checked = selected.has(person.id);
              const state = progress[person.id];
              return (
                <li key={person.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={checked || isMember}
                    disabled={blocked || running}
                    onClick={() => toggle(person.id, fullName(person))}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${checked ? "bg-brand-soft" : "hover:bg-subtle/60"}`}
                  >
                    <span aria-hidden className={`flex size-5 shrink-0 items-center justify-center rounded-md border-2 ${checked || isMember ? "border-brand bg-brand text-brand-foreground" : "border-input"}`}>
                      {(checked || isMember) && <Icon name="check" className="size-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="truncate text-sm font-medium">{fullName(person)}</span>
                        <RoleBadge type={person.user_type} />
                      </span>
                      <span className="block truncate text-xs text-muted">@{person.username}{person.email ? ` · ${person.email}` : ""}</span>
                      {state?.status === "failed" && <span className="block text-xs text-danger">{state.message}</span>}
                    </span>
                    <span className="shrink-0 text-xs text-muted">
                      {state?.status === "working" ? "Adding..." : state?.status === "done" ? "Added" : isMember ? "Already a member" : !person.is_active ? "Deactivated" : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ModalActions>
        <span className="mr-auto self-center text-sm text-muted">{selected.size} selected</span>
        <Button variant="secondary" onClick={onClose} disabled={running}>{hasFailures ? "Close" : "Cancel"}</Button>
        <Button onClick={run} disabled={selected.size === 0} loading={running}>
          {hasFailures ? "Retry failed" : `Add ${selected.size || ""} ${selected.size === 1 ? "person" : "people"}`}
        </Button>
      </ModalActions>
    </div>
  );
}

// ---------- Page ----------
export function GroupDetailPage({ id }: { id: string }) {
  const user = useCurrentUser();
  const isAdmin = user.user_type === "ADMIN";
  const isStaff = isAdmin || user.user_type === "ACCOUNT_OFFICER" || user.user_type === "RELATIONSHIP_OFFICER";
  const queryClient = useQueryClient();
  const router = useRouter();
  const toast = useToast();

  const [filter, setFilter] = useState("");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<GroupMember | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [typedName, setTypedName] = useState("");

  const groupQuery = useQuery({ ...configQueries.group(id), enabled: isStaff });
  const group = groupQuery.data;
  const nameOf = useStaffNames([group?.created_by], isAdmin);

  const gone = () => {
    queryClient.removeQueries({ queryKey: queryKeys.groups.detail(id) });
    queryClient.invalidateQueries({ queryKey: queryKeys.groups.all });
  };

  const remove = useMutation({
    mutationFn: (member: GroupMember) => removeGroupMember(id, member.id),
    onSuccess: (_, member) => {
      // Update the cached detail straight away instead of waiting for a refetch.
      queryClient.setQueryData<Group>(queryKeys.groups.detail(id), (current) =>
        current && current.members
          ? { ...current, members: current.members.filter((item) => item.id !== member.id), member_count: current.members.length - 1 }
          : current,
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.groups.all });
      setRemoving(null);
      toast.success(`${fullName(member)} removed.`);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 404) {
        gone();
        setRemoving(null);
        return;
      }
      setRemoveError(error instanceof ApiError ? error.message : "Couldn't remove this person.");
    },
  });

  const destroy = useMutation({
    mutationFn: () => deleteGroup(id),
    onSuccess: () => {
      gone();
      toast.success(`${group?.name ?? "Group"} deleted.`);
      router.replace("/configurations/groups");
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 404) {
        gone();
        router.replace("/configurations/groups");
        return;
      }
      setDeleteError(error instanceof ApiError ? error.message : "Couldn't delete the group.");
    },
  });

  if (!isStaff) return <AccessDenied />;

  const backProps = { backHref: "/configurations/groups", backLabel: "Groups" } as const;

  if (groupQuery.isLoading) {
    return (
      <div>
        <ConfigPageHeader icon="users" title="Group" {...backProps} />
        <div role="status" aria-label="Loading" className="animate-pulse space-y-4">
          <div className="h-32 rounded-2xl bg-subtle" />
          <div className="h-64 rounded-2xl bg-subtle" />
        </div>
      </div>
    );
  }

  if (groupQuery.isError || !group) {
    const missing = groupQuery.error instanceof ApiError && groupQuery.error.status === 404;
    return (
      <div>
        <ConfigPageHeader icon="users" title="Group" {...backProps} />
        <div className="rounded-2xl border border-border bg-surface shadow-card">
          {missing ? (
            <EmptyState icon="users" title="This group no longer exists" action={<Button onClick={() => router.replace("/configurations/groups")}>Back to groups</Button>}>
              It may have been deleted by someone else.
            </EmptyState>
          ) : (
            <ErrorState message={groupQuery.error?.message ?? "Something went wrong."} onRetry={() => groupQuery.refetch()} />
          )}
        </div>
      </div>
    );
  }

  const members = group.members ?? [];
  const special = isAccountsTeam(group.name);
  const needle = filter.trim().toLowerCase();
  const visible = needle
    ? members.filter((member) =>
        [fullName(member), member.username, member.email ?? "", member.phone_number ?? "", ROLE_LABELS[member.user_type]].some((text) => text.toLowerCase().includes(needle)),
      )
    : members;
  const creator = group.created_by ? (nameOf(group.created_by) ?? "a staff member") : null;

  return (
    <div>
      <ConfigPageHeader
        icon="users"
        title={group.name}
        description={group.description ?? "No description."}
        {...backProps}
        actions={
          <>
            <Button variant="secondary" onClick={() => { setDeleteError(null); setTypedName(""); setDeleting(true); }} className="text-danger">
              <Icon name="trash" className="size-4" />
              Delete
            </Button>
            <Button onClick={() => setAdding(true)}>
              <Icon name="plus" className="size-4" />
              Add members
            </Button>
          </>
        }
      />

      {special && (
        <div className="mb-5">
          <Alert tone="info">
            <strong className="font-semibold">Receives live payment alerts.</strong> Everyone in this group gets a live notice, an email and an in-app alert whenever a driver&apos;s virtual account is funded, plus wallet top-up updates. New staff aren&apos;t added automatically.
          </Alert>
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">
              Members <span className="font-normal text-muted tabular-nums">({members.length})</span>
            </h2>
            <p className="text-xs text-muted">
              Created {formatDate(group.created_at)}
              {creator ? ` by ${creator}` : ""}
            </p>
          </div>
          {members.length > 0 && (
            <div className="sm:w-72">
              <SearchInput value={filter} onChange={setFilter} placeholder="Filter members" label="Filter members" />
            </div>
          )}
        </div>

        {members.length === 0 ? (
          <EmptyState icon="users" title="No members yet" action={<Button onClick={() => setAdding(true)}>Add members</Button>}>
            Add people to this group.
          </EmptyState>
        ) : visible.length === 0 ? (
          <EmptyState icon="search" title="No members match" action={<Button variant="secondary" onClick={() => setFilter("")}>Clear filter</Button>}>
            Try a different name, role or email.
          </EmptyState>
        ) : (
          <>
            <div className={`hidden gap-4 bg-subtle/70 px-6 py-3 text-xs font-semibold uppercase text-muted md:grid ${MEMBER_GRID}`}>
              <span>Member</span>
              <span>Role</span>
              <span>Email</span>
              <span>Phone</span>
              <span />
            </div>
            <ul className="divide-y divide-border">
              {visible.map((member) => (
                <li key={member.id} className={`grid items-center gap-x-4 gap-y-1.5 px-4 py-3.5 sm:px-6 ${MEMBER_GRID}`}>
                  <div className="flex min-w-0 items-center gap-3">
                    <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand">
                      {fullName(member).charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{fullName(member)}</p>
                      <p className="truncate text-xs text-muted">@{member.username}</p>
                    </div>
                  </div>
                  <div><RoleBadge type={member.user_type} /></div>
                  <p className="truncate text-sm text-muted md:text-foreground">{member.email ?? <span className="text-muted">No email</span>}</p>
                  <p className="text-sm text-muted md:text-foreground">{member.phone_number ?? <span className="text-muted">No phone</span>}</p>
                  <div className="-mx-1.5 flex justify-start md:mx-0 md:justify-end">
                    <IconButton label={`Remove ${fullName(member)}`} icon="userMinus" tone="danger" onClick={() => { setRemoveError(null); setRemoving(member); }} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <Modal open={adding} onClose={() => setAdding(false)} title={`Add members to ${group.name}`} size="lg">
        {adding && <AddMembersDialog group={group} isAdmin={isAdmin} onClose={() => setAdding(false)} />}
      </Modal>

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing)}
        title="Remove member?"
        confirmLabel="Remove"
        loading={remove.isPending}
        error={removeError}
      >
        <p>
          <strong className="font-semibold text-foreground">{removing ? fullName(removing) : ""}</strong> will be removed from {group.name}
          {special ? " and will stop receiving live payment alerts" : ""}. They stay a user.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={() => destroy.mutate()}
        title={special ? "Stop all payment alerts?" : "Delete group?"}
        confirmLabel={special ? "Delete Accounts Team" : "Delete group"}
        loading={destroy.isPending}
        confirmDisabled={special && typedName.trim().toUpperCase() !== group.name.trim().toUpperCase()}
        error={deleteError}
      >
        <p>
          This removes <strong className="font-semibold text-foreground">{group.name}</strong> and its {group.member_count} {group.member_count === 1 ? "membership" : "memberships"}. The people themselves aren&apos;t deleted.
        </p>
        {special && (
          <div className="space-y-2 rounded-xl border border-danger/30 bg-danger-soft p-3.5 text-danger">
            <p className="font-medium">Live payment alerts, alert emails and &ldquo;Driver DVA funded&rdquo; notifications stop immediately for everyone on this team.</p>
            <p className="text-sm">Recreating a group with the exact same name and re-adding the members turns them back on.</p>
            <label className="block pt-1 text-sm text-foreground">
              Type <strong className="font-mono">{group.name}</strong> to confirm
              <input
                value={typedName}
                onChange={(event) => setTypedName(event.target.value)}
                autoComplete="off"
                className="mt-1.5 h-10 w-full rounded-lg border border-input bg-surface px-3 font-mono text-sm outline-none focus:border-danger focus:ring-3 focus:ring-danger/20 pointer-coarse:h-11 pointer-coarse:text-base"
              />
            </label>
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}
