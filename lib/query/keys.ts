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
  walletAllocations: {
    all: ["wallet-allocations"] as const,
    list: (filters: unknown) => ["wallet-allocations", "list", filters] as const,
    detail: (id: string) => ["wallet-allocations", "detail", id] as const,
    stats: (filters: unknown) => ["wallet-allocations", "stats", filters] as const,
    queue: ["wallet-allocations", "queue"] as const,
  },
  notifications: {
    all: ["notifications"] as const,
    list: (filters: unknown) => ["notifications", "list", filters] as const,
    detail: (id: string) => ["notifications", "detail", id] as const,
    unreadCount: ["notifications", "unread-count"] as const,
  },
  dailyChecklists: {
    all: ["daily-checklists"] as const,
    list: (filters: unknown) => ["daily-checklists", "list", filters] as const,
    detail: (id: string) => ["daily-checklists", "detail", id] as const,
  },
  vehicles: {
    all: ["vehicles"] as const,
    list: (filters: unknown) => ["vehicles", "list", filters] as const,
    detail: (id: string) => ["vehicles", "detail", id] as const,
    /** Total for a filter, used for "used by N vehicles" hints. */
    count: (filters: unknown) => ["vehicles", "count", filters] as const,
  },
  vehicleTypes: {
    all: ["vehicle-types"] as const,
    list: (filters: unknown) => ["vehicle-types", "list", filters] as const,
  },
  vehicleMakes: {
    all: ["vehicle-makes"] as const,
    list: (filters: unknown) => ["vehicle-makes", "list", filters] as const,
  },
  vehicleModels: {
    all: ["vehicle-models"] as const,
    list: (filters: unknown) => ["vehicle-models", "list", filters] as const,
  },
  energyRate: {
    all: ["energy-rate"] as const,
    current: ["energy-rate", "current"] as const,
    history: (page: number) => ["energy-rate", "history", page] as const,
  },
  countries: {
    all: ["countries"] as const,
    list: (filters: unknown) => ["countries", "list", filters] as const,
  },
  /** The single global checklist configuration (`GET /checklist-settings`). */
  checklistSettings: ["checklist-settings"] as const,
  groups: {
    all: ["groups"] as const,
    list: (filters: unknown) => ["groups", "list", filters] as const,
    detail: (id: string) => ["groups", "detail", id] as const,
  },
  users: {
    all: ["users"] as const,
    drivers: (searchTerm: string) => ["users", "drivers", searchTerm] as const,
    assignableDrivers: (searchTerm: string) => ["users", "assignable-drivers", searchTerm] as const,
    detail: (id: string) => ["users", "detail", id] as const,
    search: (searchTerm: string) => ["users", "search", searchTerm] as const,
  },
};
