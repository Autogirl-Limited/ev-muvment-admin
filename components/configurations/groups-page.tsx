"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AccessDenied } from "@/components/dashboard/access-denied";
import { ConfigPageHeader, EmptyState, ErrorState, Icon, SearchInput, SkeletonRows } from "@/components/dashboard/screen-kit";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal, ModalActions } from "@/components/ui/modal";
import { Pagination } from "@/components/ui/pagination";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/browser";
import { createGroup, isAccountsTeam } from "@/lib/api/checklists-groups";
import { formatDate } from "@/lib/format";
import { useSearchState, useUrlState } from "@/lib/hooks/use-url-state";
import { LIST_PAGE_SIZE } from "@/lib/query/cache";
import { configQueries } from "@/lib/query/configuration";
import { queryKeys } from "@/lib/query/keys";
import { useCurrentUser } from "@/lib/query/user";

const NAME_MAX = 100;
const DESCRIPTION_MAX = 500;
const ROW_GRID = "md:grid-cols-[minmax(0,2.2fr)_6.5rem_8rem_1.5rem]";

function Counter({ value, max }: { value: number; max: number }) {
  return <span className={`text-xs tabular-nums ${value > max ? "text-danger" : "text-muted"}`}>{value}/{max}</span>;
}

function CreateGroupForm({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => createGroup({ name, description }),
    onSuccess: (group) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.groups.all });
      toast.success(`${group.name} created. Add its first members.`);
      onClose();
      router.push(`/configurations/groups/${group.id}`);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) setNameError("A group with that name already exists.");
      else if (error instanceof ApiError && error.fieldErrors.name) setNameError(error.fieldErrors.name);
      else setFormError(error instanceof ApiError ? error.message : "Couldn't create the group. Try again.");
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const clean = name.trim();
    if (!clean) return setNameError("Give the group a name.");
    if (clean.length > NAME_MAX) return setNameError(`Names can be at most ${NAME_MAX} characters.`);
    if (description.trim().length > DESCRIPTION_MAX) return setFormError(`The description can be at most ${DESCRIPTION_MAX} characters.`);
    create.mutate();
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="group-name" className="block text-sm font-medium">Name</label>
          <Counter value={name.trim().length} max={NAME_MAX} />
        </div>
        <input
          id="group-name"
          value={name}
          onChange={(event) => { setName(event.target.value); setNameError(null); }}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? "group-name-error" : undefined}
          placeholder="Field Supervisors"
          autoComplete="off"
          autoFocus
          className={`h-10 w-full rounded-lg border bg-surface px-3 text-sm outline-none transition placeholder:text-muted/60 pointer-coarse:h-11 pointer-coarse:text-base focus:border-brand focus:ring-3 focus:ring-brand/20 ${nameError ? "border-danger" : "border-input"}`}
        />
        {nameError && <p id="group-name-error" className="text-xs text-danger">{nameError}</p>}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="group-description" className="block text-sm font-medium">
            Description <span className="font-normal text-muted">(optional)</span>
          </label>
          <Counter value={description.trim().length} max={DESCRIPTION_MAX} />
        </div>
        <textarea
          id="group-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          placeholder="What is this group for?"
          className="w-full resize-y rounded-lg border border-input bg-surface px-3 py-2 text-sm outline-none transition placeholder:text-muted/60 pointer-coarse:text-base focus:border-brand focus:ring-3 focus:ring-brand/20"
        />
      </div>

      {formError && <Alert tone="error">{formError}</Alert>}
      <ModalActions>
        <Button variant="secondary" onClick={onClose} disabled={create.isPending}>Cancel</Button>
        <Button type="submit" loading={create.isPending}>Create group</Button>
      </ModalActions>
    </form>
  );
}

export function GroupsPage() {
  const user = useCurrentUser();
  const isStaff = user.user_type === "ADMIN" || user.user_type === "ACCOUNT_OFFICER" || user.user_type === "RELATIONSHIP_OFFICER";
  const url = useUrlState();
  const search = useSearchState(url);
  const [creating, setCreating] = useState(false);

  const groups = useQuery({
    ...configQueries.groups({ page: url.page, page_size: LIST_PAGE_SIZE, searchTerm: search.committed || undefined }),
    enabled: isStaff,
  });

  const totalPages = groups.data?.pagination.total_pages ?? 1;
  useEffect(() => {
    if (groups.data && url.page > Math.max(1, totalPages)) url.set({ page: 1 });
  }, [groups.data, totalPages, url]);

  if (!isStaff) return <AccessDenied />;

  const items = groups.data?.items;
  const filtered = Boolean(search.committed);

  return (
    <div>
      <ConfigPageHeader
        icon="users"
        title="Groups"
        description="Named lists of people. The Accounts Team group decides who receives live payment alerts."
        actions={<Button onClick={() => setCreating(true)}>Create group</Button>}
      />

      <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="border-b border-border p-4">
          <SearchInput value={search.text} onChange={search.setText} placeholder="Search by name or description" label="Search groups" />
        </div>

        {groups.isLoading ? (
          <SkeletonRows rows={5} columns={4} />
        ) : groups.isError ? (
          <ErrorState message={groups.error.message} onRetry={() => groups.refetch()} />
        ) : items && items.length > 0 ? (
          <>
            <div className={`hidden gap-4 bg-subtle/70 px-6 py-3 text-xs font-semibold uppercase text-muted md:grid ${ROW_GRID}`}>
              <span>Group</span>
              <span>Members</span>
              <span>Created</span>
              <span />
            </div>
            <ul className="divide-y divide-border">
              {items.map((group) => (
                <li key={group.id}>
                  <Link
                    href={`/configurations/groups/${group.id}`}
                    className={`group grid items-center gap-x-4 gap-y-1.5 px-4 py-4 transition hover:bg-subtle/50 focus-visible:bg-subtle/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand sm:px-6 ${ROW_GRID}`}
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium">{group.name}</span>
                        {isAccountsTeam(group.name) && <Badge tone="brand" dot>Receives live payment alerts</Badge>}
                      </div>
                      {group.description && <p className="line-clamp-2 text-sm text-muted">{group.description}</p>}
                    </div>
                    <p className="flex items-center gap-1.5 text-sm">
                      <Icon name="users" className="size-4 text-muted" />
                      <span className="tabular-nums">{group.member_count}</span>
                      <span className="text-muted md:hidden">{group.member_count === 1 ? "member" : "members"}</span>
                    </p>
                    <p className="text-sm text-muted">Created {formatDate(group.created_at)}</p>
                    <Icon name="chevronRight" className="hidden size-4 text-muted transition-transform group-hover:translate-x-0.5 md:block" />
                  </Link>
                </li>
              ))}
            </ul>
            <Pagination pagination={groups.data?.pagination} onPage={(page) => url.set({ page })} noun="groups" />
          </>
        ) : (
          <EmptyState
            icon="users"
            title={filtered ? "No groups match your search" : "No groups yet"}
            action={
              filtered ? (
                <Button variant="secondary" onClick={() => { search.setText(""); url.set({ q: "" }); }}>Clear search</Button>
              ) : (
                <Button onClick={() => setCreating(true)}>Create the first group</Button>
              )
            }
          >
            {filtered ? "Try a different name or description." : "Create a group to keep a list of people together."}
          </EmptyState>
        )}
      </section>

      <Modal open={creating} onClose={() => setCreating(false)} title="Create group">
        {creating && <CreateGroupForm onClose={() => setCreating(false)} />}
      </Modal>
    </div>
  );
}
