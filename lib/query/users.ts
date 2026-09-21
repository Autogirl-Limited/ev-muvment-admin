"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { STAFF_ROLES, deleteUser, getUser, listAllUsers, updateUser, type ManagedUser, type StaffRole } from "@/lib/api/users";
import { CACHE } from "./cache";
import { queryKeys } from "./keys";

export type Roster = "DRIVER" | "STAFF";

const newestFirst = (a: ManagedUser, b: ManagedUser) => b.created_at.localeCompare(a.created_at);

async function loadRoster(roster: Roster, signal?: AbortSignal) {
  if (roster === "DRIVER") return listAllUsers("DRIVER", signal);
  const groups = await Promise.all(STAFF_ROLES.map((role) => listAllUsers(role, signal)));
  return groups.flat().sort(newestFirst);
}

/** Every driver, or every staff member (all three staff roles), newest first. Admin-only endpoint. */
export function useRoster(roster: Roster, enabled = true) {
  return useQuery({
    queryKey: queryKeys.users.roster(roster),
    queryFn: ({ signal }) => loadRoster(roster, signal),
    enabled,
    refetchOnWindowFocus: true,
    ...CACHE.list,
  });
}

export function useManagedUser(id: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.users.detail(id),
    queryFn: ({ signal }) => getUser(id, signal),
    enabled,
    refetchOnWindowFocus: true,
    ...CACHE.live,
  });
}

/** Any change to a user can move rosters, the detail page, vehicle assignments and wallet figures. */
export function useRefreshPeople() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
  };
}

export function useUpdateUser() {
  const refresh = useRefreshPeople();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { user_type?: StaffRole; is_active?: boolean } }) => updateUser(id, patch),
    onSuccess: refresh,
  });
}

export function useDeleteUser() {
  const refresh = useRefreshPeople();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: (_, id) => {
      // Drop the record first so its open detail page doesn't refetch into a 404 while navigating away.
      queryClient.removeQueries({ queryKey: queryKeys.users.detail(id) });
      // Deleting a driver also erases their wallet allocations and DVA transactions.
      queryClient.invalidateQueries({ queryKey: queryKeys.walletAllocations.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dvaTransactions.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dailyChecklists.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.groups.all });
      refresh();
    },
  });
}
