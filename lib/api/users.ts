import { apiFetch } from "@/lib/api/browser";
import { toQuery, type NamedRef } from "@/lib/api/configuration";
import type { Paginated, VirtualAccount } from "@/lib/api/staff";
import type { UserType } from "@/lib/api/types";

export type StaffRole = Exclude<UserType, "DRIVER">;

export const STAFF_ROLES: readonly StaffRole[] = ["ADMIN", "ACCOUNT_OFFICER", "RELATIONSHIP_OFFICER"];

/** The compact vehicle embedded in a user: no plate number and no checklist overrides. */
export interface VehicleSummary {
  id: string;
  name: string;
  location_state: string;
  vehicle_type: NamedRef;
  vehicle_make: NamedRef;
  vehicle_model: NamedRef;
}

/** A user as returned by the admin `/users` endpoints (`virtual_account` / `vehicle` are typed, unlike the session `User`). */
export interface ManagedUser {
  id: string;
  created_at: string;
  updated_at: string;
  first_name: string;
  last_name: string;
  username: string;
  email: string | null;
  phone_number: string | null;
  user_type: UserType;
  is_active: boolean;
  two_factor_enabled: boolean;
  totp_enabled: boolean;
  ev_wallet_balance: number;
  virtual_account: VirtualAccount | null;
  vehicle: VehicleSummary | null;
  shift: boolean;
}

export interface ListUsersParams {
  page?: number;
  page_size?: number;
  searchTerm?: string;
  userType?: UserType;
}

export interface InviteStaffRequest {
  first_name: string;
  last_name: string;
  username: string;
  email: string;
  phone_number?: string;
  user_type: StaffRole;
}

export function listUsers(params: ListUsersParams, signal?: AbortSignal) {
  return apiFetch<Paginated<ManagedUser>>(`/users${toQuery({ ...params })}`, { signal });
}

const MAX_ROSTER_PAGES = 30;

/**
 * Every user of one role. There is no bulk endpoint and no server-side filter for
 * active / vehicle / shift / bank account, so the people screens load the whole
 * roster (100 per request) and filter, sort and paginate it locally.
 */
export async function listAllUsers(userType: UserType, signal?: AbortSignal) {
  const items: ManagedUser[] = [];
  for (let page = 1; page <= MAX_ROSTER_PAGES; page += 1) {
    const result = await listUsers({ userType, page, page_size: 100 }, signal);
    items.push(...result.items);
    if (!result.pagination.has_next) break;
  }
  return items;
}

export function getUser(id: string, signal?: AbortSignal) {
  return apiFetch<ManagedUser>(`/users/${id}`, { signal });
}

export function inviteStaff(input: InviteStaffRequest) {
  const phone = input.phone_number?.trim();
  return apiFetch<ManagedUser>("/users/invite", {
    method: "POST",
    body: {
      first_name: input.first_name.trim(),
      last_name: input.last_name.trim(),
      username: input.username.trim(),
      email: input.email.trim(),
      ...(phone ? { phone_number: phone } : {}),
      user_type: input.user_type,
    },
  });
}

/** The API rejects an explicit `null` with a 500, so only keys that are set are sent. */
export function updateUser(id: string, patch: { user_type?: StaffRole; is_active?: boolean }) {
  const body: Record<string, unknown> = {};
  if (patch.user_type !== undefined) body.user_type = patch.user_type;
  if (patch.is_active !== undefined) body.is_active = patch.is_active;
  return apiFetch<ManagedUser>(`/users/${id}`, { method: "PATCH", body });
}

export function deleteUser(id: string) {
  return apiFetch<null>(`/users/${id}`, { method: "DELETE" });
}

export function checkUsername(username: string, signal?: AbortSignal) {
  return apiFetch<{ username: string; available: boolean }>(`/users/check-username${toQuery({ username })}`, { signal });
}

export function suggestUsernames(firstName: string, lastName: string, signal?: AbortSignal) {
  return apiFetch<{ suggestions: string[] }>(`/users/suggest-username${toQuery({ first_name: firstName, last_name: lastName })}`, { signal });
}
