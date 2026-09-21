import { HydrationBoundary, dehydrate } from "@tanstack/react-query";

import { AuthSync } from "@/components/auth/auth-sync";
import { AppShell } from "@/components/dashboard/app-shell";
import { QueryProvider } from "@/components/providers/query-provider";
import { requireUser } from "@/lib/auth/dal";
import { navigationFor } from "@/lib/navigation";
import { getQueryClient } from "@/lib/query/query-client";
import { queryKeys } from "@/lib/query/keys";

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  // Layouts don't re-render on navigation, so this runs once per full load. It
  // guards entry and seeds the client cache with the user we just fetched, so
  // the UI has it immediately and from then on TanStack Query keeps it fresh.
  // Pages that show protected data still check for themselves.
  const user = await requireUser();

  const queryClient = getQueryClient();
  queryClient.setQueryData(queryKeys.me, user);

  return (
    <QueryProvider>
      <HydrationBoundary state={dehydrate(queryClient)}>
        <AuthSync />
        <AppShell sections={navigationFor(user.user_type)}>{children}</AppShell>
      </HydrationBoundary>
    </QueryProvider>
  );
}
