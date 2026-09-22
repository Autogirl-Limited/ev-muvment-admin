"use client";

import { useQuery } from "@tanstack/react-query";

import {
  getAllocationsByStatus,
  getDashboardOverview,
  getFinancialSummary,
  getMoneyTrend,
  getNeedsAttention,
  getVehicleCondition,
  type DashboardInterval,
  type DashboardRange,
} from "@/lib/api/dashboard";
import { CACHE } from "@/lib/query/cache";
import { queryKeys } from "@/lib/query/keys";

interface DashboardFilters extends DashboardRange {
  interval: DashboardInterval;
}

export function useDashboardQueries(filters: DashboardFilters, enabled: boolean) {
  const range = { dateFrom: filters.dateFrom, dateTo: filters.dateTo };

  return {
    overview: useQuery({
      queryKey: queryKeys.dashboard.overview,
      queryFn: ({ signal }) => getDashboardOverview(signal),
      enabled,
      refetchOnWindowFocus: true,
      ...CACHE.settings,
    }),
    financialSummary: useQuery({
      queryKey: queryKeys.dashboard.financialSummary(range),
      queryFn: ({ signal }) => getFinancialSummary(range, signal),
      enabled,
      refetchOnWindowFocus: true,
      ...CACHE.settings,
    }),
    needsAttention: useQuery({
      queryKey: queryKeys.dashboard.needsAttention,
      queryFn: ({ signal }) => getNeedsAttention(signal),
      enabled,
      refetchOnWindowFocus: true,
      ...CACHE.live,
    }),
    allocationsByStatus: useQuery({
      queryKey: queryKeys.dashboard.allocationsByStatus(range),
      queryFn: ({ signal }) => getAllocationsByStatus(range, signal),
      enabled,
      refetchOnWindowFocus: true,
      ...CACHE.settings,
    }),
    vehicleCondition: useQuery({
      queryKey: queryKeys.dashboard.vehicleCondition,
      queryFn: ({ signal }) => getVehicleCondition(signal),
      enabled,
      refetchOnWindowFocus: true,
      ...CACHE.settings,
    }),
    moneyTrend: useQuery({
      queryKey: queryKeys.dashboard.moneyTrend(filters),
      queryFn: ({ signal }) => getMoneyTrend(filters, signal),
      enabled,
      refetchOnWindowFocus: true,
      ...CACHE.settings,
    }),
  };
}
