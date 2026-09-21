import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand text-brand-foreground hover:brightness-110 active:brightness-95",
  secondary: "border border-border bg-surface text-foreground hover:bg-subtle active:bg-subtle",
  danger: "bg-danger text-white hover:brightness-110 active:brightness-95",
  ghost: "text-muted hover:bg-subtle hover:text-foreground",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  fullWidth?: boolean;
}

export function Button({
  variant = "primary",
  loading = false,
  fullWidth = false,
  disabled,
  className = "",
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex h-10 select-none items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition pointer-coarse:h-11 pointer-coarse:text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50 ${
        VARIANTS[variant]
      } ${fullWidth ? "w-full" : ""} ${className}`}
      {...props}
    >
      {loading && (
        <span
          aria-hidden
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
}
