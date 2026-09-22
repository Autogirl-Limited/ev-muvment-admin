"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AccessDenied } from "@/components/dashboard/access-denied";
import { ConfigPageHeader, EmptyState, ErrorState, IconButton, SearchInput, SkeletonRows } from "@/components/dashboard/screen-kit";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Modal, ModalActions } from "@/components/ui/modal";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/browser";
import { createState, deleteState, updateState, type CreateStateRequest, type State } from "@/lib/api/states";
import type { Paginated } from "@/lib/api/staff";
import { useSearchState, useUrlState } from "@/lib/hooks/use-url-state";
import { LIST_PAGE_SIZE } from "@/lib/query/cache";
import { configQueries } from "@/lib/query/configuration";
import { queryKeys } from "@/lib/query/keys";
import { useCurrentUser } from "@/lib/query/user";

const ROW_GRID = "md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_5.5rem_6rem]";

interface FormState {
  name: string;
  country_id: string;
  is_active: boolean;
}

function fromState(state: State): FormState {
  return { name: state.name, country_id: state.country.id, is_active: state.is_active };
}

function StateForm({ state, onClose }: { state: State | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const countries = useQuery({ ...configQueries.countries({ page: 1, page_size: 100 }) });
  const [form, setForm] = useState<FormState>(state ? fromState(state) : { name: "", country_id: "", is_active: true });
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const save = useMutation({
    mutationFn: async () => {
      const clean: CreateStateRequest = { name: form.name.trim(), country_id: form.country_id, is_active: form.is_active };
      if (!state) return createState(clean);
      const changes: Partial<CreateStateRequest> = {};
      if (clean.name !== state.name) changes.name = clean.name;
      if (clean.country_id !== state.country.id) changes.country_id = clean.country_id;
      if (clean.is_active !== state.is_active) changes.is_active = clean.is_active;
      return Object.keys(changes).length ? updateState(state.id, changes) : state;
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.states.all });
      toast.success(state ? `${saved.name} updated.` : `${saved.name} added.`);
      onClose();
    },
    onError: (error) => {
      if (!(error instanceof ApiError)) return setFormError("Couldn't save this state. Try again.");
      if (error.status === 409) {
        setErrors({ name: "A state with this name already exists in that country.", country_id: error.message.includes("Country") ? "Country not found." : undefined });
      } else if (error.status === 404) {
        setFormError("This state was removed by someone else.");
        queryClient.invalidateQueries({ queryKey: queryKeys.states.all });
      } else if (error.status === 422 && Object.keys(error.fieldErrors).length) {
        setErrors(error.fieldErrors);
      } else {
        setFormError(error.message);
      }
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const found: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim()) found.name = "Give the state a name.";
    else if (form.name.trim().length > 100) found.name = "Names can be at most 100 characters.";
    if (!form.country_id) found.country_id = "Choose a country.";
    setErrors(found);
    if (Object.keys(found).length === 0) save.mutate();
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field label="Name" value={form.name} onChange={(e) => set("name", e.target.value)} error={errors.name} placeholder="Ogun" autoComplete="off" maxLength={100} />
      <Select label="Country" value={form.country_id} onChange={(e) => set("country_id", e.target.value)} error={errors.country_id} disabled={countries.isLoading}>
        <option value="">{countries.isLoading ? "Loading countries..." : "Choose a country"}</option>
        {countries.data?.items.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}
      </Select>
      <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-3.5">
        <div>
          <p className="text-sm font-medium">Active</p>
          <p className="text-xs text-muted">Informational only today — nothing enforces this server-side yet.</p>
        </div>
        <Switch checked={form.is_active} onChange={(value) => set("is_active", value)} label="Active" />
      </div>
      {formError && <Alert tone="error">{formError}</Alert>}
      <ModalActions>
        <Button variant="secondary" onClick={onClose} disabled={save.isPending}>Cancel</Button>
        <Button type="submit" loading={save.isPending}>{state ? "Save changes" : "Add state"}</Button>
      </ModalActions>
    </form>
  );
}

export function StatesPage() {
  const user = useCurrentUser();
  const isAdmin = user.user_type === "ADMIN";
  const isStaff = isAdmin || user.user_type === "ACCOUNT_OFFICER" || user.user_type === "RELATIONSHIP_OFFICER";
  const queryClient = useQueryClient();
  const toast = useToast();
  const url = useUrlState();
  const search = useSearchState(url);

  const [editing, setEditing] = useState<State | "new" | null>(null);
  const [removing, setRemoving] = useState<State | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const states = useQuery({
    ...configQueries.states({ page: url.page, page_size: LIST_PAGE_SIZE, searchTerm: search.committed || undefined }),
    enabled: isStaff,
  });

  const totalPages = states.data?.pagination.total_pages ?? 1;
  useEffect(() => {
    if (states.data && url.page > Math.max(1, totalPages)) url.set({ page: 1 });
  }, [states.data, totalPages, url]);

  const toggle = useMutation({
    mutationFn: ({ state, is_active }: { state: State; is_active: boolean }) => updateState(state.id, { is_active }),
    onMutate: async ({ state, is_active }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.states.all });
      const snapshots = queryClient.getQueriesData<Paginated<State>>({ queryKey: queryKeys.states.all });
      queryClient.setQueriesData<Paginated<State>>({ queryKey: queryKeys.states.all }, (data) =>
        data ? { ...data, items: data.items.map((item) => (item.id === state.id ? { ...item, is_active } : item)) } : data,
      );
      return { snapshots };
    },
    onError: (error, { state }, context) => {
      context?.snapshots.forEach(([key, data]) => queryClient.setQueryData(key, data));
      toast.error(error instanceof ApiError ? error.message : `Couldn't update ${state.name}.`);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.states.all }),
  });

  const remove = useMutation({
    mutationFn: (state: State) => deleteState(state.id),
    onSuccess: (_, state) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.states.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
      setRemoving(null);
      toast.success(`${state.name} deleted.`);
    },
    onError: (error, state) => {
      if (error instanceof ApiError && error.status === 404) {
        queryClient.invalidateQueries({ queryKey: queryKeys.states.all });
        setRemoving(null);
        toast.info(`${state.name} was already removed.`);
      } else {
        setRemoveError(error instanceof ApiError ? error.message : "Couldn't delete this state.");
      }
    },
  });

  if (!isStaff) return <AccessDenied />;

  const items = states.data?.items;
  const filtered = Boolean(search.committed);

  return (
    <div>
      <ConfigPageHeader
        icon="mapPin"
        title="States"
        description="The states you operate in, each under a country. A vehicle can be linked to one to run that state's own checklist schedule instead of the global default."
        actions={isAdmin ? <Button onClick={() => setEditing("new")}>Add state</Button> : undefined}
      />

      {!isAdmin && (
        <div className="mb-4">
          <Alert tone="info">You can browse states, but only administrators can add, edit or remove them.</Alert>
        </div>
      )}

      <div className="mb-4">
        <Alert tone="info">
          A state&apos;s own checklist schedule is set from{" "}
          <Link href="/configurations/checklist-settings" className="font-medium underline underline-offset-2">Checklist settings</Link>. Link a vehicle to a
          state from its edit form on <Link href="/fleet-vehicles" className="font-medium underline underline-offset-2">Fleet vehicles</Link>.
        </Alert>
      </div>

      <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="border-b border-border p-4">
          <SearchInput value={search.text} onChange={search.setText} placeholder="Search state or country name" label="Search states" />
        </div>

        {states.isLoading ? (
          <SkeletonRows rows={6} columns={4} />
        ) : states.isError ? (
          <ErrorState message={states.error.message} onRetry={() => states.refetch()} />
        ) : items && items.length > 0 ? (
          <>
            <div className={`hidden gap-4 bg-subtle/70 px-6 py-3 text-xs font-semibold uppercase text-muted md:grid ${ROW_GRID}`}>
              <span>State</span>
              <span>Country</span>
              <span>Active</span>
              <span className="text-right">{isAdmin ? "Actions" : ""}</span>
            </div>
            <ul className="divide-y divide-border">
              {items.map((state) => (
                <li key={state.id} className={`grid items-center gap-x-4 gap-y-2 px-4 py-4 sm:px-6 ${ROW_GRID} ${state.is_active ? "" : "bg-subtle/30"}`}>
                  <p className="min-w-0 truncate font-medium">{state.name}</p>
                  <p className="text-sm text-muted md:text-foreground">{state.country.name}</p>
                  <div className="flex items-center gap-2">
                    {isAdmin ? (
                      <Switch checked={state.is_active} onChange={(is_active) => toggle.mutate({ state, is_active })} label={`${state.name} is ${state.is_active ? "active" : "inactive"}`} />
                    ) : (
                      <Badge tone={state.is_active ? "success" : "neutral"} dot>{state.is_active ? "Active" : "Inactive"}</Badge>
                    )}
                  </div>
                  {isAdmin && (
                    <div className="-mx-1.5 flex justify-end gap-0.5 md:mx-0">
                      <IconButton label={`Edit ${state.name}`} icon="pencil" onClick={() => setEditing(state)} />
                      <IconButton label={`Delete ${state.name}`} icon="trash" tone="danger" onClick={() => { setRemoveError(null); setRemoving(state); }} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <Pagination pagination={states.data?.pagination} onPage={(page) => url.set({ page })} noun="states" />
          </>
        ) : (
          <EmptyState
            icon="mapPin"
            title={filtered ? "No states match your search" : "No states yet"}
            action={
              filtered ? (
                <Button variant="secondary" onClick={() => { search.setText(""); url.set({ q: "" }); }}>Clear search</Button>
              ) : isAdmin ? (
                <Button onClick={() => setEditing("new")}>Add a state</Button>
              ) : undefined
            }
          >
            {filtered ? "Try a different name." : "States you add will appear here."}
          </EmptyState>
        )}
      </section>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Add state" : "Edit state"} size="lg">
        {editing !== null && <StateForm state={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      </Modal>

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing)}
        title="Delete state?"
        confirmLabel="Delete state"
        loading={remove.isPending}
        error={removeError}
      >
        <p>
          <strong className="font-semibold text-foreground">{removing?.name}</strong> will be removed permanently. Any vehicle linked to it falls back to the
          global checklist settings immediately, and its own customised checklist settings (if any) are deleted along with it.
        </p>
      </ConfirmDialog>
    </div>
  );
}
