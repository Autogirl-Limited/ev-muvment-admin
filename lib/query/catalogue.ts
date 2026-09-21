"use client";

import { useQuery } from "@tanstack/react-query";

import { listVehicleMakes, listVehicleModels, listVehicleTypes } from "@/lib/api/configuration";
import { queryKeys } from "@/lib/query/keys";

/**
 * Full catalogue lists for dropdowns and duplicate checks. The API caps a page
 * at 100 rows, which is far above today's catalogue; loop pages if that changes.
 * Reference data changes rarely, so it is kept fresh for five minutes and
 * invalidated by every catalogue write.
 */
const OPTIONS = { page: 1, page_size: 100 } as const;
const FIVE_MINUTES = 5 * 60_000;

export function useTypeOptions(enabled = true) {
  return useQuery({
    queryKey: queryKeys.vehicleTypes.list(OPTIONS),
    queryFn: ({ signal }) => listVehicleTypes(OPTIONS, signal),
    select: (data) => data.items,
    staleTime: FIVE_MINUTES,
    enabled,
  });
}

export function useMakeOptions(enabled = true) {
  return useQuery({
    queryKey: queryKeys.vehicleMakes.list(OPTIONS),
    queryFn: ({ signal }) => listVehicleMakes(OPTIONS, signal),
    select: (data) => data.items,
    staleTime: FIVE_MINUTES,
    enabled,
  });
}

/** Models of one make (or all models when `makeId` is omitted and `all` is set). */
export function useModelOptions(makeId: string | undefined, { all = false, enabled = true } = {}) {
  const filters = { ...OPTIONS, vehicleMakeId: makeId || undefined };
  return useQuery({
    queryKey: queryKeys.vehicleModels.list(filters),
    queryFn: ({ signal }) => listVehicleModels(filters, signal),
    select: (data) => data.items,
    staleTime: FIVE_MINUTES,
    enabled: enabled && (all || Boolean(makeId)),
  });
}
