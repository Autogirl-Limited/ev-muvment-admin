"use client";

import { useState, type ReactNode } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { EmptyState, Icon } from "@/components/dashboard/screen-kit";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Modal, ModalActions } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/browser";
import type { ChecklistLocation } from "@/lib/api/checklists-groups";
import {
  assignDriver,
  deleteVehicle,
  getVehicle,
  listDriverOptions,
  listVehicles,
  unassignDriver,
  updateVehicleChecklistOverrides,
  type ChecklistLocationOverride,
  type ChecklistWindowOverride,
  type DriverOption,
  type UpdateChecklistOverridesRequest,
  type Vehicle,
} from "@/lib/api/configuration";
import {
  cancelScheduleOverride,
  createScheduleOverride,
  listScheduleOverrides,
  type ChecklistPhase as SchedulePhase,
  type CreateScheduleOverrideRequest,
  type ScheduleOverride,
} from "@/lib/api/schedule-overrides";
import { formatDateTime, fullName } from "@/lib/format";
import { useDebounced } from "@/lib/hooks/use-debounced";
import { CACHE } from "@/lib/query/cache";
import { configQueries } from "@/lib/query/configuration";
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
type Phase = "pick_up" | "drop_off";
const PHASES: readonly Phase[] = ["pick_up", "drop_off"];
const PHASE_LABEL: Record<Phase, string> = { pick_up: "Pick-up", drop_off: "Drop-off" };
const trimTime = (time: string) => time.slice(0, 5);
const COORDINATE_PAIR = /^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/;

interface PlaceSuggestion {
  display_name: string;
  place_id: string;
  main_text: string;
  secondary_text: string;
}

interface PlaceDetails {
  result: {
    address: string;
    latitude: number;
    longitude: number;
  };
}

function formatLocation(location: ChecklistLocation | ChecklistLocationOverride | null) {
  if (!location) return "No location configured";
  const radius = location.radius_meters === null ? "default radius" : `${location.radius_meters.toLocaleString("en-NG")} m`;
  return `${location.address} (${location.latitude}, ${location.longitude}; ${radius})`;
}

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

function ScheduleRow({
  label,
  custom,
  children,
}: {
  label: string;
  custom: boolean;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg bg-subtle/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted">{label}</p>
        <Badge tone={custom ? "brand" : "neutral"}>{custom ? "Custom" : "Default"}</Badge>
      </div>
      <p className="mt-1 break-words text-sm font-medium">{children}</p>
    </div>
  );
}

interface OverridePhaseForm {
  windowMode: "default" | "custom";
  start: string;
  end: string;
  locationMode: "default" | "custom";
  address: string;
  latitude: string;
  longitude: string;
  radius: string;
}

type OverrideForm = Record<Phase, OverridePhaseForm>;

function overrideForm(vehicle: Vehicle): OverrideForm {
  const phase = (name: Phase): OverridePhaseForm => {
    const current = vehicle.checklist_overrides[name];
    return {
      windowMode: current.window ? "custom" : "default",
      start: current.window ? trimTime(current.window.start_time) : "",
      end: current.window ? trimTime(current.window.end_time) : "",
      locationMode: current.location ? "custom" : "default",
      address: current.location?.address ?? "",
      latitude: current.location ? String(current.location.latitude) : "",
      longitude: current.location ? String(current.location.longitude) : "",
      radius: current.location?.radius_meters == null ? "" : String(current.location.radius_meters),
    };
  };
  return { pick_up: phase("pick_up"), drop_off: phase("drop_off") };
}

const sameWindow = (left: ChecklistWindowOverride | null, form: OverridePhaseForm) =>
  form.windowMode === "default"
    ? left === null
    : Boolean(left && trimTime(left.start_time) === form.start && trimTime(left.end_time) === form.end);

const sameLocation = (left: ChecklistLocationOverride | null, form: OverridePhaseForm) => {
  if (form.locationMode === "default") return left === null;
  const radius = form.radius.trim() ? Number(form.radius) : null;
  return Boolean(
    left &&
      left.address === form.address.trim() &&
      left.latitude === Number(form.latitude) &&
      left.longitude === Number(form.longitude) &&
      left.radius_meters === radius,
  );
};

function validateOverrides(form: OverrideForm) {
  const errors: Record<string, string> = {};
  for (const phase of PHASES) {
    const item = form[phase];
    if (item.windowMode === "custom") {
      if (!item.start || !item.end) errors[`${phase}.window`] = "Set both start and end times.";
      else if (item.end <= item.start) errors[`${phase}.window`] = "The window must close after it opens.";
    }
    if (item.locationMode === "custom") {
      const latitude = Number(item.latitude);
      const longitude = Number(item.longitude);
      const radius = item.radius.trim() ? Number(item.radius) : null;
      if (!item.address.trim()) errors[`${phase}.address`] = "Enter the address drivers will see.";
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) errors[`${phase}.latitude`] = "Latitude must be between -90 and 90.";
      if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) errors[`${phase}.longitude`] = "Longitude must be between -180 and 180.";
      if (radius !== null && (!Number.isInteger(radius) || radius < 20 || radius > 5000)) {
        errors[`${phase}.radius`] = "Radius must be 20 to 5,000 m, or blank for the global radius.";
      }
    }
  }
  return errors;
}

function buildOverridesPatch(vehicle: Vehicle, form: OverrideForm): UpdateChecklistOverridesRequest {
  const patch: UpdateChecklistOverridesRequest = {};
  for (const phase of PHASES) {
    const current = vehicle.checklist_overrides[phase];
    const item = form[phase];
    const change: NonNullable<UpdateChecklistOverridesRequest[Phase]> = {};

    if (!sameWindow(current.window, item)) {
      change.window = item.windowMode === "default" ? null : { start_time: item.start, end_time: item.end };
    }
    if (!sameLocation(current.location, item)) {
      change.location =
        item.locationMode === "default"
          ? null
          : {
              address: item.address.trim(),
              latitude: Number(item.latitude),
              longitude: Number(item.longitude),
              ...(item.radius.trim() ? { radius_meters: Number(item.radius) } : {}),
            };
    }
    if (Object.keys(change).length) patch[phase] = change;
  }
  return patch;
}

function ChecklistOverridesEditor({ vehicle, onClose }: { vehicle: Vehicle; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState(() => overrideForm(vehicle));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const patch = buildOverridesPatch(vehicle, form);
  const dirty = Object.keys(patch).length > 0;

  const save = useMutation({
    mutationFn: () => updateVehicleChecklistOverrides(vehicle.id, patch),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.vehicles.detail(vehicle.id), updated);
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
      toast.success("Checklist schedule updated.");
      onClose();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 422) setErrors(error.fieldErrors);
      setApiError(errorText(error, "Couldn't update this schedule."));
    },
  });

  const update = (phase: Phase, next: Partial<OverridePhaseForm>) => {
    setForm((current) => ({ ...current, [phase]: { ...current[phase], ...next } }));
    setErrors({});
    setApiError(null);
  };

  const submit = () => {
    const nextErrors = validateOverrides(form);
    setErrors(nextErrors);
    setApiError(null);
    if (Object.keys(nextErrors).length === 0 && dirty) save.mutate();
  };

  return (
    <div className="space-y-5">
      <Alert tone="info">Blank radius means this vehicle uses the global radius for that phase. Resetting a row makes the vehicle follow the global setting again.</Alert>
      {PHASES.map((phase) => {
        const item = form[phase];
        return (
          <section key={phase} className="space-y-3 rounded-xl border border-border p-4">
            <h3 className="font-semibold">{PHASE_LABEL[phase]}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Select label="Window" value={item.windowMode} onChange={(event) => update(phase, { windowMode: event.target.value as OverridePhaseForm["windowMode"] })}>
                <option value="default">Use global window</option>
                <option value="custom">Custom window</option>
              </Select>
              <Select label="Location" value={item.locationMode} onChange={(event) => update(phase, { locationMode: event.target.value as OverridePhaseForm["locationMode"] })}>
                <option value="default">Use global location</option>
                <option value="custom">Custom location</option>
              </Select>
            </div>
            {item.windowMode === "custom" && (
              <div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Opens" type="time" step={60} value={item.start} onChange={(event) => update(phase, { start: event.target.value })} />
                  <Field label="Closes" type="time" step={60} value={item.end} onChange={(event) => update(phase, { end: event.target.value })} />
                </div>
                {errors[`${phase}.window`] && <p className="mt-1.5 text-xs text-danger">{errors[`${phase}.window`]}</p>}
              </div>
            )}
            {item.locationMode === "custom" && (
              <OverrideLocationFields phase={phase} item={item} errors={errors} onChange={(next) => update(phase, next)} />
            )}
          </section>
        );
      })}
      {apiError && <Alert tone="error">{apiError}</Alert>}
      <ModalActions>
        <Button variant="secondary" onClick={onClose} disabled={save.isPending}>Cancel</Button>
        <Button onClick={submit} disabled={!dirty} loading={save.isPending}>Save schedule</Button>
      </ModalActions>
    </div>
  );
}

function OverrideLocationFields({
  phase,
  item,
  errors,
  onChange,
}: {
  phase: Phase;
  item: OverridePhaseForm;
  errors: Record<string, string>;
  onChange: (next: Partial<OverridePhaseForm>) => void;
}) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const search = async () => {
    const input = query.trim();
    if (!input) return;
    setSearching(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/maps/places?input=${encodeURIComponent(input)}`);
      if (!response.ok) throw new Error("search failed");
      const payload = (await response.json()) as { results: PlaceSuggestion[] };
      setSuggestions(payload.results);
      if (payload.results.length === 0) setNotice("No places found. Try a nearby landmark or paste coordinates.");
    } catch {
      setSuggestions(null);
      setNotice("Google Maps place search is unavailable right now. You can still enter the address and coordinates manually.");
    } finally {
      setSearching(false);
    }
  };

  const choose = async (suggestion: PlaceSuggestion) => {
    setSearching(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/maps/places?placeId=${encodeURIComponent(suggestion.place_id)}`);
      if (!response.ok) throw new Error("details failed");
      const payload = (await response.json()) as PlaceDetails;
      onChange({
        address: (payload.result.address || suggestion.display_name).slice(0, 255),
        latitude: payload.result.latitude.toFixed(6),
        longitude: payload.result.longitude.toFixed(6),
      });
      setQuery("");
      setSuggestions(null);
    } catch {
      setNotice("Couldn't load that place. Try another suggestion or enter coordinates manually.");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <label className="block text-sm font-medium" htmlFor={`${phase}-override-place-search`}>Find address or landmark</label>
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              id={`${phase}-override-place-search`}
              value={query}
              onChange={(event) => setQuery(event.target.value.slice(0, 200))}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  search();
                }
              }}
              placeholder="Search Google Maps"
              autoComplete="off"
              className="h-10 w-full rounded-lg border border-input bg-surface pl-9 pr-3 text-sm outline-none transition placeholder:text-muted/60 pointer-coarse:h-11 pointer-coarse:text-base focus:border-brand focus:ring-3 focus:ring-brand/20"
            />
          </div>
          <Button variant="secondary" onClick={search} loading={searching} disabled={!query.trim()}>Search</Button>
        </div>
        {suggestions && suggestions.length > 0 && (
          <ul className="animate-fade-in divide-y divide-border overflow-hidden rounded-xl border border-border">
            {suggestions.map((suggestion) => (
              <li key={suggestion.place_id}>
                <button
                  type="button"
                  onClick={() => choose(suggestion)}
                  disabled={searching}
                  className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left text-sm transition hover:bg-subtle disabled:cursor-wait disabled:opacity-70"
                >
                  <Icon name="mapPin" className="mt-0.5 size-4 shrink-0 text-muted" />
                  <span className="min-w-0">
                    <span className="block break-words font-medium">{suggestion.main_text}</span>
                    {suggestion.secondary_text && <span className="block break-words text-xs text-muted">{suggestion.secondary_text}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {notice && <Alert tone="info">{notice}</Alert>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Address" value={item.address} onChange={(event) => onChange({ address: event.target.value })} error={errors[`${phase}.address`]} className="sm:col-span-2" />
        <Field
          label="Latitude"
          inputMode="decimal"
          value={item.latitude}
          onChange={(event) => {
            const text = event.target.value;
            const pair = COORDINATE_PAIR.exec(text);
            if (pair) onChange({ latitude: pair[1], longitude: pair[2] });
            else onChange({ latitude: text });
          }}
          error={errors[`${phase}.latitude`]}
        />
        <Field label="Longitude" inputMode="decimal" value={item.longitude} onChange={(event) => onChange({ longitude: event.target.value })} error={errors[`${phase}.longitude`]} />
        <Field label="Radius" inputMode="numeric" value={item.radius} onChange={(event) => onChange({ radius: event.target.value.replace(/[^\d]/g, "").slice(0, 4) })} error={errors[`${phase}.radius`]} hint="Blank uses the global radius." trailing={<span className="pr-2 text-xs text-muted">m</span>} />
      </div>
    </div>
  );
}

// ---------- One-day schedule overrides ----------
const SCHEDULE_PHASE_LABEL: Record<SchedulePhase, string> = { PICK_UP: "Pick-up", DROP_OFF: "Drop-off" };

function lagosToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());
}

function ScheduleOverrideForm({ vehicleId, onDone }: { vehicleId: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [date, setDate] = useState(lagosToday());
  const [phase, setPhase] = useState<SchedulePhase>("PICK_UP");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => {
      const body: CreateScheduleOverrideRequest = { override_date: date, phase, start_time: start, end_time: end, reason: reason.trim() || undefined };
      return createScheduleOverride(vehicleId, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduleOverrides.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.detail(vehicleId) });
      toast.success("One-day schedule override saved. The driver was notified.");
      onDone();
    },
    onError: (err) => setError(errorText(err, "Couldn't save this override.")),
  });

  const submit = () => {
    setError(null);
    if (!start || !end) return setError("Set both a start and end time.");
    if (end <= start) return setError("The window must close after it opens.");
    create.mutate();
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-subtle/40 p-3.5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Date" type="date" min={lagosToday()} value={date} onChange={(e) => setDate(e.target.value)} />
        <Select label="Phase" value={phase} onChange={(e) => setPhase(e.target.value as SchedulePhase)}>
          <option value="PICK_UP">Pick-up</option>
          <option value="DROP_OFF">Drop-off</option>
        </Select>
        <Field label="New start" type="time" step={60} value={start} onChange={(e) => setStart(e.target.value)} />
        <Field label="New end" type="time" step={60} value={end} onChange={(e) => setEnd(e.target.value)} />
      </div>
      <Field label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value.slice(0, 255))} placeholder="Driver reported heavy traffic" />
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone} disabled={create.isPending}>Cancel</Button>
        <Button variant="secondary" onClick={submit} loading={create.isPending}>Save override</Button>
      </div>
    </div>
  );
}

function ScheduleOverridesSection({ vehicle, isAdmin }: { vehicle: Vehicle; isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [cancelling, setCancelling] = useState<ScheduleOverride | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const overrides = useQuery({
    queryKey: queryKeys.scheduleOverrides.list(vehicle.id, { dateFrom: lagosToday() }),
    queryFn: ({ signal }) => listScheduleOverrides(vehicle.id, { dateFrom: lagosToday() }, signal),
  });

  const cancel = useMutation({
    mutationFn: (override: ScheduleOverride) => cancelScheduleOverride(vehicle.id, override.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduleOverrides.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.detail(vehicle.id) });
      toast.success("Override cancelled. The vehicle reverts to its normal schedule for that day.");
      setCancelling(null);
    },
    onError: (err) => setCancelError(errorText(err, "Couldn't cancel this override.")),
  });

  const items = overrides.data ?? [];

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase text-muted">One-day schedule overrides</p>
          <p className="mt-1 text-sm text-muted">A &quot;just this once&quot; pick-up/drop-off window change that wins over everything else, for one date only. Admin only.</p>
        </div>
        {isAdmin && !adding && <Button variant="secondary" className="py-3" onClick={() => setAdding(true)}>Add override</Button>}
      </div>

      {isAdmin && adding && <div className="mt-3"><ScheduleOverrideForm vehicleId={vehicle.id} onDone={() => setAdding(false)} /></div>}

      <div className="mt-3">
        {overrides.isLoading ? (
          <div className="h-16 animate-pulse rounded-lg bg-subtle" />
        ) : overrides.isError ? (
          <Alert tone="error">{overrides.error.message}</Alert>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted">No upcoming overrides for this vehicle.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((override) => (
              <li key={override.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-subtle/60 p-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">
                    {override.override_date} · {SCHEDULE_PHASE_LABEL[override.phase]} · {trimTime(override.start_time)}–{trimTime(override.end_time)}
                  </p>
                  {override.reason && <p className="mt-0.5 truncate text-xs text-muted">{override.reason}</p>}
                </div>
                {isAdmin && (
                  <Button variant="ghost" className="text-danger hover:bg-danger-soft hover:text-danger" onClick={() => { setCancelError(null); setCancelling(override); }}>
                    Cancel
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={cancelling !== null}
        onClose={() => setCancelling(null)}
        onConfirm={() => cancelling && cancel.mutate(cancelling)}
        title="Cancel this override?"
        confirmLabel="Cancel override"
        tone="primary"
        loading={cancel.isPending}
        error={cancelError}
      >
        <p>
          The driver will revert to their normal {cancelling ? SCHEDULE_PHASE_LABEL[cancelling.phase].toLowerCase() : ""} window for{" "}
          <strong className="font-semibold text-foreground">{cancelling?.override_date}</strong>. They will not be notified of this cancellation.
        </p>
      </ConfirmDialog>
    </div>
  );
}

export function VehicleDetails({ id, isAdmin, onClose, onEdit, onAssign, onUnassign, onReassign, onDelete }: DetailsProps) {
  const [editingSchedule, setEditingSchedule] = useState(false);
  const query = useQuery({
    queryKey: queryKeys.vehicles.detail(id ?? ""),
    queryFn: ({ signal }) => getVehicle(id!, signal),
    enabled: id !== null,
  });
  const vehicle = query.data;
  // The vehicle's base schedule is its state's settings when linked, else the global default.
  const settings = useQuery({
    ...configQueries.stateChecklistSettings(vehicle?.state?.id ?? null),
    enabled: id !== null,
  });

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

          <div className="rounded-xl border border-border p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-medium uppercase text-muted">Checklist schedule</p>
                <p className="mt-1 text-sm text-muted">
                  Base schedule: <strong className="font-medium text-foreground">{vehicle.state ? vehicle.state.name : vehicle.location_state}</strong>&apos;s
                  own schedule if set, else the global default. Custom rows below override that for this vehicle standingly.
                </p>
              </div>
              <Button variant="secondary" className="py-3" onClick={() => setEditingSchedule(true)}>Edit schedule</Button>
            </div>
            {settings.isLoading ? (
              <div className="mt-3 h-24 animate-pulse rounded-lg bg-subtle" />
            ) : settings.isError ? (
              <div className="mt-3"><Alert tone="error">{settings.error.message}</Alert></div>
            ) : settings.data ? (
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {PHASES.map((phase) => {
                  const override = vehicle.checklist_overrides[phase];
                  const global = settings.data[phase];
                  const window = override.window ?? global;
                  const location = override.location ?? global.location;
                  return (
                    <div key={phase} className="space-y-2 rounded-xl border border-border/70 p-3">
                      <p className="font-medium">{PHASE_LABEL[phase]}</p>
                      <ScheduleRow label="Window" custom={Boolean(override.window)}>
                        {trimTime(window.start_time)} to {trimTime(window.end_time)} WAT
                      </ScheduleRow>
                      <ScheduleRow label="Location" custom={Boolean(override.location)}>
                        {formatLocation(location)}
                      </ScheduleRow>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>

          <ScheduleOverridesSection vehicle={vehicle} isAdmin={isAdmin} />

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

          <Modal open={editingSchedule} onClose={() => setEditingSchedule(false)} title={`Checklist schedule for ${vehicle.name}`} size="lg">
            <ChecklistOverridesEditor vehicle={vehicle} onClose={() => setEditingSchedule(false)} />
          </Modal>
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
