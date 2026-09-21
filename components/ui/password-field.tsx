"use client";

import { useState, type InputHTMLAttributes } from "react";

import { Field } from "./field";

interface PasswordFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "type"> {
  label: string;
  error?: string;
  hint?: string;
}

export function PasswordField(props: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <Field
      {...props}
      type={visible ? "text" : "password"}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          className="rounded px-2 py-1 text-xs font-medium text-muted hover:text-foreground"
        >
          {visible ? "Hide" : "Show"}
        </button>
      }
    />
  );
}
