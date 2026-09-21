/**
 * Query key factory: one place that defines every cache key, so invalidation
 * and prefetching can't drift apart. Keys go from general to specific, so
 * invalidating a prefix (`["users"]`) covers everything beneath it.
 *
 * Adding a resource, e.g. vehicles:
 *   vehicles: {
 *     all: ["vehicles"] as const,
 *     list: (filters: VehicleFilters) => ["vehicles", "list", filters] as const,
 *     detail: (id: string) => ["vehicles", "detail", id] as const,
 *   },
 */
export const queryKeys = {
  /** The signed-in staff member (`GET /users/me`). */
  me: ["me"] as const,
};
