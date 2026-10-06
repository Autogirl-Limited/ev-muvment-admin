import { useQuery } from "@tanstack/react-query";

import { getFleetBalance } from "@/lib/api/lotgrids";
import { CACHE } from "@/lib/query/cache";
import { queryKeys } from "@/lib/query/keys";

/**
 * The LotGrids fleet wallet (admin only). Shared by the dashboard, EV Wallet,
 * driver detail and the LotGrids screen so they read one cached value. Polled
 * while mounted because it drains as top-ups and grants are distributed.
 */
export function useFleetBalance(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.lotgrids.fleetBalance,
    queryFn: ({ signal }) => getFleetBalance(signal),
    enabled,
    retry: false,
    refetchInterval: 60_000,
    ...CACHE.live,
  });
}
