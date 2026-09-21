"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

import { Icon } from "@/components/dashboard/screen-kit";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS } from "@/lib/navigation";
import type { UserType } from "@/lib/api/types";
import { useCurrentUser } from "@/lib/query/user";

export function initials(person: { first_name: string; last_name: string; username: string }) {
  const letters = `${person.first_name.charAt(0)}${person.last_name.charAt(0)}`.trim();
  return (letters || person.username.charAt(0)).toUpperCase();
}

const AVATAR_SIZE = { sm: "size-9 text-sm", md: "size-11 text-base", lg: "size-16 text-2xl" } as const;

export function Avatar({ person, size = "sm" }: { person: { first_name: string; last_name: string; username: string }; size?: keyof typeof AVATAR_SIZE }) {
  return (
    <span aria-hidden className={`flex shrink-0 items-center justify-center rounded-full bg-brand-soft font-semibold text-brand ${AVATAR_SIZE[size]}`}>
      {initials(person)}
    </span>
  );
}

export function ActiveBadge({ active }: { active: boolean }) {
  return <Badge tone={active ? "success" : "danger"} dot>{active ? "Active" : "Inactive"}</Badge>;
}

export function ShiftBadge({ onShift }: { onShift: boolean }) {
  return <Badge tone={onShift ? "brand" : "neutral"} dot={onShift}>{onShift ? "On shift" : "Off shift"}</Badge>;
}

export function RoleBadge({ role }: { role: UserType }) {
  return <Badge tone={role === "ADMIN" ? "brand" : "neutral"}>{ROLE_LABELS[role]}</Badge>;
}

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1400);
        } catch {}
      }}
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-subtle hover:text-foreground"
    >
      <Icon name={copied ? "check" : "copy"} className="size-4" />
    </button>
  );
}

/** A labelled fact: small caption over a value. */
export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium">{children}</dd>
    </div>
  );
}

/** A titled card; `action` sits on the right of the header (usually a "View all" link). */
export function Card({ title, icon, action, children, className = "" }: { title: string; icon?: Parameters<typeof Icon>[0]["name"]; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`overflow-hidden rounded-2xl border border-border bg-surface shadow-card ${className}`}>
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          {icon && <Icon name={icon} className="size-4 text-muted" />}
          {title}
        </h2>
        {action}
      </header>
      {children}
    </section>
  );
}

export function CardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-xs font-medium text-brand transition hover:underline">
      {children}
      <Icon name="arrowRight" className="size-3.5" />
    </Link>
  );
}

/**
 * Links to a driver's page. The users endpoints are admin-only, so for every
 * other role this renders plain text instead of a dead link.
 */
export function DriverLink({ id, children, className = "" }: { id: string; children: ReactNode; className?: string }) {
  const user = useCurrentUser();
  if (user.user_type !== "ADMIN") return <span className={className}>{children}</span>;
  return (
    <Link
      href={`/drivers/${id}`}
      onClick={(event) => event.stopPropagation()}
      className={`rounded-sm transition hover:text-brand hover:underline focus-visible:outline-2 focus-visible:outline-brand ${className}`}
    >
      {children}
    </Link>
  );
}
