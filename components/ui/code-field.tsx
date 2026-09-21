"use client";

import { useId } from "react";

interface CodeFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Called once the code reaches `length` digits (typed or pasted). */
  onComplete?: (value: string) => void;
  length?: number;
  error?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}

/** One-time-code input: numeric keypad, digits only, paste- and autofill-friendly. */
export function CodeField({
  label,
  value,
  onChange,
  onComplete,
  length = 6,
  error,
  disabled,
  autoFocus,
}: CodeFieldProps) {
  const id = useId();

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        value={value}
        disabled={disabled}
        autoFocus={autoFocus}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={length}
        placeholder={"•".repeat(length)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => {
          const next = event.target.value.replace(/\D/g, "").slice(0, length);
          onChange(next);
          if (next.length === length) onComplete?.(next);
        }}
        className={`h-12 w-full rounded-lg border bg-surface text-center font-mono text-2xl tracking-[0.5em] outline-none transition placeholder:text-muted/40 focus:border-brand focus:ring-2 focus:ring-brand/25 disabled:opacity-60 ${
          error ? "border-danger" : "border-border"
        }`}
      />
      {error && (
        <p id={`${id}-error`} className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
