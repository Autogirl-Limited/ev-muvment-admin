"use client";

import { useQuery } from "@tanstack/react-query";

import { listDvaProviders } from "@/lib/api/staff";
import { CACHE } from "./cache";
import { queryKeys } from "./keys";

/** Whether the extra Wema Bank (Paystack) account is switched on. False until known, so its options never flash in. */
export function usePaystackAccountsEnabled() {
  const query = useQuery({
    queryKey: queryKeys.dvaProviders,
    queryFn: ({ signal }) => listDvaProviders(signal),
    ...CACHE.settings,
  });
  return query.data?.providers.includes("PAYSTACK") ?? false;
}
