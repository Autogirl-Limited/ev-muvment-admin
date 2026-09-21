"use client";

import { useQueries } from "@tanstack/react-query";

import { getStaffMember } from "@/lib/api/configuration";
import { fullName } from "@/lib/format";
import { CACHE } from "@/lib/query/cache";
import { queryKeys } from "@/lib/query/keys";

/**
 * Resolves user ids to display names (the API returns ids only for "set by" /
 * "updated by"). `GET /users/{id}` is admin-only, so pass `enabled` for admins
 * and the resolver returns `null` for everyone else. Names are cached per id
 * for the session: a person's name doesn't change under us.
 */
export function useStaffNames(ids: (string | null | undefined)[], enabled: boolean) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const results = useQueries({
    queries: unique.map((id) => ({
      queryKey: queryKeys.users.detail(id),
      queryFn: ({ signal }: { signal: AbortSignal }) => getStaffMember(id, signal),
      enabled,
      staleTime: Infinity,
      gcTime: CACHE.reference.gcTime,
      retry: false,
    })),
  });
  const names = new Map<string, string>();
  unique.forEach((id, index) => {
    const person = results[index]?.data;
    if (person) names.set(id, fullName(person));
  });
  /** The resolved name, or `null` when unknown or not resolvable for this user. */
  return (id: string | null | undefined) => (id ? (names.get(id) ?? null) : null);
}
