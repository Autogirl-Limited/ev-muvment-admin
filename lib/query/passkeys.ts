"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { listPasskeys, passkeyRegistrationOptions, registerPasskey, removePasskey } from "@/lib/auth/actions";
import { createPasskey, deviceName } from "@/lib/passkey";
import { queryKeys } from "./keys";
import { unwrap } from "./two-factor";

export function useMyPasskeys() {
  return useQuery({
    queryKey: queryKeys.myPasskeys,
    queryFn: () => unwrap(listPasskeys({ origin: window.location.origin })),
    staleTime: 30_000,
  });
}

/** Sets up fingerprint / face sign-in on this device (the device shows its own prompt). */
export function useAddPasskey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { challenge_id, options } = await unwrap(passkeyRegistrationOptions({ origin: window.location.origin }));
      const credential = await createPasskey(options);
      return unwrap(registerPasskey({ challengeId: challenge_id, credential, name: deviceName() }));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.myPasskeys }),
  });
}

export function useRemovePasskey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(removePasskey({ id })),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.myPasskeys }),
  });
}
