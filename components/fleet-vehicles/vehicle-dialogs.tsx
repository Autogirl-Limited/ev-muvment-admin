"use client";

import { useState, type ReactNode } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { EmptyState, Icon } from "@/components/dashboard/screen-kit";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal, ModalActions } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/browser";
import {
  assignDriver,
  deleteVehicle,
  getVehicle,
  listDriverOptions,
  listVehicles,
  unassignDriver,
  type DriverOption,
  type Vehicle,
} from "@/lib/api/configuration";
import { formatDateTime, fullName } from "@/lib/format";
import { useDebounced } from "@/lib/hooks/use-debounced";
import { CACHE } from "@/lib/query/cache";
import { queryKeys } from "@/lib/query/keys";

export function PlateChip({ plate }: { plate: string }) {
  return (
    <span className="inline-block rounded-md border border-border bg-subtle px-2 py-0.5 font-mono text-xs font-semibold uppercase tracking-wider">
      {plate}
    </span>
  );
}

/** Refreshes the fleet (and the user list, which embeds each driver's vehicle). */
function useRefreshFleet() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
  };
}

const errorText = (error: unknown, fallback: string) => (error instanceof ApiError ? error.message : fallback);

// ---------- Details ----------
interface DetailsProps {
  id: string | null;
  isAdmin: boolean;
  onClose: () => void;
  onEdit: (vehicle: Vehicle) => void;
  onAssign: (vehicle: Vehicle) => void;
  onUnassign: (vehicle: Vehicle) => void;
  onReassign: (vehicle: Vehicle) => void;
  onDelete: (vehicle: Vehicle) => void;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-subtle/60 p-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium">{children}</dd>
    </div>
  );
}

export function VehicleDetails({ id, isAdmin, onClose, onEdit, onAssign, onUnassign, onReassign, onDelete }: DetailsProps) {
  const query = useQuery({
    queryKey: queryKeys.vehicles.detail(id ?? ""),
    queryFn: ({ signal }) => getVehicle(id!, signal),
    enabled: id !== null,
  });
  const vehicle = query.data;

  return (
    <Modal open={id !== null} onClose={onClose} title={vehicle?.name ?? "Vehicle"} size="lg">
      {query.isLoading ? (
        <div role="status" aria-label="Loading" className="h-56 animate-pulse rounded-xl bg-subtle" />
      ) : query.isError ? (
        <Alert tone="error">{query.error instanceof ApiError && query.error.status === 404 ? "Vehicle not found. It may have been deleted." : query.error.message}</Alert>
      ) : vehicle ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <PlateChip plate={vehicle.plate_number} />
            <Badge tone={vehicle.driver ? "brand" : "success"} dot>{vehicle.driver ? "Assigned" : "Available"}</Badge>
          </div>

          <dl className="grid gap-3 sm:grid-cols-2">
            <Fact label="Location">{vehicle.location_state}</Fact>
            <Fact label="Type">{vehicle.vehicle_type.name}</Fact>
            <Fact label="Make">{vehicle.vehicle_make.name}</Fact>
            <Fact label="Model">{vehicle.vehicle_model.name}</Fact>
            <Fact label="Added">{formatDateTime(vehicle.created_at)}</Fact>
            <Fact label="Last updated">{formatDateTime(vehicle.updated_at)}</Fact>
          </dl>

          <div className="rounded-xl border border-border p-4">
            <p className="text-xs font-medium uppercase text-muted">Driver</p>
            {vehicle.driver ? (
              <div className="mt-3 flex items-center gap-3">
                <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-base font-semibold text-brand">
                  {fullName(vehicle.driver).charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium">{fullName(vehicle.driver)}</p>
                  <p className="truncate text-sm text-muted">
                    @{vehicle.driver.username}
                    {vehicle.driver.phone_number && (
                      <>
                        {" · "}
                        <a href={`tel:${vehicle.driver.phone_number}`} className="underline underline-offset-2">{vehicle.driver.phone_number}</a>
                      </>
                    )}
                  </p>
                  {vehicle.assigned_at && <p className="text-xs text-muted">Assigned {formatDateTime(vehicle.assigned_at)}</p>}
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted">No driver is assigned to this vehicle.</p>
            )}
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:flex-wrap sm:justify-end">
            <Button variant="ghost" onClick={() => onDelete(vehicle)} className="text-danger hover:bg-danger-soft hover:text-danger">Delete</Button>
            <Button variant="secondary" onClick={() => onEdit(vehicle)}>Edit details</Button>
            {vehicle.driver ? (
              <>
                <Button variant="secondary" onClick={() => onReassign(vehicle)}>Move driver</Button>
                <Button variant="secondary" onClick={() => onUnassign(vehicle)}>Unassign</Button>
              </>
            ) : (
              isAdmin && <Button onClick={() => onAssign(vehicle)}>Assign driver</Button>
            )}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

// ---------- Assign ----------
function driverBlocker(driver: DriverOption): string | null {
  if (!driver.is_active) return "Account deactivated";
  if (driver.vehicle) return `Drives ${driver.vehicle.name}`;
  return null;
}

export function AssignDriverDialog({ vehicle, onClose }: { vehicle: Vehicle | null; onClose: () => void }) {
  const refresh = useRefreshFleet();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const term = useDebounced(search);

  const drivers = useQuery({
    queryKey: queryKeys.users.assignableDrivers(term.trim()),
    queryFn: ({ signal }) => listDriverOptions(term, signal),
    enabled: vehicle !== null,
    staleTime: CACHE.live.staleTime,
    placeholderData: keepPreviousData,
  });

  const items = [...(drivers.data?.items ?? [])].sort((a, b) => Number(Boolean(driverBlocker(a))) - Number(Boolean(driverBlocker(b))));

  const assign = useMutation({
    mutationFn: (driverId: string) => assignDriver(vehicle!.id, driverId),
    onSuccess: (updated) => {
      refresh();
      toast.success(`${updated.driver ? fullName(updated.driver) : "The driver"} now drives ${updated.name}. They've been notified.`);
      onClose();
    },
    onError: (err) => {
      // Another admin got there first: the picker and fleet are stale, so refetch.
      if (err instanceof ApiError && (err.status === 409 || err.status === 400)) {
        refresh();
        drivers.refetch();
        setChosen(null);
      }
      setError(errorText(err, "Couldn't assign this driver. Try again."));
    },
  });

  return (
    <Modal open={vehicle !== null} onClose={assign.isPending ? () => {} : onClose} title={vehicle ? `Assign a driver to ${vehicle.name}` : "Assign a driver"} size="lg">
      {vehicle && (
        <div className="space-y-4">
          <div className="relative">
            <label htmlFor="driver-search" className="sr-only">Search drivers</label>
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              id="driver-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value.slice(0, 200))}
              placeholder="Search drivers by name or phone"
              autoFocus
              className="h-10 w-full rounded-lg border border-input bg-surface pl-9 pr-3 text-sm outline-none transition placeholder:text-muted/60 pointer-coarse:h-11 pointer-coarse:text-base focus:border-brand focus:ring-3 focus:ring-brand/20"
            />
          </div>

          <div className="max-h-[min(22rem,50dvh)] overflow-y-auto rounded-xl border border-border">
            {drivers.isLoading ? (
              <div role="status" aria-label="Loading drivers" className="animate-pulse divide-y divide-border">
                {[0, 1, 2, 3].map((row) => <div key={row} className="h-16 bg-subtle/40" />)}
              </div>
            ) : drivers.isError ? (
              <div className="p-4"><Alert tone="error">{drivers.error.message}</Alert></div>
            ) : items.length === 0 ? (
              <EmptyState icon="user" title="No drivers found">Try a different name or phone number.</EmptyState>
            ) : (
              <ul role="radiogroup" aria-label="Drivers" className="divide-y divide-border">
                {items.map((driver) => {
                  const blocker = driverBlocker(driver);
                  const selected = chosen === driver.id;
                  return (
                    <li key={driver.id}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        disabled={blocker !== null}
                        onClick={() => { setChosen(driver.id); setError(null); }}
                        className={`flex w-full items-center gap-3 px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-55 ${selected ? "bg-brand-soft" : "hover:bg-subtle/60"}`}
                      >
                        <span aria-hidden className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${selected ? "border-brand bg-brand text-brand-foreground" : "border-input"}`}>
                          {selected && <Icon name="user" className="size-3" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{fullName(driver)}</span>
                          <span className="block truncate text-xs text-muted">@{driver.username}{driver.phone_number ? ` · ${driver.phone_number}` : ""}</span>
                        </span>
                        {blocker && <span className="shrink-0 text-xs text-muted">{blocker}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {error && <Alert tone="error">{error}</Alert>}
          <p className="text-xs text-muted">Only active drivers without a vehicle can be assigned. The driver is notified straight away.</p>

          <ModalActions>
            <Button variant="secondary" onClick={onClose} disabled={assign.isPending}>Cancel</Button>
            <Button onClick={() => chosen && assign.mutate(chosen)} disabled={!chosen} loading={assign.isPending}>Assign driver</Button>
          </ModalActions>
        </div>
      )}
    </Modal>
  );
}

// ---------- Unassign ----------
export function UnassignDialog({ vehicle, onClose }: { vehicle: Vehicle | null; onClose: () => void }) {
  const refresh = useRefreshFleet();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);

  const unassign = useMutation({
    mutationFn: () => unassignDriver(vehicle!.id),
    onSuccess: () => {
      refresh();
      toast.success(`${vehicle?.name} is now available.`);
      onClose();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        // Already free (another admin got there first).
        refresh();
        toast.info(`${vehicle?.name} already had no driver.`);
        onClose();
      } else {
        setError(errorText(err, "Couldn't unassign the driver. Try again."));
      }
    },
  });

  return (
    <ConfirmDialog
      open={vehicle !== null}
      onClose={onClose}
      onConfirm={() => { setError(null); unassign.mutate(); }}
      title="Unassign driver?"
      confirmLabel="Unassign"
      tone="primary"
      loading={unassign.isPending}
      error={error}
    >
      <p>
        <strong className="font-semibold text-foreground">{vehicle?.driver ? fullName(vehicle.driver) : "The driver"}</strong> will lose access to{" "}
        <strong className="font-semibold text-foreground">{vehicle?.name}</strong> and will be notified.
      </p>
    </ConfirmDialog>
  );
}

// ---------- Move driver to another vehicle ----------
type Step = "idle" | "unassigning" | "assigning" | "stranded";

export function ReassignDialog({ vehicle, onClose }: { vehicle: Vehicle | null; onClose: () => void }) {
  const refresh = useRefreshFleet();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [targetId, setTargetId] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const term = useDebounced(search);

  const free = useQuery({
    queryKey: queryKeys.vehicles.list({ reassign: true, term: term.trim() }),
    queryFn: ({ signal }) => listVehicles({ page: 1, page_size: 50, assigned: false, searchTerm: term.trim() || undefined }, signal),
    enabled: vehicle !== null,
    staleTime: CACHE.live.staleTime,
    placeholderData: keepPreviousData,
  });
  const candidates = (free.data?.items ?? []).filter((item) => item.id !== vehicle?.id);
  const target = candidates.find((item) => item.id === targetId);
  const driver = vehicle?.driver;
  const busy = step === "unassigning" || step === "assigning";

  const finish = (assignedTo: Vehicle) => {
    refresh();
    toast.success(`${driver ? fullName(driver) : "The driver"} moved to ${assignedTo.name}.`);
    onClose();
  };

  // Track locally where a failure happened: `step` state is stale inside this async closure.
  const onMove = async () => {
    if (!vehicle || !driver || !target) return;
    setError(null);
    let unassigned = step === "stranded";
    try {
      if (!unassigned) {
        setStep("unassigning");
        await unassignDriver(vehicle.id);
        unassigned = true;
      }
      setStep("assigning");
      finish(await assignDriver(target.id, driver.id));
    } catch (err) {
      refresh();
      setStep(unassigned ? "stranded" : "idle");
      setError(errorText(err, "Something went wrong."));
    }
  };

  return (
    <Modal open={vehicle !== null} onClose={busy ? () => {} : onClose} title="Move driver to another vehicle" size="lg">
      {vehicle && driver && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl bg-subtle p-3.5 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-muted">Driver</span>
              <span className="block truncate font-medium">{fullName(driver)}</span>
            </span>
            <span className="min-w-0 flex-1 text-right">
              <span className="block text-xs text-muted">Currently on</span>
              <span className="block truncate font-medium">{vehicle.name}</span>
            </span>
          </div>

          {step === "stranded" && (
            <Alert tone="error">
              {fullName(driver)} has been unassigned from {vehicle.name} but couldn&apos;t be assigned to the new vehicle, so they have no vehicle right now. Retry to finish the move.
            </Alert>
          )}

          <div className="relative">
            <label htmlFor="vehicle-search" className="sr-only">Search available vehicles</label>
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              id="vehicle-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value.slice(0, 200))}
              placeholder="Search available vehicles"
              disabled={busy}
              className="h-10 w-full rounded-lg border border-input bg-surface pl-9 pr-3 text-sm outline-none transition placeholder:text-muted/60 pointer-coarse:h-11 pointer-coarse:text-base focus:border-brand focus:ring-3 focus:ring-brand/20 disabled:opacity-60"
            />
          </div>

          <div className="max-h-[min(20rem,45dvh)] overflow-y-auto rounded-xl border border-border">
            {free.isLoading ? (
              <div role="status" aria-label="Loading vehicles" className="animate-pulse divide-y divide-border">
                {[0, 1, 2].map((row) => <div key={row} className="h-16 bg-subtle/40" />)}
              </div>
            ) : free.isError ? (
              <div className="p-4"><Alert tone="error">{free.error.message}</Alert></div>
            ) : candidates.length === 0 ? (
              <EmptyState icon="car" title="No free vehicles">Every other vehicle already has a driver.</EmptyState>
            ) : (
              <ul role="radiogroup" aria-label="Available vehicles" className="divide-y divide-border">
                {candidates.map((item) => {
                  const selected = targetId === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        disabled={busy}
                        onClick={() => setTargetId(item.id)}
                        className={`flex w-full items-center gap-3 px-4 py-3 text-left transition disabled:opacity-60 ${selected ? "bg-brand-soft" : "hover:bg-subtle/60"}`}
                      >
                        <span aria-hidden className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${selected ? "border-brand bg-brand text-brand-foreground" : "border-input"}`}>
                          {selected && <Icon name="car" className="size-3" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{item.name}</span>
                          <span className="block truncate text-xs text-muted">{item.location_state} · {item.vehicle_make.name} {item.vehicle_model.name}</span>
                        </span>
                        <PlateChip plate={item.plate_number} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {busy && (
            <p role="status" className="flex items-center gap-2 text-sm text-muted">
              <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              {step === "unassigning" ? `Freeing ${vehicle.name}...` : `Assigning ${target?.name ?? "the new vehicle"}...`}
            </p>
          )}
          {error && step !== "stranded" && <Alert tone="error">{error}</Alert>}
          {error && step === "stranded" && <p className="text-xs text-danger">{error}</p>}

          <ModalActions>
            <Button variant="secondary" onClick={onClose} disabled={busy}>{step === "stranded" ? "Close" : "Cancel"}</Button>
            <Button onClick={onMove} disabled={!target} loading={busy}>{step === "stranded" ? "Retry assign" : "Move driver"}</Button>
          </ModalActions>
        </div>
      )}
    </Modal>
  );
}

// ---------- Delete ----------
export function DeleteVehicleDialog({ vehicle, onClose, onUnassign }: { vehicle: Vehicle | null; onClose: () => void; onUnassign: (vehicle: Vehicle) => void }) {
  const refresh = useRefreshFleet();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const hasDriver = Boolean(vehicle?.driver);

  const remove = useMutation({
    mutationFn: () => deleteVehicle(vehicle!.id),
    onSuccess: () => {
      refresh();
      toast.success(`${vehicle?.name} deleted.`);
      onClose();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 404) {
        refresh();
        toast.info(`${vehicle?.name} was already removed.`);
        onClose();
      } else {
        if (err instanceof ApiError && err.status === 409) refresh();
        setError(errorText(err, "Couldn't delete this vehicle."));
      }
    },
  });

  return (
    <ConfirmDialog
      open={vehicle !== null}
      onClose={onClose}
      onConfirm={() => { setError(null); remove.mutate(); }}
      title="Delete vehicle?"
      confirmLabel="Delete vehicle"
      loading={remove.isPending}
      confirmDisabled={hasDriver}
      error={error}
    >
      <p>
        <strong className="font-semibold text-foreground">{vehicle?.name}</strong> ({vehicle?.plate_number}) will be removed permanently. Past daily checklists keep their record of it.
      </p>
      {hasDriver && vehicle && (
        <div className="rounded-xl border border-danger/30 bg-danger-soft p-3.5 text-danger">
          <p className="font-medium">Unassign {vehicle.driver ? fullName(vehicle.driver) : "the driver"} before deleting this vehicle.</p>
          <button type="button" onClick={() => onUnassign(vehicle)} className="mt-2 font-medium underline underline-offset-2">
            Unassign driver
          </button>
        </div>
      )}
    </ConfirmDialog>
  );
}
