"use client";

import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api/browser";
import type { User } from "@/lib/api/types";
import { queryKeys } from "./keys";

export function fetchCurrentUser(signal?: AbortSignal) {
  return apiFetch<User>("/users/me", { signal });
}

/**
 * The signed-in staff member. The dashboard layout seeds the cache from the
 * server, so this never shows a loading state; it then stays fresh through
 * background refetches. Only usable under the dashboard layout.
 */
export function useCurrentUser(): User {
  const { data } = useSuspenseQuery({
    queryKey: queryKeys.me,
    queryFn: ({ signal }) => fetchCurrentUser(signal),
  });
  return data;
}

/** Marks the user stale and refetches it. Call after anything that changes 2FA flags or role. */
export function useInvalidateCurrentUser() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.me });
}

/** `PATCH /users/me`. The response is the updated user, so the cache is set directly (no refetch). */
export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { first_name: string; last_name: string }) =>
      apiFetch<User>("/users/me", { method: "PATCH", body: input }),
    onSuccess: (user) => queryClient.setQueryData(queryKeys.me, user),
  });
}
