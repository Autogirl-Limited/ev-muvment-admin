"use client";

import Link from "next/link";
import { useId, type ReactNode } from "react";

/** Inline SVG icon set for the configuration screens (stroke icons, 24px grid). */
const PATHS = {
  plus: <path d="M12 5v14M5 12h14" />,
  pencil: <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Zm9-13 4 4" />,
  trash: <path d="M4 7h16M10 11v6m4-6v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  refresh: <path d="M20 11a8 8 0 0 0-14.9-3M4 5v4h4M4 13a8 8 0 0 0 14.9 3M20 19v-4h-4" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
    </>
  ),
  userMinus: (
    <>
      <circle cx="10" cy="8" r="4" />
      <path d="M2 21c0-4 3.6-7 8-7 1.3 0 2.5.3 3.6.8M16 17h6" />
    </>
  ),
  swap: <path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4m4 4H7" />,
  arrowLeft: <path d="M19 12H5m6-6-6 6 6 6" />,
  arrowRight: <path d="M5 12h14m-6-6 6 6-6 6" />,
  car: (
    <>
      <path d="M5 16 6.5 10a2 2 0 0 1 1.9-1.5h7.2A2 2 0 0 1 17.5 10L19 16" />
      <path d="M3 16h18v3a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-1H7v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3Z" />
      <circle cx="7.5" cy="13" r=".6" />
      <circle cx="16.5" cy="13" r=".6" />
    </>
  ),
  tag: (
    <>
      <path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9Z" />
      <circle cx="8" cy="8" r="1.4" />
    </>
  ),
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z" />
    </>
  ),
  info: <path d="M12 8v.01M12 12v5m9-5a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  filter: <path d="M4 5h16l-6 8v6l-4-2v-4L4 5Z" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  arrowUp: <path d="M12 19V5m-6 6 6-6 6 6" />,
  arrowDown: <path d="M12 5v14m-6-6 6 6 6-6" />,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "size-5" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {PATHS[name]}
    </svg>
  );
}

/** Optional back-link, title, description and an actions slot that wraps on narrow screens. */
export function ConfigPageHeader({
  title,
  description,
  icon,
  actions,
  showBackLink = true,
}: {
  title: string;
  description?: ReactNode;
  icon: IconName;
  actions?: ReactNode;
  /** Link back to the Configurations hub. Off for top-level screens such as Fleet vehicles. */
  showBackLink?: boolean;
}) {
  return (
    <header className="mb-6 space-y-4">
      {showBackLink && (
        <Link
          href="/configurations"
          className="inline-flex items-center gap-1.5 rounded-md py-1 text-sm font-medium text-muted transition hover:text-foreground pointer-coarse:py-2"
        >
          <Icon name="arrowLeft" className="size-4" />
          Configurations
        </Link>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3.5">
          <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
            <Icon name={icon} className="size-6" />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end [&>*]:flex-1 sm:[&>*]:flex-none">{actions}</div>}
      </div>
    </header>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  label = "Search",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label?: string;
}) {
  const id = useId();
  return (
    <div className="relative min-w-0">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value.slice(0, 200))}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-input bg-surface pl-9 pr-3 text-sm outline-none transition placeholder:text-muted/60 pointer-coarse:h-11 pointer-coarse:text-base focus:border-brand focus:ring-3 focus:ring-brand/20"
      />
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon: IconName;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span aria-hidden className="flex size-12 items-center justify-center rounded-full bg-subtle text-muted">
        <Icon name={icon} className="size-6" />
      </span>
      <h3 className="mt-4 text-base font-semibold">{title}</h3>
      {children && <p className="mt-1 max-w-sm text-sm text-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Square icon-only button with a tooltip and a comfortable touch target. */
export function IconButton({
  label,
  icon,
  onClick,
  disabled,
  tone = "default",
}: {
  label: string;
  icon: IconName;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`inline-flex size-9 items-center justify-center rounded-lg text-muted transition focus-visible:outline-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-40 pointer-coarse:size-11 ${
        tone === "danger" ? "hover:bg-danger-soft hover:text-danger" : "hover:bg-subtle hover:text-foreground"
      }`}
    >
      <Icon name={icon} className="size-[1.125rem]" />
    </button>
  );
}

export function SkeletonRows({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div role="status" aria-label="Loading" className="animate-pulse divide-y divide-border">
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="flex items-center gap-4 px-4 py-4">
          {Array.from({ length: columns }).map((__, cell) => (
            <div key={cell} className={`h-4 rounded bg-subtle ${cell === 0 ? "w-1/4" : "w-1/6"} ${cell > 2 ? "hidden md:block" : ""}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span aria-hidden className="flex size-12 items-center justify-center rounded-full bg-danger-soft text-danger">
        <Icon name="info" className="size-6" />
      </span>
      <h3 className="mt-4 text-base font-semibold">Couldn&apos;t load this</h3>
      <p className="mt-1 max-w-sm text-sm text-muted">{message}</p>
      <button type="button" onClick={onRetry} className="mt-5 inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium transition hover:bg-subtle">
        Try again
      </button>
    </div>
  );
}
