"use client";

import { useId, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

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
import { sameName } from "@/lib/format";
import { useMakeOptions, useModelOptions, useTypeOptions } from "@/lib/query/catalogue";
import { queryKeys } from "@/lib/query/keys";

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
  locationHints: string[];
  onClose: () => void;
  onSaved: (vehicle: Vehicle) => void;
}

export function VehicleForm({ vehicle, locationHints, onClose, onSaved }: VehicleFormProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const locationListId = useId();

  const [name, setName] = useState(vehicle?.name ?? "");
  const [plate, setPlate] = useState(vehicle?.plate_number ?? "");
  const [location, setLocation] = useState(vehicle?.location_state ?? "");
  const [typeId, setTypeId] = useState(vehicle?.vehicle_type.id ?? "");
  const [makeId, setMakeId] = useState(vehicle?.vehicle_make.id ?? "");
  const [modelId, setModelId] = useState(vehicle?.vehicle_model.id ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const types = useTypeOptions();
  const makes = useMakeOptions();
  const models = useModelOptions(makeId);

  const clear = (key: string) => setErrors((current) => ({ ...current, [key]: "" }));

  const save = useMutation({
    mutationFn: async () => {
      const clean = {
        name: name.trim(),
        plate_number: plate.trim().toUpperCase(),
        location_state: location.trim(),
        vehicle_type_id: typeId,
        vehicle_model_id: modelId,
      };
      if (!vehicle) return createVehicle(clean);
      // Send only what changed, and never a null (the API answers 500 to it).
      const changes = diff(clean, {
        name: vehicle.name,
        plate_number: vehicle.plate_number,
        location_state: vehicle.location_state,
        vehicle_type_id: vehicle.vehicle_type.id,
        vehicle_model_id: vehicle.vehicle_model.id,
      });
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
        // A type or model was deleted in another tab.
        queryClient.invalidateQueries({ queryKey: queryKeys.vehicleTypes.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.vehicleMakes.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.vehicleModels.all });
        setFormError("The type or model you picked is no longer available. Please choose again.");
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
    if (!location.trim()) found.location_state = "Where is this vehicle based?";
    else if (location.trim().length > 100) found.location_state = "Locations can be at most 100 characters.";
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

      <div>
        <Field
          label="Location"
          value={location}
          onChange={(e) => { setLocation(e.target.value); clear("location_state"); }}
          error={errors.location_state}
          hint="Pick a suggestion so spellings stay consistent."
          placeholder="Lagos"
          maxLength={100}
          autoComplete="off"
          list={locationListId}
        />
        <datalist id={locationListId}>
          {locationHints.map((place) => <option key={place} value={place} />)}
        </datalist>
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
