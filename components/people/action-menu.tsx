"use client";

import { useEffect, useRef, useState } from "react";

import { Icon, type IconName } from "@/components/dashboard/screen-kit";

export interface MenuAction {
  label: string;
  icon: IconName;
  onSelect: () => void;
  /** When set the item is disabled and this explains why. */
  disabledReason?: string | null;
  tone?: "danger";
}

/** "More actions" dropdown. Disabled items stay visible and say why, rather than silently vanishing. */
export function ActionMenu({ actions, label = "More actions" }: { actions: MenuAction[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
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
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-medium transition hover:bg-subtle pointer-coarse:h-11 pointer-coarse:text-base"
      >
        {label}
        <Icon name="arrowDown" className="size-3.5 text-muted" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-2 w-[min(19rem,calc(100vw-1.5rem))] animate-pop-in rounded-xl border border-border bg-surface p-1.5 shadow-card">
          {actions.map((action) => {
            const disabled = Boolean(action.disabledReason);
            return (
              <button
                key={action.label}
                type="button"
                role="menuitem"
                aria-disabled={disabled || undefined}
                onClick={() => {
                  if (disabled) return;
                  setOpen(false);
                  action.onSelect();
                }}
                className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition pointer-coarse:py-3 ${
                  disabled ? "cursor-not-allowed opacity-60" : action.tone === "danger" ? "text-danger hover:bg-danger-soft" : "hover:bg-subtle"
                }`}
              >
                <Icon name={action.icon} className="mt-0.5 size-4 shrink-0" />
                <span className="min-w-0">
                  <span className="block font-medium">{action.label}</span>
                  {disabled && <span className="mt-0.5 block text-xs font-normal text-muted">{action.disabledReason}</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
