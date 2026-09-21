import { Suspense, type ReactNode } from "react";

import { ToastProvider } from "@/components/ui/toast";

export default function ConfigurationsLayout({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      {/* Config screens keep list state in the URL (useSearchParams). */}
      <Suspense fallback={<div role="status" aria-label="Loading" className="h-64 animate-pulse rounded-2xl bg-subtle" />}>
        {children}
      </Suspense>
    </ToastProvider>
  );
}
