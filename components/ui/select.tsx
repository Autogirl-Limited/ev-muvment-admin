"use client";

import { useId, type ReactNode, type SelectHTMLAttributes } from "react";

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> {
  label: string;
  error?: string;
  hint?: ReactNode;
  /** Visually hide the label (filters that already have surrounding context). */
  hideLabel?: boolean;
}

/** Native <select>: the best picker on phones, keyboard-accessible everywhere. */
export function Select({ label, error, hint, hideLabel = false, className = "", children, ...props }: SelectProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className="min-w-0 space-y-1.5">
      <label htmlFor={id} className={hideLabel ? "sr-only" : "block text-sm font-medium"}>
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`h-10 w-full min-w-0 appearance-none truncate rounded-lg border bg-surface pl-3 pr-9 text-sm outline-none transition pointer-coarse:h-11 pointer-coarse:text-base focus:border-brand focus:ring-3 focus:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-60 ${
            error ? "border-danger focus:border-danger focus:ring-danger/20" : "border-input"
          } ${className}`}
          {...props}
        >
          {children}
        </select>
        <svg viewBox="0 0 24 24" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
