"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** `lg` suits forms and detail views; `md` (default) suits confirmations. */
  size?: "md" | "lg";
}

/** Thin wrapper over the native <dialog>: focus trapping and Esc come for free. */
export function Modal({ open, onClose, title, children, size = "md" }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby={titleId}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      // Short screens (landscape phones): cap the height and scroll inside.
      className={`m-auto max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] ${size === "lg" ? "max-w-2xl" : "max-w-md"} overflow-y-auto overscroll-contain rounded-2xl border border-border bg-surface p-0 text-foreground shadow-card backdrop:bg-black/60 backdrop:backdrop-blur-[2px] open:animate-pop-in sm:max-h-[calc(100dvh-3rem)]`}
    >
      {open && (
        <div className="space-y-4 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <h2 id={titleId} className="text-lg font-semibold tracking-tight">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 -mt-1.5 flex size-9 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-subtle hover:text-foreground"
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

/** Button row that stays visible while a tall dialog scrolls (small/short screens). */
export function ModalActions({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 -mx-5 -mb-5 flex justify-end gap-2 border-t border-border bg-surface px-5 py-4 sm:-mx-6 sm:-mb-6 sm:px-6">
      {children}
    </div>
  );
}
