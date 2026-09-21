"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { AccessDenied } from "@/components/dashboard/access-denied";
import { ConfigPageHeader, EmptyState, ErrorState, Icon, IconButton, SearchInput, SkeletonRows } from "@/components/dashboard/screen-kit";
import { AssignDriverDialog, DeleteVehicleDialog, PlateChip, ReassignDialog, UnassignDialog, VehicleDetails } from "@/components/fleet-vehicles/vehicle-dialogs";
import { VehicleForm } from "@/components/fleet-vehicles/vehicle-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { listVehicles, type ListVehiclesParams, type Vehicle } from "@/lib/api/configuration";
import { formatDate, fullName } from "@/lib/format";
import { useSearchState, useUrlState } from "@/lib/hooks/use-url-state";
import { locationSuggestions } from "@/lib/locations";
import { useMakeOptions, useModelOptions, useTypeOptions } from "@/lib/query/catalogue";
import { queryKeys } from "@/lib/query/keys";
import { useCurrentUser } from "@/lib/query/user";

const PAGE_SIZE = 20;
const ROW_GRID = "md:grid-cols-[minmax(0,1.5fr)_minmax(0,0.8fr)_minmax(0,1.2fr)_minmax(0,1.3fr)_7.5rem]";

type Dialog =
  | { kind: "form"; vehicle: Vehicle | null }
  | { kind: "details"; id: string }
  | { kind: "assign" | "unassign" | "reassign" | "delete"; vehicle: Vehicle };

type AssignedFilter = "" | "true" | "false";

const STATUS_OPTIONS: { value: AssignedFilter; label: string }[] = [
  { value: "", label: "All" },
  { value: "true", label: "Assigned" },
  { value: "false", label: "Available" },
];

function DriverCell({ vehicle }: { vehicle: Vehicle }) {
  if (!vehicle.driver) return <Badge tone="success" dot>Available</Badge>;
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium">{fullName(vehicle.driver)}</p>
      <p className="truncate text-xs text-muted">
        {vehicle.driver.phone_number ?? `@${vehicle.driver.username}`}
        {vehicle.assigned_at ? ` · since ${formatDate(vehicle.assigned_at)}` : ""}
      </p>
    </div>
  );
}

export function FleetVehiclesPage() {
  const user = useCurrentUser();
  const isAdmin = user.user_type === "ADMIN";
  const isStaff = isAdmin || user.user_type === "ACCOUNT_OFFICER" || user.user_type === "RELATIONSHIP_OFFICER";
  const url = useUrlState();
  const search = useSearchState(url, "q");
  const place = useSearchState(url, "loc");

  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const close = () => setDialog(null);

  const typeId = url.get("type");
  const makeId = url.get("make");
  const modelId = url.get("model");
  const assigned = (["true", "false"].includes(url.get("assigned")) ? url.get("assigned") : "") as AssignedFilter;

  const types = useTypeOptions(isStaff);
  const makes = useMakeOptions(isStaff);
  const models = useModelOptions(makeId || undefined, { all: Boolean(modelId), enabled: isStaff });

  const filters = useMemo<ListVehiclesParams>(
    () => ({
      page: url.page,
      page_size: PAGE_SIZE,
      searchTerm: search.committed || undefined,
      locationState: place.committed || undefined,
      vehicleTypeId: typeId || undefined,
      vehicleMakeId: makeId || undefined,
      vehicleModelId: modelId || undefined,
      assigned: assigned === "" ? undefined : assigned === "true",
    }),
    [assigned, makeId, modelId, place.committed, search.committed, typeId, url.page],
  );

  const vehicles = useQuery({
    queryKey: queryKeys.vehicles.list(filters),
    queryFn: ({ signal }) => listVehicles(filters, signal),
    enabled: isStaff,
    // Staff get no push events for vehicle changes, so pick up colleagues' edits while the page is open.
    refetchInterval: 60_000,
    staleTime: 15_000,
  });

  const items = vehicles.data?.items;
  const totalPages = vehicles.data?.pagination.total_pages ?? 1;
  useEffect(() => {
    if (vehicles.data && url.page > Math.max(1, totalPages)) url.set({ page: 1 });
  }, [vehicles.data, totalPages, url]);

  const locationHints = useMemo(() => locationSuggestions((items ?? []).map((item) => item.location_state)), [items]);

  if (!isStaff) return <AccessDenied />;

  const activeFilterCount = [typeId, makeId, modelId, assigned, place.committed].filter(Boolean).length;
  const anyFilter = activeFilterCount > 0 || Boolean(search.committed);
  const clearAll = () => {
    search.setText("");
    place.setText("");
    url.set({ q: "", loc: "", type: "", make: "", model: "", assigned: "" });
  };

  const openDetails = (vehicle: Vehicle) => setDialog({ kind: "details", id: vehicle.id });

  return (
    <div>
      <ConfigPageHeader
        icon="car"
        showBackLink={false}
        title="Fleet vehicles"
        description="Every vehicle in the fleet, who is driving it, and where it is based."
        actions={<Button onClick={() => setDialog({ kind: "form", vehicle: null })}>Add vehicle</Button>}
      />

      <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="space-y-3 border-b border-border p-4">
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <SearchInput value={search.text} onChange={search.setText} placeholder="Search name, plate, location, type, make or model" label="Search vehicles" />
            </div>
            <Button
              variant="secondary"
              onClick={() => setShowFilters((open) => !open)}
              aria-expanded={showFilters}
              aria-controls="vehicle-filters"
              className="lg:hidden"
            >
              <Icon name="filter" className="size-4" />
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </Button>
          </div>

          <div id="vehicle-filters" className={`${showFilters ? "grid" : "hidden"} gap-3 sm:grid-cols-2 lg:grid lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]`}>
            <div className="min-w-0 space-y-1.5">
              <label htmlFor="filter-location" className="sr-only">Location</label>
              <input
                id="filter-location"
                list="location-hints"
                value={place.text}
                onChange={(event) => place.setText(event.target.value.slice(0, 100))}
                placeholder="Location"
                autoComplete="off"
                className="h-10 w-full rounded-lg border border-input bg-surface px-3 text-sm outline-none transition placeholder:text-muted/70 pointer-coarse:h-11 pointer-coarse:text-base focus:border-brand focus:ring-3 focus:ring-brand/20"
              />
              <datalist id="location-hints">
                {locationHints.map((item) => <option key={item} value={item} />)}
              </datalist>
            </div>
            <Select label="Type" hideLabel value={typeId} onChange={(event) => url.set({ type: event.target.value })}>
              <option value="">All types</option>
              {types.data?.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
            </Select>
            <Select label="Make" hideLabel value={makeId} onChange={(event) => url.set({ make: event.target.value, model: "" })}>
              <option value="">All makes</option>
              {makes.data?.map((make) => <option key={make.id} value={make.id}>{make.name}</option>)}
            </Select>
            <Select label="Model" hideLabel value={modelId} onChange={(event) => url.set({ model: event.target.value })} disabled={!makeId && !modelId}>
              <option value="">{makeId || modelId ? "All models" : "Pick a make first"}</option>
              {models.data?.map((model) => (
                <option key={model.id} value={model.id}>{makeId ? model.name : `${model.vehicle_make_name} ${model.name}`}</option>
              ))}
            </Select>
            <div role="group" aria-label="Driver status" className="grid grid-cols-3 gap-1 rounded-lg bg-subtle p-1 sm:col-span-2 lg:col-span-1">
              {STATUS_OPTIONS.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  aria-pressed={assigned === option.value}
                  onClick={() => url.set({ assigned: option.value })}
                  className={`h-8 rounded-md px-3 text-sm font-medium transition pointer-coarse:h-9 ${assigned === option.value ? "bg-surface text-foreground shadow-card" : "text-muted hover:text-foreground"}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {anyFilter && (
            <div className="flex items-center justify-between gap-3 text-sm">
              <p className="text-muted">
                {vehicles.data ? `${vehicles.data.pagination.total_items} matching vehicle${vehicles.data.pagination.total_items === 1 ? "" : "s"}` : "Filtering..."}
              </p>
              <button type="button" onClick={clearAll} className="font-medium text-brand hover:underline">Clear filters</button>
            </div>
          )}
        </div>

        {vehicles.isLoading ? (
          <SkeletonRows rows={7} columns={5} />
        ) : vehicles.isError ? (
          <ErrorState message={vehicles.error.message} onRetry={() => vehicles.refetch()} />
        ) : items && items.length > 0 ? (
          <>
            <div className={`hidden gap-4 bg-subtle/70 px-6 py-3 text-xs font-semibold uppercase text-muted md:grid ${ROW_GRID}`}>
              <span>Vehicle</span>
              <span>Location</span>
              <span>Make &amp; model</span>
              <span>Driver</span>
              <span className="text-right">Actions</span>
            </div>
            <ul className="divide-y divide-border">
              {items.map((vehicle) => (
                <li
                  key={vehicle.id}
                  onClick={() => openDetails(vehicle)}
                  className={`grid cursor-pointer items-center gap-x-4 gap-y-2.5 px-4 py-4 transition hover:bg-subtle/50 sm:px-6 ${ROW_GRID}`}
                >
                  <div className="min-w-0 space-y-1.5">
                    <button
                      type="button"
                      onClick={(event) => { event.stopPropagation(); openDetails(vehicle); }}
                      className="block max-w-full truncate text-left font-medium hover:underline focus-visible:outline-2 focus-visible:outline-brand"
                    >
                      {vehicle.name}
                    </button>
                    <PlateChip plate={vehicle.plate_number} />
                  </div>
                  <p className="flex items-center gap-1.5 text-sm text-muted md:text-foreground">
                    {vehicle.location_state}
                  </p>
                  <div className="min-w-0 text-sm">
                    <p className="truncate">{vehicle.vehicle_make.name} {vehicle.vehicle_model.name}</p>
                    <p className="truncate text-xs text-muted">{vehicle.vehicle_type.name}</p>
                  </div>
                  <DriverCell vehicle={vehicle} />
                  <div className="-mx-1.5 flex justify-start gap-0.5 md:mx-0 md:justify-end">
                    {vehicle.driver ? (
                      <IconButton label={`Unassign ${fullName(vehicle.driver)}`} icon="userMinus" onClick={() => setDialog({ kind: "unassign", vehicle })} />
                    ) : (
                      isAdmin && <IconButton label={`Assign a driver to ${vehicle.name}`} icon="user" onClick={() => setDialog({ kind: "assign", vehicle })} />
                    )}
                    <IconButton label={`Edit ${vehicle.name}`} icon="pencil" onClick={() => setDialog({ kind: "form", vehicle })} />
                    <IconButton
                      label={vehicle.driver ? "Unassign the driver before deleting" : `Delete ${vehicle.name}`}
                      icon="trash"
                      tone="danger"
                      disabled={Boolean(vehicle.driver)}
                      onClick={() => setDialog({ kind: "delete", vehicle })}
                    />
                  </div>
                </li>
              ))}
            </ul>
            <Pagination pagination={vehicles.data?.pagination} onPage={(page) => url.set({ page })} noun="vehicles" />
          </>
        ) : (
          <EmptyState
            icon="car"
            title={anyFilter ? "No vehicles match these filters" : "No vehicles yet"}
            action={
              anyFilter ? (
                <Button variant="secondary" onClick={clearAll}>Clear filters</Button>
              ) : (
                <Button onClick={() => setDialog({ kind: "form", vehicle: null })}>Add the first vehicle</Button>
              )
            }
          >
            {anyFilter ? "Try widening your search or removing a filter." : "Add a vehicle so it can be assigned to a driver."}
          </EmptyState>
        )}
      </section>

      {dialog?.kind === "form" && (
        <Modal open onClose={close} title={dialog.vehicle ? "Edit vehicle" : "Add vehicle"} size="lg">
          <VehicleForm
            vehicle={dialog.vehicle}
            locationHints={locationHints}
            onClose={close}
            onSaved={close}
          />
        </Modal>
      )}
      {dialog?.kind === "details" && (
        <VehicleDetails
          id={dialog.id}
          isAdmin={isAdmin}
          onClose={close}
          onEdit={(vehicle) => setDialog({ kind: "form", vehicle })}
          onAssign={(vehicle) => setDialog({ kind: "assign", vehicle })}
          onUnassign={(vehicle) => setDialog({ kind: "unassign", vehicle })}
          onReassign={(vehicle) => setDialog({ kind: "reassign", vehicle })}
          onDelete={(vehicle) => setDialog({ kind: "delete", vehicle })}
        />
      )}
      {dialog?.kind === "assign" && <AssignDriverDialog vehicle={dialog.vehicle} onClose={close} />}
      {dialog?.kind === "unassign" && <UnassignDialog vehicle={dialog.vehicle} onClose={close} />}
      {dialog?.kind === "reassign" && <ReassignDialog vehicle={dialog.vehicle} onClose={close} />}
      {dialog?.kind === "delete" && (
        <DeleteVehicleDialog vehicle={dialog.vehicle} onClose={close} onUnassign={(vehicle) => setDialog({ kind: "unassign", vehicle })} />
      )}
    </div>
  );
}
