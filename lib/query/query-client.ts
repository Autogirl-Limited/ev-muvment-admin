import { QueryClient, isServer } from "@tanstack/react-query";

import { ApiError } from "@/lib/api/browser";

const MINUTE = 60_000;
const MAX_TRANSIENT_RETRIES = 2;

/**
 * Cache policy. Defaults suit "load once, keep fresh in the background":
 * data counts as fresh for a minute (no refetch on every mount or navigation)
 * and stays in memory for 10 minutes after its last use. Tighten or loosen per
 * query with `staleTime` (e.g. long for reference data such as countries or
 * vehicle makes, 0 for live figures).
 */
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: MINUTE,
        gcTime: 10 * MINUTE,
        // A 4xx will not fix itself; only retry network faults and 5xx.
        retry: (failureCount, error) =>
          error instanceof ApiError && error.isTransient && failureCount < MAX_TRANSIENT_RETRIES,
        refetchOnWindowFocus: true,
      },
      // Never replay a write automatically.
      mutations: { retry: false },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

/**
 * Server: a fresh client per call (never share cache between users' requests).
 * Browser: one client for the life of the page. The cache lives in memory only
 * and is intentionally never persisted to storage, because it holds
 * staff-only data.
 */
export function getQueryClient(): QueryClient {
  if (isServer) return makeQueryClient();
  return (browserQueryClient ??= makeQueryClient());
}
