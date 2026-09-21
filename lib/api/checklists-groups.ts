import { apiFetch } from "@/lib/api/browser";
import { toQuery, type ListCatalogueParams } from "@/lib/api/configuration";
import type { Paginated } from "@/lib/api/staff";

// ---------- Checklist settings ----------
export type AIProvider = "DEEPSEEK" | "GEMINI" | "OPENAI";

export interface ChecklistLocation {
  address: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
}

export interface PhaseSettings {
  /** "HH:MM:SS", Nigeria wall-clock time (UTC+1). */
  start_time: string;
  end_time: string;
  /** `null` means the phase is not geofenced. */
  location: ChecklistLocation | null;
}

export interface ChecklistSettings {
  id: string;
  created_at: string;
  updated_at: string;
  pick_up: PhaseSettings;
  drop_off: PhaseSettings;
  grace_minutes: number;
  ai_provider: AIProvider;
  /** The override staff set; `null` means the provider's default model. */
  ai_model: string | null;
  /** Read-only: the model that will actually run. */
  ai_model_in_use: string;
  updated_by: string | null;
}

export interface UpdatePhaseSettings {
  start_time?: string;
  end_time?: string;
  /** Object sets it, `null` CLEARS it, omitted leaves it alone. */
  location?: { address: string; latitude: number; longitude: number; radius_meters?: number } | null;
}

/**
 * Unlike the other PATCH endpoints, `null` is meaningful here (`location: null`
 * clears, `ai_model: null` resets), so this body must be sent exactly as built.
 */
export interface UpdateChecklistSettingsRequest {
  pick_up?: UpdatePhaseSettings;
  drop_off?: UpdatePhaseSettings;
  grace_minutes?: number;
  ai_provider?: AIProvider;
  ai_model?: string | null;
}

export function getChecklistSettings(signal?: AbortSignal) {
  return apiFetch<ChecklistSettings>("/checklist-settings", { signal });
}

export function updateChecklistSettings(patch: UpdateChecklistSettingsRequest) {
  return apiFetch<ChecklistSettings>("/checklist-settings", { method: "PATCH", body: patch });
}

// ---------- Groups ----------
export const ACCOUNTS_TEAM_GROUP_NAME = "ACCOUNTS TEAM";

/** The API finds this group by name to decide who gets live payment alerts. */
export const isAccountsTeam = (name: string) => name.trim().toUpperCase() === ACCOUNTS_TEAM_GROUP_NAME;

export interface GroupMember {
  id: string;
  first_name: string;
  last_name: string;
  username: string;
  user_type: "ADMIN" | "ACCOUNT_OFFICER" | "RELATIONSHIP_OFFICER" | "DRIVER";
  email: string | null;
  phone_number: string | null;
}

export interface Group {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  description: string | null;
  created_by: string | null;
  member_count: number;
  /** Only populated by `GET /groups/{id}`. */
  members: GroupMember[] | null;
}

export function listGroups(params: ListCatalogueParams, signal?: AbortSignal) {
  return apiFetch<Paginated<Group>>(`/groups${toQuery({ ...params })}`, { signal });
}

export function getGroup(id: string, signal?: AbortSignal) {
  return apiFetch<Group>(`/groups/${id}`, { signal });
}

export function createGroup(input: { name: string; description: string }) {
  const description = input.description.trim();
  return apiFetch<Group>("/groups", {
    method: "POST",
    body: { name: input.name.trim(), ...(description ? { description } : {}) },
  });
}

export function deleteGroup(id: string) {
  return apiFetch<null>(`/groups/${id}`, { method: "DELETE" });
}

export function addGroupMember(groupId: string, userId: string) {
  return apiFetch<null>(`/groups/${groupId}/members`, { method: "POST", body: { user_id: userId } });
}

export function removeGroupMember(groupId: string, userId: string) {
  return apiFetch<null>(`/groups/${groupId}/members/${userId}`, { method: "DELETE" });
}

/** A user as returned by the admin-only `GET /users` search. */
export interface UserSearchResult extends GroupMember {
  is_active: boolean;
}

export function searchUsers(searchTerm: string, signal?: AbortSignal) {
  return apiFetch<Paginated<UserSearchResult>>(
    `/users${toQuery({ page: 1, page_size: 20, searchTerm: searchTerm.trim() || undefined })}`,
    { signal },
  );
}
