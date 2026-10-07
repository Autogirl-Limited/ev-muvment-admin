import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import { listAuthMethodSettings, updateAuthMethodSetting, type AuthMethodSetting } from "@/lib/api/auth-settings";
import type { TwoFactorMethod } from "@/lib/api/types";
import { CACHE } from "@/lib/query/cache";
import { queryKeys } from "@/lib/query/keys";

/** Shared by the Configurations hub card (as a prefetch) and the settings screen. */
export const authMethodSettingsQuery = () =>
  queryOptions({
    queryKey: queryKeys.authMethodSettings,
    queryFn: ({ signal }) => listAuthMethodSettings(signal),
    ...CACHE.settings,
  });

/** Optimistic toggle: the switch flips at once and rolls back if the API refuses. */
export function useToggleAuthMethod() {
  const queryClient = useQueryClient();
  const key = queryKeys.authMethodSettings;

  return useMutation({
    mutationFn: ({ method, isEnabled }: { method: TwoFactorMethod; isEnabled: boolean }) =>
      updateAuthMethodSetting(method, isEnabled),
    onMutate: async ({ method, isEnabled }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const snapshot = queryClient.getQueryData<AuthMethodSetting[]>(key);
      queryClient.setQueryData<AuthMethodSetting[]>(key, (items) =>
        items?.map((item) => (item.method === method ? { ...item, is_enabled: isEnabled } : item)),
      );
      return { snapshot };
    },
    onError: (_error, _vars, context) => {
      if (context?.snapshot) queryClient.setQueryData(key, context.snapshot);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<AuthMethodSetting[]>(key, (items) =>
        items?.map((item) => (item.method === updated.method ? updated : item)),
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
      // The admin's own security screen reads availability too.
      queryClient.invalidateQueries({ queryKey: queryKeys.myTwoFactorMethods });
    },
  });
}
