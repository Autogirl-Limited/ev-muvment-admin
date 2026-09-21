"use client";

import { useState } from "react";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";

import { EmptyState, Icon, SearchInput } from "@/components/dashboard/screen-kit";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal, ModalActions } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/browser";
import { assignDriver, listVehicles, unassignDriver } from "@/lib/api/configuration";
import type { ManagedUser } from "@/lib/api/users";
import { fullName } from "@/lib/format";
import { useDebounced } from "@/lib/hooks/use-debounced";
import { CACHE } from "@/lib/query/cache";
import { queryKeys } from "@/lib/query/keys";
import { useRefreshPeople } from "@/lib/query/users";

const errorText = (error: unknown, fallback: string) => (error instanceof ApiError ? error.message : fallback);

interface DriverDialogProps {
  driver: ManagedUser | null;
  onClose: () => void;
}

/** Pick a free vehicle for this driver. The mirror image of the fleet page's "assign a driver". */
export function AssignVehicleDialog({ driver, onClose }: DriverDialogProps) {
  return (
    <Modal open={driver !== null} onClose={onClose} title={driver ? `Assign a vehicle to ${fullName(driver)}` : "Assign a vehicle"} size="lg">
      {driver && <AssignVehicleBody driver={driver} onClose={onClose} />}
    </Modal>
  );
}

function AssignVehicleBody({ driver, onClose }: { driver: ManagedUser; onClose: () => void }) {
  const refresh = useRefreshPeople();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const term = useDebounced(search).trim();
  const filters = { assigned: false, searchTerm: term || undefined, page: 1, page_size: 50 };

  const vehicles = useQuery({
    queryKey: queryKeys.vehicles.list(filters),
    queryFn: ({ signal }) => listVehicles(filters, signal),
    placeholderData: keepPreviousData,
    ...CACHE.live,
  });
  const items = vehicles.data?.items ?? [];

  const assign = useMutation({
    mutationFn: (vehicleId: string) => assignDriver(vehicleId, driver.id),
    onSuccess: (vehicle) => {
      refresh();
      toast.success(`${fullName(driver)} now drives ${vehicle.name}. They've been notified.`);
      onClose();
    },
    onError: (err) => {
      // Someone else may have taken it, or the driver got one meanwhile: refetch and start over.
      if (err instanceof ApiError && (err.status === 409 || err.status === 400)) {
        refresh();
        setChosen(null);
      }
      setError(errorText(err, "Couldn't assign this vehicle. Try again."));
    },
  });

  return (
    <div className="space-y-4">
      <SearchInput value={search} onChange={setSearch} placeholder="Search by name, plate or location" label="Search vehicles" />
      <div className="max-h-[min(22rem,50dvh)] overflow-y-auto rounded-xl border border-border">
        {vehicles.isLoading ? (
          <div role="status" aria-label="Loading vehicles" className="animate-pulse divide-y divide-border">
            {[0, 1, 2, 3].map((row) => <div key={row} className="h-16 bg-subtle/40" />)}
          </div>
        ) : vehicles.isError ? (
          <div className="p-4"><Alert tone="error">{vehicles.error.message}</Alert></div>
        ) : items.length === 0 ? (
          <EmptyState icon="car" title="No free vehicles">Every vehicle already has a driver, or none match your search.</EmptyState>
        ) : (
          <ul role="radiogroup" aria-label="Available vehicles" className="divide-y divide-border">
            {items.map((vehicle) => {
              const selected = chosen === vehicle.id;
              return (
                <li key={vehicle.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => { setChosen(vehicle.id); setError(null); }}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${selected ? "bg-brand-soft" : "hover:bg-subtle/60"}`}
                  >
                    <span aria-hidden className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${selected ? "border-brand bg-brand text-brand-foreground" : "border-input"}`}>
                      {selected && <Icon name="check" className="size-3" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{vehicle.name} <span className="font-mono text-xs font-normal text-muted">{vehicle.plate_number}</span></span>
                      <span className="block truncate text-xs text-muted">{vehicle.vehicle_make.name} {vehicle.vehicle_model.name} · {vehicle.vehicle_type.name} · {vehicle.location_state}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {!driver.is_active && <Alert tone="error">{fullName(driver)} is deactivated. The API only assigns vehicles to active drivers.</Alert>}
      <p className="text-xs text-muted">Only vehicles without a driver are listed. The driver is notified straight away.</p>
      <ModalActions>
        <Button variant="secondary" onClick={onClose} disabled={assign.isPending}>Cancel</Button>
        <Button onClick={() => chosen && assign.mutate(chosen)} disabled={!chosen || !driver.is_active} loading={assign.isPending}>Assign vehicle</Button>
      </ModalActions>
    </div>
  );
}

export function UnassignVehicleDialog({ driver, onClose }: DriverDialogProps) {
  const refresh = useRefreshPeople();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const vehicle = driver?.vehicle ?? null;

  const unassign = useMutation({
    mutationFn: () => unassignDriver(vehicle!.id),
    onSuccess: () => {
      refresh();
      toast.success(`${vehicle!.name} is now unassigned.`);
      close();
    },
    onError: (err) => setError(errorText(err, "Couldn't unassign this vehicle. Try again.")),
  });
  const close = () => {
    setError(null);
    onClose();
  };

  return (
    <ConfirmDialog
      open={driver !== null && vehicle !== null}
      onClose={close}
      onConfirm={() => unassign.mutate()}
      title="Unassign vehicle?"
      confirmLabel="Unassign"
      loading={unassign.isPending}
      error={error}
    >
      <p>{driver ? fullName(driver) : "This driver"} will no longer drive {vehicle?.name}. They&apos;re notified, and can&apos;t receive EV credit until they&apos;re assigned another vehicle.</p>
    </ConfirmDialog>
  );
}
