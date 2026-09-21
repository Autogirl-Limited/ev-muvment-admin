/**
 * Cache policy for the configuration screens, one place so screens agree.
 *
 * - `reference`: rarely changes and every write invalidates it, so it can sit
 *   in memory for a long time (vehicle catalogue, countries).
 * - `settings`: singleton config that other staff can change; kept a couple of
 *   minutes and re-checked on focus (checklist settings, energy rate).
 * - `list`: records people edit often (groups, fleet); short freshness, but
 *   still served instantly from cache while a background refetch runs.
 *
 * Data lives in memory only and is never persisted (see query-client.ts).
 */
const SECOND = 1_000;
const MINUTE = 60 * SECOND;

export const CACHE = {
  reference: { staleTime: 10 * MINUTE, gcTime: 45 * MINUTE },
  settings: { staleTime: 2 * MINUTE, gcTime: 30 * MINUTE },
  list: { staleTime: 30 * SECOND, gcTime: 15 * MINUTE },
  live: { staleTime: 15 * SECOND, gcTime: 10 * MINUTE },
} as const;

/** Page size shared by every paginated configuration list, so hub prefetches match the pages. */
export const LIST_PAGE_SIZE = 20;
