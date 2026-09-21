import { apiFetch } from "@/lib/api/browser";
import type { Paginated } from "@/lib/api/staff";

/**
 * Fleet vehicles and platform configuration: the vehicle catalogue (types, makes,
 * models), the energy rate and countries. See
 * ev-muvment-api/docs/2026/09/21/admin-fleet-and-reference-data-api.md.
 *
 * PATCH bodies must never contain an explicit `null` (the API answers 500), so
 * `diff()` builds them from changed keys only.
 */

// ---------- Shared ----------
export interface NamedRef {
  id: string;
  name: string;
}

type QueryValue = string | number | boolean | undefined | null;

function toQuery(params: Record<string, QueryValue>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    query.set(key, String(value));
  });
  const text = query.toString();
  return text ? `?${text}` : "";
}

/** Only the keys whose value changed, never `undefined`/`null`. */
export function diff<T extends object>(next: T, current: Partial<Record<keyof T, unknown>>): Partial<T> {
  const out: Partial<T> = {};
  (Object.keys(next) as (keyof T)[]).forEach((key) => {
    const value = next[key];
    if (value !== undefined && value !== null && value !== current[key]) out[key] = value;
  });
  return out;
}

// ---------- Catalogue ----------
export interface VehicleType {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
}
export type VehicleMake = VehicleType;

export interface VehicleModel {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  vehicle_make_id: string;
  vehicle_make_name: string;
}

export interface ListCatalogueParams {
  page?: number;
  page_size?: number;
  searchTerm?: string;
}

export interface ListVehicleModelsParams extends ListCatalogueParams {
  vehicleMakeId?: string;
}

export type CatalogueKind = "types" | "makes";
const CATALOGUE_PATH: Record<CatalogueKind, string> = {
  types: "/vehicle-types",
  makes: "/vehicle-makes",
};

export function listVehicleTypes(params: ListCatalogueParams, signal?: AbortSignal) {
  return apiFetch<Paginated<VehicleType>>(`/vehicle-types${toQuery({ ...params })}`, { signal });
}

export function listVehicleMakes(params: ListCatalogueParams, signal?: AbortSignal) {
  return apiFetch<Paginated<VehicleMake>>(`/vehicle-makes${toQuery({ ...params })}`, { signal });
}

export function listVehicleModels(params: ListVehicleModelsParams, signal?: AbortSignal) {
  return apiFetch<Paginated<VehicleModel>>(`/vehicle-models${toQuery({ ...params })}`, { signal });
}

export function createCatalogueEntry(kind: CatalogueKind, name: string) {
  return apiFetch<VehicleType>(CATALOGUE_PATH[kind], { method: "POST", body: { name: name.trim() } });
}

export function renameCatalogueEntry(kind: CatalogueKind, id: string, name: string) {
  return apiFetch<VehicleType>(`${CATALOGUE_PATH[kind]}/${id}`, { method: "PATCH", body: { name: name.trim() } });
}

export function deleteCatalogueEntry(kind: CatalogueKind, id: string) {
  return apiFetch<null>(`${CATALOGUE_PATH[kind]}/${id}`, { method: "DELETE" });
}

export function createVehicleModel(input: { vehicle_make_id: string; name: string }) {
  return apiFetch<VehicleModel>("/vehicle-models", {
    method: "POST",
    body: { vehicle_make_id: input.vehicle_make_id, name: input.name.trim() },
  });
}

export function updateVehicleModel(id: string, input: { name?: string; vehicle_make_id?: string }) {
  return apiFetch<VehicleModel>(`/vehicle-models/${id}`, { method: "PATCH", body: input });
}

export function deleteVehicleModel(id: string) {
  return apiFetch<null>(`/vehicle-models/${id}`, { method: "DELETE" });
}

// ---------- Vehicles ----------
export interface VehicleDriver {
  id: string;
  first_name: string;
  last_name: string;
  username: string;
  phone_number: string | null;
}

export interface Vehicle {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  plate_number: string;
  location_state: string;
  vehicle_type: NamedRef;
  vehicle_make: NamedRef;
  vehicle_model: NamedRef;
  driver_id: string | null;
  driver: VehicleDriver | null;
  assigned_at: string | null;
  assigned_by: string | null;
}

export interface CreateVehicleRequest {
  name: string;
  plate_number: string;
  location_state: string;
  vehicle_type_id: string;
  vehicle_model_id: string;
}

export type UpdateVehicleRequest = Partial<CreateVehicleRequest>;

export interface ListVehiclesParams {
  page?: number;
  page_size?: number;
  searchTerm?: string;
  locationState?: string;
  vehicleTypeId?: string;
  vehicleMakeId?: string;
  vehicleModelId?: string;
  driverId?: string;
  assigned?: boolean;
}

export function listVehicles(params: ListVehiclesParams, signal?: AbortSignal) {
  return apiFetch<Paginated<Vehicle>>(`/vehicles${toQuery({ ...params })}`, { signal });
}

export function getVehicle(id: string, signal?: AbortSignal) {
  return apiFetch<Vehicle>(`/vehicles/${id}`, { signal });
}

export function createVehicle(input: CreateVehicleRequest) {
  return apiFetch<Vehicle>("/vehicles", {
    method: "POST",
    body: { ...input, name: input.name.trim(), plate_number: input.plate_number.trim().toUpperCase(), location_state: input.location_state.trim() },
  });
}

export function updateVehicle(id: string, input: UpdateVehicleRequest) {
  return apiFetch<Vehicle>(`/vehicles/${id}`, { method: "PATCH", body: input });
}

export function deleteVehicle(id: string) {
  return apiFetch<null>(`/vehicles/${id}`, { method: "DELETE" });
}

export function assignDriver(vehicleId: string, driverId: string) {
  return apiFetch<Vehicle>(`/vehicles/${vehicleId}/assign`, { method: "POST", body: { driver_id: driverId } });
}

export function unassignDriver(vehicleId: string) {
  return apiFetch<Vehicle>(`/vehicles/${vehicleId}/unassign`, { method: "POST" });
}

/** A driver as listed by `GET /users?userType=DRIVER`, including the vehicle they hold. */
export interface DriverOption {
  id: string;
  first_name: string;
  last_name: string;
  username: string;
  phone_number: string | null;
  is_active: boolean;
  vehicle?: { id: string; name: string; location_state: string } | null;
}

export function listDriverOptions(searchTerm: string, signal?: AbortSignal) {
  return apiFetch<Paginated<DriverOption>>(
    `/users${toQuery({ userType: "DRIVER", page: 1, page_size: 100, searchTerm: searchTerm.trim() || undefined })}`,
    { signal },
  );
}

// ---------- Energy rates ----------
export interface EnergyRate {
  id: string;
  created_at: string;
  updated_at: string;
  rate_per_kwh: number;
  set_by: string | null;
}

export function getCurrentEnergyRate(signal?: AbortSignal) {
  return apiFetch<EnergyRate>("/energy-rates/current", { signal });
}

export function listEnergyRates(params: { page?: number; page_size?: number }, signal?: AbortSignal) {
  return apiFetch<Paginated<EnergyRate>>(`/energy-rates${toQuery({ ...params })}`, { signal });
}

export function setEnergyRate(ratePerKwh: number) {
  return apiFetch<EnergyRate>("/energy-rates", { method: "POST", body: { rate_per_kwh: ratePerKwh } });
}

export function getStaffMember(id: string, signal?: AbortSignal) {
  return apiFetch<{ id: string; first_name: string; last_name: string; username: string }>(`/users/${id}`, { signal });
}

// ---------- Countries ----------
export interface Country {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  continent: string;
  country_code: string;
  currency_name: string;
  currency_symbol: string;
  is_active: boolean;
}

export interface CountryInput {
  name: string;
  continent: string;
  country_code: string;
  currency_name: string;
  currency_symbol: string;
  is_active?: boolean;
}

export function listCountries(params: ListCatalogueParams, signal?: AbortSignal) {
  return apiFetch<Paginated<Country>>(`/countries${toQuery({ ...params })}`, { signal });
}

export function createCountry(input: CountryInput) {
  return apiFetch<Country>("/countries", { method: "POST", body: input });
}

export function updateCountry(id: string, input: Partial<CountryInput>) {
  return apiFetch<Country>(`/countries/${id}`, { method: "PATCH", body: input });
}

export function deleteCountry(id: string) {
  return apiFetch<null>(`/countries/${id}`, { method: "DELETE" });
}
