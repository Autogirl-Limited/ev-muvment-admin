import type { Metadata } from "next";
import Link from "next/link";

import { LogoMark } from "@/components/brand/logo";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <LogoMark className="size-12" />
      <div className="space-y-2">
        <p className="text-sm font-medium text-brand">404</p>
        <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
          We couldn&apos;t find that page
        </h1>
        <p className="mx-auto max-w-sm text-pretty text-sm text-muted sm:text-base">
          It may have moved, or the link might be wrong.
        </p>
      </div>
      <Link
        href="/dashboard"
        className="inline-flex h-10 items-center rounded-lg bg-brand px-4 text-sm font-medium text-brand-foreground transition hover:brightness-110 pointer-coarse:h-11 pointer-coarse:text-base"
      >
        Back to dashboard
      </Link>
    </main>
  );
}
