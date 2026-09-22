"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Icon } from "@/components/dashboard/screen-kit";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { ModalActions } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/browser";
import {
  createCatalogueEntry,
  createVehicle,
  createVehicleModel,
  diff,
  updateVehicle,
  type Vehicle,
} from "@/lib/api/configuration";
import { createState, type State } from "@/lib/api/states";
import { sameName } from "@/lib/format";
import { configQueries } from "@/lib/query/configuration";
import { useMakeOptions, useModelOptions, useTypeOptions } from "@/lib/query/catalogue";
import { queryKeys } from "@/lib/query/keys";

/** "Can't find it? Add it here": creates a new location (a State, behind the scenes) without leaving the vehicle form. */
function AddNewLocation({ existing, defaultCountryId, onCreated }: { existing: State[]; defaultCountryId: string | undefined; onCreated: (state: State) => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (clean: string) => createState({ country_id: defaultCountryId!, name: clean }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.states.all });
      toast.success(`${created.name} added.`);
      setOpen(false);
      setName("");
      onCreated(created);
    },
    onError: (err) => setError(err instanceof ApiError && err.status === 409 ? "That location already exists." : err instanceof ApiError ? err.message : "Couldn't add it."),
  });

  const submit = () => {
    const clean = name.trim();
    if (!clean) return setError("Enter a location name.");
    if (!defaultCountryId) return setError("No country is configured yet — add one from Configurations > Countries first.");
    const duplicate = existing.find((item) => sameName(item.name, clean));
    // Reuse rather than create a look-alike ("lagos" vs "Lagos").
    if (duplicate) return onCreated(duplicate), setOpen(false), setName("");
    create.mutate(clean);
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 rounded-md py-0.5 text-xs font-medium text-brand hover:underline pointer-coarse:py-2">
        <Icon name="plus" className="size-3.5" />
        Add a new location
      </button>
    );
  }

  return (
    <div className="animate-fade-in space-y-2 rounded-xl border border-border bg-subtle/60 p-3">
      <Field
        label="New location name"
        value={name}
        onChange={(event) => { setName(event.target.value); setError(null); }}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); submit(); } }}
        error={error ?? undefined}
        placeholder="Ogun"
        maxLength={100}
        autoComplete="off"
        autoFocus
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => { setOpen(false); setName(""); setError(null); }} disabled={create.isPending}>Cancel</Button>
        <Button variant="secondary" onClick={submit} loading={create.isPending}>Add location</Button>
      </div>
    </div>
  );
}

interface AddNewProps {
  noun: "type" | "make" | "model";
  makeId?: string;
  existing: { id: string; name: string }[];
  onCreated: (id: string) => void;
}

/** "Can't find it? Add it here": creates a catalogue entry without leaving the vehicle form. */
function AddNew({ noun, makeId, existing, onCreated }: AddNewProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (clean: string) =>
      noun === "model"
        ? createVehicleModel({ vehicle_make_id: makeId!, name: clean })
        : createCatalogueEntry(noun === "type" ? "types" : "makes", clean),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: queryKeys[noun === "type" ? "vehicleTypes" : noun === "make" ? "vehicleMakes" : "vehicleModels"].all });
      toast.success(`${created.name} added to the catalogue.`);
      setOpen(false);
      setName("");
      onCreated(created.id);
    },
    onError: (err) => setError(err instanceof ApiError && err.status === 409 ? "That name already exists." : err instanceof ApiError ? err.message : "Couldn't add it."),
  });

  const submit = () => {
    const clean = name.trim();
    if (!clean) return setError(`Enter a ${noun} name.`);
    const duplicate = existing.find((item) => sameName(item.name, clean));
    // Reuse rather than create a look-alike ("suv" vs "SUV").
    if (duplicate) return onCreated(duplicate.id), setOpen(false), setName("");
    create.mutate(clean);
  };

  if (noun === "model" && !makeId) return null;

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 rounded-md py-0.5 text-xs font-medium text-brand hover:underline pointer-coarse:py-2">
        <Icon name="plus" className="size-3.5" />
        Add a new {noun}
      </button>
    );
  }

  return (
    <div className="animate-fade-in space-y-2 rounded-xl border border-border bg-subtle/60 p-3">
      <Field
        label={`New ${noun} name`}
        value={name}
        onChange={(event) => { setName(event.target.value); setError(null); }}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); submit(); } }}
        error={error ?? undefined}
        maxLength={100}
        autoComplete="off"
        autoFocus
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => { setOpen(false); setName(""); setError(null); }} disabled={create.isPending}>Cancel</Button>
        <Button variant="secondary" onClick={submit} loading={create.isPending}>Add {noun}</Button>
      </div>
    </div>
  );
}

interface VehicleFormProps {
  /** `null` creates a new vehicle. */
  vehicle: Vehicle | null;
  onClose: () => void;
  onSaved: (vehicle: Vehicle) => void;
}

export function VehicleForm({ vehicle, onClose, onSaved }: VehicleFormProps) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [name, setName] = useState(vehicle?.name ?? "");
  const [plate, setPlate] = useState(vehicle?.plate_number ?? "");
  const [locationId, setLocationId] = useState(vehicle?.state?.id ?? "");
  const [typeId, setTypeId] = useState(vehicle?.vehicle_type.id ?? "");
  const [makeId, setMakeId] = useState(vehicle?.vehicle_make.id ?? "");
  const [modelId, setModelId] = useState(vehicle?.vehicle_model.id ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const types = useTypeOptions();
  const makes = useMakeOptions();
  const models = useModelOptions(makeId);
  const states = useQuery({ ...configQueries.states({ page: 1, page_size: 100 }) });
  const countries = useQuery({ ...configQueries.countries({ page: 1, page_size: 100 }) });
  const defaultCountryId = countries.data?.items[0]?.id;

  // A vehicle created before this feature has no `state` link yet: best-effort match its
  // existing free-text location to a known location by name, once, so the field isn't blank.
  const [autoMatched, setAutoMatched] = useState(false);
  if (!autoMatched && !locationId && vehicle && !vehicle.state && states.data) {
    const match = states.data.items.find((item) => sameName(item.name, vehicle.location_state));
    if (match) setLocationId(match.id);
    setAutoMatched(true);
  }

  const clear = (key: string) => setErrors((current) => ({ ...current, [key]: "" }));

  const save = useMutation({
    mutationFn: async () => {
      const chosen = states.data?.items.find((item) => item.id === locationId);
      const clean = {
        name: name.trim(),
        plate_number: plate.trim().toUpperCase(),
        vehicle_type_id: typeId,
        vehicle_model_id: modelId,
      };
      // Location and state are always the same value here: the state's own name becomes the
      // vehicle's `location_state`, and its id is the `state_id` link — nothing else to reconcile.
      if (!vehicle) return createVehicle({ ...clean, location_state: chosen!.name, state_id: locationId });
      // Send only what changed, and never a null (the API answers 500 to it) — except `state_id`,
      // the one field on this endpoint where an explicit `null` is meaningful (it clears the link).
      const changes: Record<string, unknown> = diff(clean, {
        name: vehicle.name,
        plate_number: vehicle.plate_number,
        vehicle_type_id: vehicle.vehicle_type.id,
        vehicle_model_id: vehicle.vehicle_model.id,
      });
      const currentLocationId = vehicle.state?.id ?? "";
      if (locationId !== currentLocationId && chosen) {
        changes.state_id = locationId;
        changes.location_state = chosen.name;
      }
      return Object.keys(changes).length ? updateVehicle(vehicle.id, changes) : vehicle;
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
      toast.success(vehicle ? `${saved.name} updated.` : `${saved.name} added to the fleet.`);
      onSaved(saved);
    },
    onError: (error) => {
      if (!(error instanceof ApiError)) return setFormError("Couldn't save this vehicle. Try again.");
      if (error.status === 409) {
        setErrors({ plate_number: "That plate number is already registered." });
      } else if (error.status === 400) {
        // A type, model or location was deleted in another tab.
        queryClient.invalidateQueries({ queryKey: queryKeys.vehicleTypes.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.vehicleMakes.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.vehicleModels.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.states.all });
        setFormError("The type, model or location you picked is no longer available. Please choose again.");
      } else if (error.status === 404) {
        queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
        setFormError("This vehicle was removed by someone else.");
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
    const found: Record<string, string> = {};
    if (!name.trim()) found.name = "Give the vehicle a name.";
    else if (name.trim().length > 150) found.name = "Names can be at most 150 characters.";
    const cleanPlate = plate.trim();
    if (cleanPlate.length < 3) found.plate_number = "Plate numbers need at least 3 characters.";
    else if (cleanPlate.length > 20) found.plate_number = "Plate numbers can be at most 20 characters.";
    if (!locationId) found.location = "Choose a location.";
    if (!typeId) found.vehicle_type_id = "Choose a type.";
    if (!makeId) found.vehicle_make_id = "Choose a make.";
    else if (!modelId) found.vehicle_model_id = "Choose a model.";
    setErrors(found);
    if (Object.keys(found).length === 0) save.mutate();
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {vehicle?.driver && (
        <Alert tone="info">{vehicle.driver.first_name} is driving this vehicle and will see your changes.</Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Vehicle name" value={name} onChange={(e) => { setName(e.target.value); clear("name"); }} error={errors.name} placeholder="Lagos EV 03" maxLength={150} autoComplete="off" />
        <Field
          label="Plate number"
          value={plate}
          onChange={(e) => { setPlate(e.target.value.toUpperCase()); clear("plate_number"); }}
          error={errors.plate_number}
          placeholder="LSR-103AC"
          maxLength={20}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="font-mono uppercase"
        />
      </div>

      <div className="space-y-2">
        <Select
          label="Location"
          value={locationId}
          onChange={(e) => { setLocationId(e.target.value); clear("location"); }}
          error={errors.location}
          disabled={states.isLoading}
          hint="Also determines which pick-up/drop-off checklist schedule the driver follows."
        >
          <option value="">{states.isLoading ? "Loading locations..." : "Choose a location"}</option>
          {states.data?.items.map((state) => <option key={state.id} value={state.id}>{state.name}</option>)}
        </Select>
        <AddNewLocation existing={states.data?.items ?? []} defaultCountryId={defaultCountryId} onCreated={(state) => { setLocationId(state.id); clear("location"); }} />
      </div>

      <div className="space-y-2">
        <Select
          label="Type"
          value={typeId}
          onChange={(e) => { setTypeId(e.target.value); clear("vehicle_type_id"); }}
          error={errors.vehicle_type_id}
          disabled={types.isLoading}
        >
          <option value="">{types.isLoading ? "Loading types..." : "Choose a type"}</option>
          {types.data?.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
        </Select>
        <AddNew noun="type" existing={types.data ?? []} onCreated={(id) => { setTypeId(id); clear("vehicle_type_id"); }} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Select
            label="Make"
            value={makeId}
            onChange={(e) => { setMakeId(e.target.value); setModelId(""); clear("vehicle_make_id"); }}
            error={errors.vehicle_make_id}
            disabled={makes.isLoading}
          >
            <option value="">{makes.isLoading ? "Loading makes..." : "Choose a make"}</option>
            {makes.data?.map((make) => <option key={make.id} value={make.id}>{make.name}</option>)}
          </Select>
          <AddNew noun="make" existing={makes.data ?? []} onCreated={(id) => { setMakeId(id); setModelId(""); clear("vehicle_make_id"); }} />
        </div>
        <div className="space-y-2">
          <Select
            label="Model"
            value={modelId}
            onChange={(e) => { setModelId(e.target.value); clear("vehicle_model_id"); }}
            error={errors.vehicle_model_id}
            disabled={!makeId || models.isLoading}
            hint={!makeId ? "Choose a make first." : undefined}
          >
            <option value="">{!makeId ? "Choose a make first" : models.isLoading ? "Loading models..." : "Choose a model"}</option>
            {models.data?.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
          </Select>
          <AddNew noun="model" makeId={makeId} existing={models.data ?? []} onCreated={(id) => { setModelId(id); clear("vehicle_model_id"); }} />
        </div>
      </div>

      {formError && <Alert tone="error">{formError}</Alert>}

      <ModalActions>
        <Button variant="secondary" onClick={onClose} disabled={save.isPending}>Cancel</Button>
        <Button type="submit" loading={save.isPending}>{vehicle ? "Save changes" : "Add vehicle"}</Button>
      </ModalActions>
    </form>
  );
}
