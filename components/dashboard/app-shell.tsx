"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import type { NavIcon, NavSection } from "@/lib/navigation";

interface AppShellProps {
  sections: NavSection[];
  user: { name: string; email: string | null; roleLabel: string };
  children: ReactNode;
}

const ICONS: Record<NavIcon, ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
    </>
  ),
  security: (
    <>
      <path d="M12 3 4 6v6c0 4.5 3.2 8 8 9 4.8-1 8-4.5 8-9V6l-8-3Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
};

function Icon({ name, className = "size-5" }: { name: NavIcon; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {ICONS[name]}
    </svg>
  );
}

function Navigation({ sections, onNavigate }: { sections: NavSection[]; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="flex-1 space-y-6 overflow-y-auto overscroll-contain px-3 py-4">
      {sections.map((section, index) => (
        <div key={section.title ?? index}>
          {section.title && (
            <p className="mb-1.5 px-3 text-xs font-medium uppercase tracking-wider text-muted">
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
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition pointer-coarse:py-3 pointer-coarse:text-base ${
                      active
                        ? "bg-brand-soft text-brand"
                        : "text-muted hover:bg-subtle hover:text-foreground"
                    }`}
                  >
                    <Icon name={item.icon} />
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
}

function Drawer({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Rotating a phone or resizing to desktop makes the drawer pointless.
  useEffect(() => {
    if (!open) return;
    const media = window.matchMedia("(min-width: 1024px)");
    const onChange = () => media.matches && onClose();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [open, onClose]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      aria-label="Navigation menu"
      className="m-0 mr-auto h-dvh max-h-none w-[min(18rem,85vw)] max-w-none overflow-hidden border-r border-border bg-surface p-0 text-foreground shadow-card backdrop:bg-black/60 open:flex open:animate-slide-in-left open:flex-col lg:hidden"
    >
      {children}
    </dialog>
  );
}

function UserMenu({ user }: { user: AppShellProps["user"] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-1 text-left transition hover:bg-subtle sm:rounded-lg sm:pr-3"
      >
        <span
          aria-hidden
          className="flex size-9 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand"
        >
          {user.name.charAt(0).toUpperCase()}
        </span>
        <span className="hidden min-w-0 sm:block">
          <span className="block max-w-40 truncate text-sm font-medium leading-tight">{user.name}</span>
          <span className="block max-w-40 truncate text-xs leading-tight text-muted">{user.roleLabel}</span>
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-[min(16rem,calc(100vw-2rem))] animate-pop-in rounded-xl border border-border bg-surface p-2 shadow-card"
        >
          <div className="border-b border-border px-3 pb-2.5 pt-1.5">
            <p className="truncate text-sm font-medium">{user.name}</p>
            {user.email && <p className="truncate text-xs text-muted">{user.email}</p>}
            <p className="mt-1.5 inline-block rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand">
              {user.roleLabel}
            </p>
          </div>
          <div className="pt-2">
            <SignOutButton>Sign out</SignOutButton>
          </div>
        </div>
      )}
    </div>
  );
}

export function AppShell({ sections, user, children }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = () => setDrawerOpen(false);

  const brand = (
    <div className="flex h-14 shrink-0 items-center border-b border-border px-5">
      <Logo />
    </div>
  );

  return (
    <div className="flex min-h-dvh flex-1">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-brand-foreground"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-surface lg:flex">
        {brand}
        <Navigation sections={sections} />
      </aside>

      {/* Mobile / tablet drawer */}
      <Drawer open={drawerOpen} onClose={closeDrawer}>
        {brand}
        <Navigation sections={sections} onNavigate={closeDrawer} />
      </Drawer>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 items-center justify-between gap-3 border-b border-border bg-background/85 px-3 pt-[env(safe-area-inset-top)] backdrop-blur sm:px-6">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setDrawerOpen(true)}
            className="flex size-10 items-center justify-center rounded-lg text-muted transition hover:bg-subtle hover:text-foreground lg:hidden"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="hidden lg:block" />

          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <UserMenu user={user} />
          </div>
        </header>

        <main
          id="main"
          tabIndex={-1}
          className="mx-auto w-full max-w-[90rem] flex-1 px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-6 outline-none sm:px-6 lg:px-8 lg:pt-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
