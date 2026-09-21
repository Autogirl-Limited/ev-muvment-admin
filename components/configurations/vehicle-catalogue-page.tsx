"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AccessDenied } from "@/components/dashboard/access-denied";
import { ConfigPageHeader, EmptyState, ErrorState, IconButton, Icon, SearchInput, SkeletonRows, type IconName } from "@/components/dashboard/screen-kit";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Modal, ModalActions } from "@/components/ui/modal";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/browser";
import {
  createCatalogueEntry,
  createVehicleModel,
  deleteCatalogueEntry,
  deleteVehicleModel,
  listVehicleModels,
  listVehicles,
  renameCatalogueEntry,
  updateVehicleModel,
  type CatalogueKind,
  type VehicleMake,
  type VehicleModel,
  type VehicleType,
} from "@/lib/api/configuration";
import { formatDate, sameName } from "@/lib/format";
import { useSearchState, useUrlState } from "@/lib/hooks/use-url-state";
import { CACHE, LIST_PAGE_SIZE } from "@/lib/query/cache";
import { useMakeOptions, useModelOptions, useTypeOptions } from "@/lib/query/catalogue";
import { configQueries } from "@/lib/query/configuration";
import { queryKeys } from "@/lib/query/keys";
import { useCurrentUser } from "@/lib/query/user";

type Tab = "types" | "makes" | "models";

const TABS: { id: Tab; label: string; singular: string; icon: IconName; blurb: string }[] = [
  { id: "types", label: "Types", singular: "type", icon: "car", blurb: "Body styles such as SUV, Sedan or Electric SUV." },
  { id: "makes", label: "Makes", singular: "make", icon: "tag", blurb: "Manufacturers such as Tesla, BYD or Hyundai." },
  { id: "models", label: "Models", singular: "model", icon: "bolt", blurb: "Each model belongs to one make, like Model 3 under Tesla." },
];

/** An entry being added, renamed or moved. */
type Editing =
  | { tab: "types" | "makes"; entry: VehicleType | VehicleMake | null }
  | { tab: "models"; entry: VehicleModel | null };

/** An entry pending deletion. */
type Removing =
  | { tab: "types" | "makes"; entry: VehicleType | VehicleMake }
  | { tab: "models"; entry: VehicleModel };

const message = (error: unknown, fallback: string) => (error instanceof ApiError ? error.message : fallback);

/** How many vehicles (or models, for a make) depend on an entry. Loaded only while a dialog needs it. */
function useUsage(target: { tab: Tab; id: string } | null) {
  return useQuery({
    queryKey: queryKeys.vehicles.count({ usage: target }),
    enabled: target !== null,
    staleTime: CACHE.live.staleTime,
    queryFn: async ({ signal }) => {
      if (!target) return 0;
      if (target.tab === "makes") {
        return (await listVehicleModels({ page: 1, page_size: 1, vehicleMakeId: target.id }, signal)).pagination.total_items;
      }
      const filter = target.tab === "types" ? { vehicleTypeId: target.id } : { vehicleModelId: target.id };
      return (await listVehicles({ page: 1, page_size: 1, ...filter }, signal)).pagination.total_items;
    },
  });
}

function EntryForm({ editing, onClose }: { editing: Editing; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const tab = TABS.find((item) => item.id === editing.tab)!;
  const isModel = editing.tab === "models";
  const model = isModel ? (editing.entry as VehicleModel | null) : null;
  const existing = editing.entry;

  const [name, setName] = useState(existing?.name ?? "");
  const [makeId, setMakeId] = useState(model?.vehicle_make_id ?? "");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  // Duplicate checks run against the full lists, not just the visible page.
  const types = useTypeOptions(editing.tab === "types");
  const makes = useMakeOptions(isModel || editing.tab === "makes");
  const modelsOfMake = useModelOptions(makeId, { enabled: isModel });
  const siblings: { id: string; name: string }[] =
    (editing.tab === "types" ? types.data : editing.tab === "makes" ? makes.data : modelsOfMake.data) ?? [];

  const movingMake = isModel && model !== null && makeId !== "" && makeId !== model.vehicle_make_id;
  const usage = useUsage(movingMake && model ? { tab: "models", id: model.id } : null);
  const affected = usage.data ?? 0;

  const save = useMutation({
    mutationFn: async () => {
      const clean = name.trim();
      if (editing.tab === "models") {
        if (!editing.entry) return createVehicleModel({ vehicle_make_id: makeId, name: clean });
        const changes: { name?: string; vehicle_make_id?: string } = {};
        if (clean !== editing.entry.name) changes.name = clean;
        if (makeId !== editing.entry.vehicle_make_id) changes.vehicle_make_id = makeId;
        return Object.keys(changes).length ? updateVehicleModel(editing.entry.id, changes) : editing.entry;
      }
      if (!editing.entry) return createCatalogueEntry(editing.tab, clean);
      return clean !== editing.entry.name ? renameCatalogueEntry(editing.tab, editing.entry.id, clean) : editing.entry;
    },
    onSuccess: (saved) => {
      // Names are joined live onto vehicles, so renames and moves must refresh the fleet too.
      queryClient.invalidateQueries({ queryKey: queryKeys[editing.tab === "types" ? "vehicleTypes" : editing.tab === "makes" ? "vehicleMakes" : "vehicleModels"].all });
      if (existing) queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
      toast.success(existing ? `${saved.name} saved.` : `${saved.name} added.`);
      onClose();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) setFieldError("That name already exists.");
      else if (err instanceof ApiError && err.status === 404) {
        queryClient.invalidateQueries({ queryKey: queryKeys.vehicleMakes.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.vehicleModels.all });
        setError(err.message);
      } else if (err instanceof ApiError && err.fieldErrors.name) setFieldError(err.fieldErrors.name);
      else setError(message(err, "Couldn't save. Try again."));
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const clean = name.trim();
    if (!clean) return setFieldError(`Enter a ${tab.singular} name.`);
    if (clean.length > 100) return setFieldError("Names can be at most 100 characters.");
    if (isModel && !makeId) return setError("Choose a make first.");
    if (siblings.some((item) => item.id !== existing?.id && sameName(item.name, clean))) {
      return setFieldError(isModel ? "That make already has a model with this name." : `A ${tab.singular} with this name already exists.`);
    }
    if (movingMake && affected > 0 && !confirmed) return setError("Please confirm the move to continue.");
    save.mutate();
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {isModel && (
        <Select
          label="Make"
          value={makeId}
          onChange={(event) => { setMakeId(event.target.value); setConfirmed(false); setFieldError(null); }}
          disabled={makes.isLoading}
          hint={model ? undefined : "Every model belongs to one make."}
        >
          <option value="">{makes.isLoading ? "Loading makes..." : "Choose a make"}</option>
          {makes.data?.map((make) => <option key={make.id} value={make.id}>{make.name}</option>)}
        </Select>
      )}
      <Field
        label={isModel ? "Model name" : `${tab.singular[0].toUpperCase()}${tab.singular.slice(1)} name`}
        value={name}
        onChange={(event) => { setName(event.target.value); setFieldError(null); }}
        error={fieldError ?? undefined}
        placeholder={editing.tab === "types" ? "Electric Van" : editing.tab === "makes" ? "Rivian" : "Cybertruck"}
        maxLength={100}
        autoComplete="off"
        autoFocus
      />

      {existing && !movingMake && (
        <Alert tone="info">This name changes on every vehicle that uses it.</Alert>
      )}
      {movingMake && (
        <div className="space-y-3 rounded-xl border border-danger/30 bg-danger-soft p-3.5 text-sm">
          <p className="font-medium text-danger">
            {usage.isLoading ? "Checking which vehicles are affected..." : affected > 0 ? `This changes the make shown on ${affected} vehicle${affected === 1 ? "" : "s"}.` : "No vehicles use this model, so nothing else changes."}
          </p>
          {affected > 0 && (
            <label className="flex cursor-pointer items-start gap-2.5 text-foreground">
              <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5 size-4 accent-[var(--brand)]" />
              <span>I understand these vehicles will show the new make.</span>
            </label>
          )}
        </div>
      )}
      {error && <Alert tone="error">{error}</Alert>}

      <ModalActions>
        <Button variant="secondary" onClick={onClose} disabled={save.isPending}>Cancel</Button>
        <Button type="submit" loading={save.isPending} disabled={movingMake && usage.isLoading}>
          {existing ? (movingMake ? "Move and save" : "Save changes") : `Add ${tab.singular}`}
        </Button>
      </ModalActions>
    </form>
  );
}

function RemoveDialog({ removing, onClose }: { removing: Removing | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const usage = useUsage(removing ? { tab: removing.tab, id: removing.entry.id } : null);
  const inUse = (usage.data ?? 0) > 0;
  const tab = TABS.find((item) => item.id === removing?.tab);

  const remove = useMutation({
    mutationFn: (target: Removing) =>
      target.tab === "models" ? deleteVehicleModel(target.entry.id) : deleteCatalogueEntry(target.tab as CatalogueKind, target.entry.id),
    onSuccess: (_, target) => {
      queryClient.invalidateQueries({ queryKey: queryKeys[target.tab === "types" ? "vehicleTypes" : target.tab === "makes" ? "vehicleMakes" : "vehicleModels"].all });
      onClose();
      toast.success(`${target.entry.name} deleted.`);
    },
    onError: (err, target) => {
      if (err instanceof ApiError && err.status === 404) {
        queryClient.invalidateQueries({ queryKey: queryKeys[target.tab === "types" ? "vehicleTypes" : target.tab === "makes" ? "vehicleMakes" : "vehicleModels"].all });
        onClose();
        toast.info(`${target.entry.name} was already removed.`);
      } else {
        usage.refetch();
        setError(message(err, "Couldn't delete this entry."));
      }
    },
  });

  const entry = removing?.entry;
  const viewHref =
    removing?.tab === "types"
      ? `/fleet-vehicles?type=${entry?.id}`
      : removing?.tab === "models"
        ? `/fleet-vehicles?model=${entry?.id}`
        : `/configurations/vehicle-catalogue?tab=models&make=${entry?.id}`;

  return (
    <ConfirmDialog
      open={removing !== null}
      onClose={onClose}
      onConfirm={() => removing && remove.mutate(removing)}
      title={`Delete ${tab?.singular ?? "entry"}?`}
      confirmLabel="Delete"
      loading={remove.isPending}
      confirmDisabled={usage.isLoading || inUse}
      error={error}
    >
      <p>
        <strong className="font-semibold text-foreground">{entry?.name}</strong> will be removed permanently.
      </p>
      {usage.isLoading && <p>Checking whether it&apos;s in use...</p>}
      {inUse && (
        <div className="rounded-xl border border-danger/30 bg-danger-soft p-3.5 text-danger">
          <p className="font-medium">
            {removing?.tab === "makes"
              ? `Still has ${usage.data} model${usage.data === 1 ? "" : "s"}. Delete or move those first.`
              : `Used by ${usage.data} vehicle${usage.data === 1 ? "" : "s"}. Change or remove those vehicles first.`}
          </p>
          <Link href={viewHref} className="mt-2 inline-flex items-center gap-1 font-medium underline underline-offset-2">
            {removing?.tab === "makes" ? "View its models" : "View those vehicles"}
            <Icon name="arrowRight" className="size-4" />
          </Link>
        </div>
      )}
    </ConfirmDialog>
  );
}

export function VehicleCataloguePage() {
  const user = useCurrentUser();
  const isStaff = user.user_type === "ADMIN" || user.user_type === "ACCOUNT_OFFICER" || user.user_type === "RELATIONSHIP_OFFICER";
  const url = useUrlState();
  const search = useSearchState(url);

  const tab: Tab = (["types", "makes", "models"] as const).find((id) => id === url.get("tab")) ?? "types";
  const makeFilter = tab === "models" ? url.get("make") : "";
  const current = TABS.find((item) => item.id === tab)!;

  const [editing, setEditing] = useState<Editing | null>(null);
  const [removing, setRemoving] = useState<Removing | null>(null);

  const params = { page: url.page, page_size: LIST_PAGE_SIZE, searchTerm: search.committed || undefined };

  const types = useQuery({ ...configQueries.types(params), enabled: isStaff && tab === "types" });
  const makes = useQuery({ ...configQueries.makes(params), enabled: isStaff && tab === "makes" });
  const models = useQuery({
    ...configQueries.models({ ...params, vehicleMakeId: makeFilter || undefined }),
    enabled: isStaff && tab === "models",
  });
  const makeOptions = useMakeOptions(isStaff && tab === "models");

  const active = tab === "types" ? types : tab === "makes" ? makes : models;
  const totalPages = active.data?.pagination.total_pages ?? 1;
  useEffect(() => {
    if (active.data && url.page > Math.max(1, totalPages)) url.set({ page: 1 });
  }, [active.data, totalPages, url]);

  if (!isStaff) return <AccessDenied />;

  const switchTab = (next: Tab) => {
    search.setText("");
    url.set({ tab: next === "types" ? null : next, q: "", make: "", page: 1 });
  };
  const filtered = Boolean(search.committed || makeFilter);
  const addNew = () => setEditing({ tab, entry: null } as Editing);

  return (
    <div>
      <ConfigPageHeader
        icon="tag"
        title="Vehicle catalogue"
        description="The types, makes and models offered when you add a vehicle. Changes here show up in the vehicle form straight away."
        actions={<Button onClick={addNew}>Add {current.singular}</Button>}
      />

      <div role="tablist" aria-label="Catalogue lists" className="mb-4 grid grid-cols-3 gap-1 rounded-xl bg-subtle p-1 sm:inline-grid sm:w-auto">
        {TABS.map((item) => (
          <button
            key={item.id}
            role="tab"
            type="button"
            id={`tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls="catalogue-panel"
            onClick={() => switchTab(item.id)}
            className={`flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition pointer-coarse:h-11 ${
              tab === item.id ? "bg-surface text-foreground shadow-card" : "text-muted hover:text-foreground"
            }`}
          >
            <Icon name={item.icon} className="hidden size-4 sm:block" />
            {item.label}
          </button>
        ))}
      </div>

      <section id="catalogue-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="space-y-3 border-b border-border p-4">
          <p className="text-sm text-muted">{current.blurb}</p>
          <div className={`grid gap-3 ${tab === "models" ? "sm:grid-cols-[minmax(0,1fr)_16rem]" : ""}`}>
            <SearchInput
              value={search.text}
              onChange={search.setText}
              placeholder={tab === "models" ? "Search model or make" : `Search ${current.label.toLowerCase()}`}
              label={`Search ${current.label.toLowerCase()}`}
            />
            {tab === "models" && (
              <Select label="Filter by make" hideLabel value={makeFilter} onChange={(event) => url.set({ make: event.target.value })}>
                <option value="">All makes</option>
                {makeOptions.data?.map((make) => <option key={make.id} value={make.id}>{make.name}</option>)}
              </Select>
            )}
          </div>
        </div>

        {active.isLoading ? (
          <SkeletonRows rows={6} columns={3} />
        ) : active.isError ? (
          <ErrorState message={active.error.message} onRetry={() => active.refetch()} />
        ) : active.data && active.data.items.length > 0 ? (
          <>
            <div className={`hidden gap-4 bg-subtle/70 px-6 py-3 text-xs font-semibold uppercase text-muted md:grid ${tab === "models" ? "md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_6rem]" : "md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_6rem]"}`}>
              <span>Name</span>
              {tab === "models" && <span>Make</span>}
              <span>Added</span>
              <span className="text-right">Actions</span>
            </div>
            <ul className="divide-y divide-border">
              {(tab === "models" ? models.data?.items ?? [] : tab === "types" ? types.data?.items ?? [] : makes.data?.items ?? []).map((entry) => {
                const model = tab === "models" ? (entry as VehicleModel) : null;
                return (
                  <li
                    key={entry.id}
                    className={`grid items-center gap-x-4 gap-y-1 px-4 py-3.5 sm:px-6 ${tab === "models" ? "md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_6rem]" : "md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_6rem]"}`}
                  >
                    <div className="flex min-w-0 items-start justify-between gap-2 md:contents">
                      <div className="min-w-0 md:contents">
                        <p className="min-w-0 truncate font-medium">{entry.name}</p>
                        {model && <p className="truncate text-sm text-muted md:text-foreground">{model.vehicle_make_name}</p>}
                        <p className="text-xs text-muted md:text-sm">Added {formatDate(entry.created_at)}</p>
                      </div>
                      <div className="-mr-1.5 flex shrink-0 justify-end gap-0.5 md:mr-0">
                        <IconButton label={`Edit ${entry.name}`} icon="pencil" onClick={() => setEditing({ tab, entry } as Editing)} />
                        <IconButton label={`Delete ${entry.name}`} icon="trash" tone="danger" onClick={() => setRemoving({ tab, entry } as Removing)} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <Pagination pagination={active.data.pagination} onPage={(page) => url.set({ page })} noun={current.label.toLowerCase()} />
          </>
        ) : (
          <EmptyState
            icon={current.icon}
            title={filtered ? `No ${current.label.toLowerCase()} match` : `No ${current.label.toLowerCase()} yet`}
            action={
              filtered ? (
                <Button variant="secondary" onClick={() => { search.setText(""); url.set({ q: "", make: "" }); }}>Clear filters</Button>
              ) : (
                <Button onClick={addNew}>Add {current.singular}</Button>
              )
            }
          >
            {filtered ? "Try a different search." : current.blurb}
          </EmptyState>
        )}
      </section>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `${editing.entry ? "Edit" : "Add"} ${TABS.find((item) => item.id === editing.tab)?.singular}` : ""}
      >
        {editing && <EntryForm key={`${editing.tab}-${editing.entry?.id ?? "new"}`} editing={editing} onClose={() => setEditing(null)} />}
      </Modal>

      {/* Mounted only while open, so each deletion starts with a clean state. */}
      {removing && <RemoveDialog removing={removing} onClose={() => setRemoving(null)} />}
    </div>
  );
}
