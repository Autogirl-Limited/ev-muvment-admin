"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { TwoFactorMethod, TwoFactorMethods } from "@/lib/api/types";
import { getTwoFactorMethods, setPreferredTwoFactorMethod } from "@/lib/auth/actions";
import { queryKeys } from "./keys";

/**
 * `/auth/*` is unreachable through the browser proxy, so these go through
 * Server Actions; a failed action is rethrown so React Query sees an error.
 */
async function unwrap<T>(promise: Promise<{ ok: true; data: T } | { ok: false; message: string }>): Promise<T> {
  const result = await promise;
  if (!result.ok) throw new Error(result.message || "Something went wrong. Please try again.");
  return result.data;
}

/** The signed-in user's two-factor options: offered by the admin, set up, preferred. */
export function useMyTwoFactorMethods() {
  return useQuery({
    queryKey: queryKeys.myTwoFactorMethods,
    queryFn: () => unwrap(getTwoFactorMethods()),
    staleTime: 30_000,
  });
}

/** `PUT /auth/2fa/preferred-method`. The response is the updated list, so the cache is set directly. */
export function useSetPreferredTwoFactorMethod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (method: TwoFactorMethod | null) => unwrap(setPreferredTwoFactorMethod({ method })),
    onSuccess: (methods: TwoFactorMethods) => {
      queryClient.setQueryData(queryKeys.myTwoFactorMethods, methods);
      queryClient.invalidateQueries({ queryKey: queryKeys.me, exact: true });
    },
  });
}
