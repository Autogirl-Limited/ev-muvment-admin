"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import type { ReactNode } from "react";

import { getQueryClient } from "@/lib/query/query-client";

export function QueryProvider({ children }: { children: ReactNode }) {
  // Not useState: getQueryClient() is a stable singleton in the browser, and
  // a fresh instance per render on the server.
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* Compiled out of production builds. */}
      <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-right" />
    </QueryClientProvider>
  );
}
