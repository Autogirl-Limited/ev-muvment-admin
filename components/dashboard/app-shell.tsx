"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { Logo, LogoMark } from "@/components/brand/logo";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { ROLE_LABELS, type NavIcon, type NavSection } from "@/lib/navigation";
import { useCurrentUser } from "@/lib/query/user";

interface AppShellProps {
  sections: NavSection[];
  children: ReactNode;
  /** Read from a cookie on the server, so the first paint already has the right width. */
  defaultCollapsed?: boolean;
}

const SIDEBAR_COOKIE = "ev-sidebar";

interface UserSummary {
  name: string;
  email: string | null;
  roleLabel: string;
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
  applications: (
    <>
      <path d="M9 3h6l1 2h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h3l1-2Z" />
      <path d="M9 13l2 2 4-5" />
      <path d="M8 8h8" />
    </>
  ),
  fleet: (
    <>
      <path d="M5 16 6.5 10a2 2 0 0 1 1.9-1.5h7.2A2 2 0 0 1 17.5 10L19 16" />
      <path d="M3 16h18v3a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-1H7v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3Z" />
      <circle cx="7.5" cy="13" r=".6" />
      <circle cx="16.5" cy="13" r=".6" />
    </>
  ),
  configurations: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  transactions: (
    <>
      <path d="M4 7h16" />
      <path d="M6 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" />
      <rect x="4" y="7" width="16" height="14" rx="2" />
      <path d="M8 13h8M8 17h5" />
    </>
  ),
  wallet: (
    <>
      <path d="M4 7.5h14a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7.5a2 2 0 0 1 2-2h11" />
      <path d="M16 11h5v5h-5a2.5 2.5 0 0 1 0-5Z" />
      <path d="M7 5.5 14 3" />
      <circle cx="16.5" cy="13.5" r=".7" />
    </>
  ),
  drivers: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.4c2 .7 3.5 2.6 3.5 5.6" />
    </>
  ),
  staff: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <circle cx="12" cy="10" r="2.5" />
      <path d="M8 17c.5-2 2-3 4-3s3.5 1 4 3" />
    </>
  ),
  notifications: (
    <>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </>
  ),
  checklists: (
    <>
      <rect x="6" y="4" width="12" height="17" rx="2" />
      <path d="M9 4h6v3H9z" />
      <path d="m9 13 2 2 4-5" />
      <path d="M9 18h6" />
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

interface Tip {
  label: string;
  top: number;
  left: number;
}

function Navigation({ sections, onNavigate, collapsed = false }: { sections: NavSection[]; onNavigate?: () => void; collapsed?: boolean }) {
  const pathname = usePathname();
  const [tip, setTip] = useState<Tip | null>(null);

  // A native `title` would be clipped by this scrolling list, so the rail draws its own tooltip.
  const showTip = (label: string, element: HTMLElement) => {
    if (!collapsed) return;
    const rect = element.getBoundingClientRect();
    setTip({ label, top: rect.top + rect.height / 2, left: rect.right + 10 });
  };
  const hideTip = () => setTip(null);

  return (
    <nav
      aria-label="Main"
      onScroll={hideTip}
      className={`flex-1 overflow-y-auto overscroll-contain py-4 ${collapsed ? "space-y-3 px-2" : "space-y-6 px-3"}`}
    >
      {tip && collapsed && (
        <span
          role="tooltip"
          style={{ top: tip.top, left: tip.left }}
          className="pointer-events-none fixed z-50 -translate-y-1/2 whitespace-nowrap rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background shadow-card"
        >
          {tip.label}
        </span>
      )}
      {sections.map((section, index) => (
        <div key={section.title ?? index}>
          {section.title && !collapsed && (
            <p className="mb-1.5 px-3 text-xs font-medium uppercase tracking-wider text-muted">
              {section.title}
            </p>
          )}
          {collapsed && index > 0 && <div aria-hidden className="mx-2 mb-3 border-t border-border" />}
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    onPointerEnter={(event) => showTip(item.label, event.currentTarget)}
                    onPointerLeave={hideTip}
                    onFocus={(event) => showTip(item.label, event.currentTarget)}
                    onBlur={hideTip}
                    className={`flex items-center rounded-lg text-sm font-medium transition pointer-coarse:text-base ${
                      collapsed ? "mx-auto size-11 justify-center" : "gap-3 px-3 py-2 pointer-coarse:py-3"
                    } ${
                      active
                        ? "bg-brand-soft text-brand"
                        : "text-muted hover:bg-subtle hover:text-foreground"
                    }`}
                  >
                    <Icon name={item.icon} />
                    {collapsed ? <span className="sr-only">{item.label}</span> : item.label}
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

function UserMenu() {
  const current = useCurrentUser();
  const user: UserSummary = {
    name: `${current.first_name} ${current.last_name}`.trim() || current.username,
    email: current.email,
    roleLabel: ROLE_LABELS[current.user_type],
  };
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

export function AppShell({ sections, children, defaultCollapsed = false }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const closeDrawer = () => setDrawerOpen(false);

  const toggleSidebar = () => {
    const next = !collapsed;
    setCollapsed(next);
    // A cookie (not localStorage) so the server can render the saved width on the next load.
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
  };

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
      {/* Sits above the sticky header (z-30) so the toggle can straddle their corner. */}
      <aside
        className={`sticky top-0 z-40 hidden h-dvh shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200 ease-out motion-reduce:transition-none lg:flex ${
          collapsed ? "w-[4.5rem]" : "w-64"
        }`}
      >
        {collapsed ? (
          <div className="flex h-14 shrink-0 items-center justify-center border-b border-border">
            <LogoMark />
          </div>
        ) : (
          brand
        )}
        <Navigation sections={sections} collapsed={collapsed} />
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          className="absolute -right-3 top-14 z-10 flex size-6 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface text-muted shadow-card transition hover:border-brand hover:text-brand focus-visible:outline-2 focus-visible:outline-brand after:absolute after:-inset-2"
        >
          <svg viewBox="0 0 24 24" className={`size-3.5 transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
      </aside>

      {/* Mobile / tablet drawer */}
      <Drawer open={drawerOpen} onClose={closeDrawer}>
        {brand}
        <Navigation sections={sections} onNavigate={closeDrawer} />
      </Drawer>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 items-center justify-between gap-3 border-b border-border bg-background/85 px-3 pt-[env(safe-area-inset-top)] backdrop-blur sm:px-4 lg:px-6">
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
            <NotificationBell />
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>

        <main
          id="main"
          tabIndex={-1}
          className="w-full flex-1 px-3 pb-[max(2rem,env(safe-area-inset-bottom))] pt-6 outline-none sm:px-4 lg:px-6 lg:pt-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
