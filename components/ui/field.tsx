"use client";

import { useId, type InputHTMLAttributes, type ReactNode } from "react";

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  error?: string;
  hint?: ReactNode;
  /** Rendered inside the input box, on the right (e.g. a show/hide toggle). */
  trailing?: ReactNode;
  /** Rendered under the input, e.g. a strength meter. */
  footer?: ReactNode;
}

export function Field({ label, error, hint, trailing, footer, className = "", ...props }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          // 16px on touch devices stops iOS from zooming the page on focus.
          className={`h-10 w-full min-w-0 rounded-lg border bg-surface px-3 text-sm outline-none transition placeholder:text-muted/60 pointer-coarse:h-11 pointer-coarse:text-base focus:border-brand focus:ring-3 focus:ring-brand/20 disabled:opacity-60 read-only:bg-subtle read-only:text-muted ${
            error ? "border-danger focus:border-danger focus:ring-danger/20" : "border-input"
          } ${trailing ? "pr-16" : ""} ${className}`}
          {...props}
        />
        {trailing && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-1.5">{trailing}</div>
        )}
      </div>
      {footer}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
