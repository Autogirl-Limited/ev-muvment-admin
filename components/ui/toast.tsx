"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type Tone = "success" | "error" | "info";

interface ToastItem {
  id: number;
  tone: Tone;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const DURATION_MS = 4500;

const TONES: Record<Tone, { ring: string; icon: ReactNode }> = {
  success: {
    ring: "text-success",
    icon: <path d="m5 12 4 4L19 6" />,
  },
  error: {
    ring: "text-danger",
    icon: <path d="M12 8v5m0 3.5v.01M10.3 3.9 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />,
  },
  info: {
    ring: "text-brand",
    icon: <path d="M12 8v.01M12 12v5m9-5a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
  },
};

/**
 * Transient confirmations ("Vehicle created"). Rendered in the top layer via
 * the Popover API so a toast is never hidden behind an open <dialog>.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const layer = useRef<HTMLDivElement>(null);

  const dismiss = useCallback((id: number) => setItems((current) => current.filter((item) => item.id !== id)), []);

  const push = useCallback(
    (tone: Tone, message: string) => {
      const id = (nextId.current += 1);
      setItems((current) => [...current.slice(-3), { id, tone, message }]);
      window.setTimeout(() => dismiss(id), DURATION_MS);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push("success", message),
      error: (message) => push("error", message),
      info: (message) => push("info", message),
    }),
    [push],
  );

  // Re-showing the popover moves it above any dialog opened since the last toast.
  useEffect(() => {
    const element = layer.current;
    if (!element || typeof element.showPopover !== "function") return;
    try {
      if (element.matches(":popover-open")) element.hidePopover();
      if (items.length > 0) element.showPopover();
    } catch {
      // Popover unsupported: toasts still render inline.
    }
  }, [items]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        ref={layer}
        popover="manual"
        aria-live="polite"
        className="[&:not(:popover-open)]:hidden pointer-events-none fixed inset-x-0 bottom-0 top-auto m-0 flex h-auto w-full flex-col items-center gap-2 overflow-visible border-0 bg-transparent p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-end sm:p-6"
      >
        {items.map((item) => (
          <div
            key={item.id}
            role={item.tone === "error" ? "alert" : "status"}
            className="pointer-events-auto flex w-full max-w-sm animate-pop-in items-start gap-3 rounded-xl border border-border bg-surface p-3.5 text-sm text-foreground shadow-card"
          >
            <svg viewBox="0 0 24 24" className={`mt-0.5 size-5 shrink-0 ${TONES[item.tone].ring}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {TONES[item.tone].icon}
            </svg>
            <p className="min-w-0 flex-1 break-words">{item.message}</p>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              aria-label="Dismiss"
              className="-m-1 flex size-7 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-subtle hover:text-foreground"
            >
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside <ToastProvider>.");
  return api;
}
