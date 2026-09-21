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
  driverApplications: {
    all: ["driver-applications"] as const,
    list: (filters: unknown) => ["driver-applications", "list", filters] as const,
    detail: (id: string) => ["driver-applications", "detail", id] as const,
    counts: (searchTerm: string) => ["driver-applications", "counts", searchTerm] as const,
  },
  dvaTransactions: {
    all: ["dva-transactions"] as const,
    list: (filters: unknown) => ["dva-transactions", "list", filters] as const,
    detail: (id: string) => ["dva-transactions", "detail", id] as const,
    stats: (filters: unknown) => ["dva-transactions", "stats", filters] as const,
  },
  users: {
    all: ["users"] as const,
    drivers: (searchTerm: string) => ["users", "drivers", searchTerm] as const,
    detail: (id: string) => ["users", "detail", id] as const,
  },
};
