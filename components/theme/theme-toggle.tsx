"use client";

import { useSyncExternalStore } from "react";

import type { ThemePreference } from "@/lib/theme";
import { readPreference, savePreference, subscribeToPreference } from "@/lib/theme-client";

const OPTIONS: { value: ThemePreference; label: string; icon: React.ReactNode }[] = [
  {
    value: "light",
    label: "Light",
    icon: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </>
    ),
  },
  {
    value: "system",
    label: "System",
    icon: (
      <>
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8M12 16v4" />
      </>
    ),
  },
  {
    value: "dark",
    label: "Dark",
    icon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />,
  },
];

/** Segmented Light / System / Dark control. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  // The server can't know the saved preference; "system" is replaced right
  // after hydration (the page itself is already themed by the inline script).
  const preference = useSyncExternalStore(subscribeToPreference, readPreference, () => "system");

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={`inline-flex items-center gap-0.5 rounded-full border border-border bg-subtle p-0.5 ${className}`}
    >
      {OPTIONS.map((option) => {
        const selected = preference === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.label}
            title={option.label}
            onClick={() => savePreference(option.value)}
            className={`flex size-7 items-center justify-center rounded-full transition pointer-coarse:size-9 ${
              selected
                ? "bg-surface text-foreground shadow-sm ring-1 ring-border"
                : "text-muted hover:text-foreground"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              {option.icon}
            </svg>
          </button>
        );
      })}
    </div>
  );
}
