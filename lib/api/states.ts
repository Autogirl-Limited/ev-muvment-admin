import { apiFetch } from "@/lib/api/browser";
import type { AIProvider, ChecklistSettings, UpdateChecklistSettingsRequest } from "@/lib/api/checklists-groups";
import { toQuery, type ListCatalogueParams } from "@/lib/api/configuration";
import type { Paginated } from "@/lib/api/staff";

/**
 * States (a managed list under a country) and per-state checklist settings.
 * See ev-muvment-api/docs/2026/09/22/states-and-per-state-checklist-settings-api.md.
 *
 * Precedence for a vehicle's effective checklist settings:
 *   one-day schedule override > vehicle's standing override > the vehicle's
 *   state's settings (if customised) > the global default (state_id: null).
 */

export interface CountryRef {
  id: string;
  name: string;
}

export interface State {
  id: string;
  created_at: string;
  updated_at: string;
  country: CountryRef;
  name: string;
  /** Purely informational today — nothing filters on it server-side. */
  is_active: boolean;
}

export interface CreateStateRequest {
  country_id: string;
  name: string;
  is_active?: boolean;
}

export type UpdateStateRequest = Partial<CreateStateRequest>;

export interface ListStatesParams extends ListCatalogueParams {
  countryId?: string;
}

export function listStates(params: ListStatesParams, signal?: AbortSignal) {
  return apiFetch<Paginated<State>>(`/states${toQuery({ ...params })}`, { signal });
}

export function getState(id: string, signal?: AbortSignal) {
  return apiFetch<State>(`/states/${id}`, { signal });
}

export function createState(input: CreateStateRequest) {
  return apiFetch<State>("/states", { method: "POST", body: { ...input, name: input.name.trim() } });
}

export function updateState(id: string, input: UpdateStateRequest) {
  return apiFetch<State>(`/states/${id}`, { method: "PATCH", body: input });
}

export function deleteState(id: string) {
  return apiFetch<null>(`/states/${id}`, { method: "DELETE" });
}

// ---------- Per-state checklist settings ----------

/** Same shape as the global `ChecklistSettings`, plus `state_id` (`null` = this IS the global row). */
export interface StateChecklistSettings extends ChecklistSettings {
  state_id: string | null;
}

/** Omit `stateId` for the global default. */
export function getChecklistSettingsFor(stateId: string | undefined, signal?: AbortSignal) {
  return apiFetch<StateChecklistSettings>(`/checklist-settings${toQuery({ stateId })}`, { signal });
}

export function updateChecklistSettingsFor(stateId: string | undefined, patch: UpdateChecklistSettingsRequest) {
  return apiFetch<StateChecklistSettings>(`/checklist-settings${toQuery({ stateId })}`, { method: "PATCH", body: patch });
}

export type { AIProvider };
