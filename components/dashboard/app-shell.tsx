"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import type { NavSection } from "@/lib/navigation";

interface AppShellProps {
  sections: NavSection[];
  user: { name: string; email: string | null; roleLabel: string };
  children: ReactNode;
}

export function AppShell({ sections, user, children }: AppShellProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerPath, setDrawerPath] = useState<string | null>(null);

  // The mobile drawer closes itself after navigating.
  const drawerOpen = drawerPath === pathname;

  const nav = (
    <nav aria-label="Main" className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
      {sections.map((section, index) => (
        <div key={section.title ?? index}>
          {section.title && (
            <p className="mb-1.5 px-3 text-xs font-medium uppercase tracking-wide text-muted">
              {section.title}
            </p>
          )}
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`block rounded-lg px-3 py-2 text-sm font-medium transition ${
                      active
                        ? "bg-brand-soft text-brand"
                        : "text-muted hover:bg-background hover:text-foreground"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const brand = (
    <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border px-5">
      <span
        aria-hidden
        className="flex size-8 items-center justify-center rounded-lg bg-brand font-bold text-brand-foreground"
      >
        E
      </span>
      <span className="font-semibold tracking-tight">EV Muvment</span>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-1">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface md:flex">
        {brand}
        {nav}
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setDrawerPath(null)}
            className="absolute inset-0 bg-black/50"
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-surface shadow-xl">
            {brand}
            {nav}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-4 sm:px-6">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setDrawerPath(pathname)}
            className="-ml-2 rounded-lg p-2 text-muted hover:bg-background hover:text-foreground md:hidden"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="hidden md:block" />

          <div className="relative">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-background"
            >
              <span
                aria-hidden
                className="flex size-8 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand"
              >
                {user.name.charAt(0).toUpperCase()}
              </span>
              <span className="hidden sm:block">
                <span className="block text-sm font-medium leading-tight">{user.name}</span>
                <span className="block text-xs leading-tight text-muted">{user.roleLabel}</span>
              </span>
            </button>

            {menuOpen && (
              <>
                <button
                  type="button"
                  aria-label="Close user menu"
                  onClick={() => setMenuOpen(false)}
                  className="fixed inset-0 z-10 cursor-default"
                />
                <div
                  role="menu"
                  className="absolute right-0 z-20 mt-2 w-60 rounded-xl border border-border bg-surface p-2 shadow-lg"
                >
                  <div className="border-b border-border px-3 pb-2 pt-1">
                    <p className="truncate text-sm font-medium">{user.name}</p>
                    {user.email && <p className="truncate text-xs text-muted">{user.email}</p>}
                  </div>
                  <div className="pt-2">
                    <SignOutButton>Sign out</SignOutButton>
                  </div>
                </div>
              </>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
