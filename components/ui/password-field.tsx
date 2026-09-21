"use client";

import { useState, type InputHTMLAttributes } from "react";

import { Field } from "./field";

interface PasswordFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "type"> {
  label: string;
  error?: string;
  hint?: string;
  /** Show a live strength meter (for fields where the user *sets* a password). */
  showStrength?: boolean;
}

const LEVELS = [
  { label: "Too short", color: "bg-danger" },
  { label: "Weak", color: "bg-danger" },
  { label: "Fair", color: "bg-amber-500" },
  { label: "Good", color: "bg-brand" },
  { label: "Strong", color: "bg-brand" },
];

/** Guidance only: the API accepts any 8–128 character password. */
function strength(password: string): number {
  if (password.length < 8) return 0;
  let score = 1;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score++;
  return Math.min(score, 4);
}

export function PasswordField({ showStrength, ...props }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const value = typeof props.value === "string" ? props.value : "";
  const level = strength(value);

  return (
    <Field
      {...props}
      type={visible ? "text" : "password"}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          className="rounded-md px-2.5 py-1.5 text-xs font-medium text-muted transition hover:text-foreground pointer-coarse:py-2.5 pointer-coarse:text-sm"
        >
          {visible ? "Hide" : "Show"}
        </button>
      }
      footer={
        showStrength && value ? (
          <div className="flex items-center gap-2 pt-0.5" aria-live="polite">
            <div className="flex flex-1 gap-1" aria-hidden>
              {[1, 2, 3, 4].map((step) => (
                <span
                  key={step}
                  className={`h-1 flex-1 rounded-full transition-colors ${
                    step <= level ? LEVELS[level].color : "bg-border"
                  }`}
                />
              ))}
            </div>
            <span className="w-14 text-right text-xs text-muted">{LEVELS[level].label}</span>
          </div>
        ) : undefined
      }
    />
  );
}
