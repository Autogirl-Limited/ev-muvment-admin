import { keepPreviousData, queryOptions } from "@tanstack/react-query";

import { getChecklistSettings, getGroup, listGroups } from "@/lib/api/checklists-groups";
import {
  getCurrentEnergyRate,
  listCountries,
  listEnergyRates,
  listVehicleMakes,
  listVehicleModels,
  listVehicleTypes,
  type ListCatalogueParams,
  type ListVehicleModelsParams,
} from "@/lib/api/configuration";
import { getChecklistSettingsFor, listStates, type ListStatesParams } from "@/lib/api/states";
import { CACHE } from "@/lib/query/cache";
import { queryKeys } from "@/lib/query/keys";

/**
 * Query options for the configuration screens. The hub and each screen share
 * these, so the hub's requests warm exactly the cache entries the screens read
 * (same key, same function, same freshness) and opening a card is instant.
 * `placeholderData: keepPreviousData` keeps the last page on screen while the
 * next page or filter loads, instead of flashing a skeleton.
 */
export const configQueries = {
  types: (params: ListCatalogueParams) =>
    queryOptions({
      queryKey: queryKeys.vehicleTypes.list(params),
      queryFn: ({ signal }) => listVehicleTypes(params, signal),
      placeholderData: keepPreviousData,
      ...CACHE.reference,
    }),
  makes: (params: ListCatalogueParams) =>
    queryOptions({
      queryKey: queryKeys.vehicleMakes.list(params),
      queryFn: ({ signal }) => listVehicleMakes(params, signal),
      placeholderData: keepPreviousData,
      ...CACHE.reference,
    }),
  models: (params: ListVehicleModelsParams) =>
    queryOptions({
      queryKey: queryKeys.vehicleModels.list(params),
      queryFn: ({ signal }) => listVehicleModels(params, signal),
      placeholderData: keepPreviousData,
      ...CACHE.reference,
    }),
  countries: (params: ListCatalogueParams) =>
    queryOptions({
      queryKey: queryKeys.countries.list(params),
      queryFn: ({ signal }) => listCountries(params, signal),
      placeholderData: keepPreviousData,
      ...CACHE.reference,
    }),
  energyRate: () =>
    queryOptions({
      queryKey: queryKeys.energyRate.current,
      queryFn: ({ signal }) => getCurrentEnergyRate(signal),
      ...CACHE.settings,
    }),
  energyHistory: (page: number, pageSize: number) =>
    queryOptions({
      queryKey: queryKeys.energyRate.history(page),
      queryFn: ({ signal }) => listEnergyRates({ page, page_size: pageSize }, signal),
      placeholderData: keepPreviousData,
      ...CACHE.settings,
    }),
  checklistSettings: () =>
    queryOptions({
      queryKey: queryKeys.checklistSettings,
      queryFn: ({ signal }) => getChecklistSettings(signal),
      ...CACHE.settings,
    }),
  groups: (params: ListCatalogueParams) =>
    queryOptions({
      queryKey: queryKeys.groups.list(params),
      queryFn: ({ signal }) => listGroups(params, signal),
      placeholderData: keepPreviousData,
      ...CACHE.list,
    }),
  group: (id: string) =>
    queryOptions({
      queryKey: queryKeys.groups.detail(id),
      queryFn: ({ signal }) => getGroup(id, signal),
      ...CACHE.live,
    }),
  states: (params: ListStatesParams) =>
    queryOptions({
      queryKey: queryKeys.states.list(params),
      queryFn: ({ signal }) => listStates(params, signal),
      placeholderData: keepPreviousData,
      ...CACHE.reference,
    }),
  /** Pass `null` for the global default. */
  stateChecklistSettings: (stateId: string | null) =>
    queryOptions({
      queryKey: queryKeys.stateChecklistSettings(stateId),
      queryFn: ({ signal }) => getChecklistSettingsFor(stateId ?? undefined, signal),
      ...CACHE.settings,
    }),
};
