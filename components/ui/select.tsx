"use client";

import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

/** Mirrors the bit of a native change event that callers read. */
export interface SelectChangeEvent {
  target: { value: string; name?: string };
}

interface SelectProps {
  label: string;
  value: string;
  onChange?: (event: SelectChangeEvent) => void;
  /** `<option value disabled>` elements, exactly as with a native select. */
  children: ReactNode;
  name?: string;
  disabled?: boolean;
  error?: string;
  hint?: ReactNode;
  /** Visually hide the label (filters that already have surrounding context). */
  hideLabel?: boolean;
  /** Shown when `value` matches no option. */
  placeholder?: string;
  /** Classes for the trigger button (e.g. `font-mono`). */
  className?: string;
}

interface Option {
  value: string;
  label: string;
  disabled: boolean;
}

interface Placement {
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
}

const MAX_LIST_HEIGHT = 288;
const GAP = 6;
const VIEWPORT_MARGIN = 8;

function textOf(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") return String(child);
      if (isValidElement(child)) return textOf((child.props as { children?: ReactNode }).children);
      return "";
    })
    .join("");
}

function readOptions(children: ReactNode): Option[] {
  const options: Option[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const props = child.props as { value?: string | number; disabled?: boolean; children?: ReactNode };
    if (child.type === Fragment) {
      options.push(...readOptions(props.children));
    } else if (child.type === "option") {
      const label = textOf(props.children);
      options.push({ value: props.value === undefined ? label : String(props.value), label, disabled: Boolean(props.disabled) });
    }
  });
  return options;
}

/**
 * Styled listbox with the same API as a native <select> (`<option>` children,
 * `onChange(event.target.value)`). The list renders in the browser's top layer
 * (Popover API), so it is never clipped by an `overflow-hidden` card or a
 * scrolling modal, and always sits above a modal <dialog>.
 */
export function Select({ label, value, onChange, children, name, disabled, error, hint, hideLabel = false, placeholder = "", className = "" }: SelectProps) {
  const id = useId();
  const listId = `${id}-list`;
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const typeahead = useRef({ text: "", timer: 0 });
  const [expanded, setOpen] = useState(false);
  // A disabled trigger can never show its list, even if it was open when it became disabled.
  const open = expanded && !disabled;
  const [active, setActive] = useState(-1);
  const [placement, setPlacement] = useState<Placement | null>(null);

  const options = readOptions(children);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = options[selectedIndex];

  const place = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - GAP - VIEWPORT_MARGIN;
    const above = rect.top - GAP - VIEWPORT_MARGIN;
    const flip = below < Math.min(MAX_LIST_HEIGHT, options.length * 40 + 8) && above > below;
    setPlacement({
      left: Math.max(VIEWPORT_MARGIN, Math.min(rect.left, window.innerWidth - rect.width - VIEWPORT_MARGIN)),
      width: rect.width,
      maxHeight: Math.min(MAX_LIST_HEIGHT, flip ? above : below),
      ...(flip ? { bottom: window.innerHeight - rect.top + GAP } : { top: rect.bottom + GAP }),
    });
  };

  const openList = () => {
    if (disabled) return;
    place();
    setActive(selectedIndex >= 0 && !options[selectedIndex].disabled ? selectedIndex : options.findIndex((option) => !option.disabled));
    setOpen(true);
  };

  const closeList = () => setOpen(false);

  const commit = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    closeList();
    if (option.value !== value) onChange?.({ target: { value: option.value, name } });
  };

  const step = (from: number, direction: 1 | -1) => {
    for (let next = from + direction; next >= 0 && next < options.length; next += direction) {
      if (!options[next].disabled) return next;
    }
    return from;
  };

  // The list is a manual popover: promoting it to the top layer is what lifts it above modals.
  useLayoutEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (panel && typeof panel.showPopover === "function" && !panel.matches(":popover-open")) panel.showPopover();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) closeList();
    };
    const onReposition = (event: Event) => {
      if (panelRef.current?.contains(event.target as Node)) return;
      place();
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  });

  useEffect(() => {
    if (!open || active < 0) return;
    panelRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const { key } = event;
    if (!open) {
      if (key === "ArrowDown" || key === "ArrowUp" || key === "Enter" || key === " ") {
        event.preventDefault();
        openList();
      }
      return;
    }
    if (key === "Escape") {
      // Keep Esc from also dismissing a surrounding modal <dialog>.
      event.preventDefault();
      event.stopPropagation();
      closeList();
    } else if (key === "ArrowDown") {
      event.preventDefault();
      setActive((current) => step(current, 1));
    } else if (key === "ArrowUp") {
      event.preventDefault();
      setActive((current) => step(current, -1));
    } else if (key === "Home") {
      event.preventDefault();
      setActive(step(-1, 1));
    } else if (key === "End") {
      event.preventDefault();
      setActive(step(options.length, -1));
    } else if (key === "Enter" || key === " ") {
      event.preventDefault();
      commit(active);
    } else if (key === "Tab") {
      closeList();
    } else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const state = typeahead.current;
      window.clearTimeout(state.timer);
      state.text += key.toLowerCase();
      state.timer = window.setTimeout(() => { state.text = ""; }, 600);
      const from = state.text.length > 1 ? active : active + 1;
      const order = options.map((_, offset) => (from + offset) % options.length);
      const match = order.find((index) => !options[index].disabled && options[index].label.toLowerCase().startsWith(state.text));
      if (match !== undefined) setActive(match);
    }
  };

  return (
    <div className="min-w-0 space-y-1.5">
      <label htmlFor={id} className={hideLabel ? "sr-only" : "block text-sm font-medium"}>
        {label}
      </label>
      {name && <input type="hidden" name={name} value={value} />}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? `${id}-option-${active}` : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        disabled={disabled}
        onClick={() => (open ? closeList() : openList())}
        onKeyDown={onKeyDown}
        className={`group relative flex h-10 w-full min-w-0 items-center rounded-lg border bg-surface pl-3 pr-9 text-left text-sm outline-none transition pointer-coarse:h-11 pointer-coarse:text-base hover:border-brand/50 focus:border-brand focus:ring-3 focus:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-input ${
          error ? "border-danger focus:border-danger focus:ring-danger/20" : open ? "border-brand ring-3 ring-brand/20" : "border-input"
        } ${className}`}
      >
        <span className={`truncate ${selected && selected.value !== "" ? "" : "text-muted"}`}>{selected ? selected.label : placeholder}</span>
        <svg
          viewBox="0 0 24 24"
          className={`pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted transition group-hover:text-foreground ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && placement && (
        <div
          ref={panelRef}
          id={listId}
          popover="manual"
          role="listbox"
          aria-label={label}
          style={{ position: "fixed", right: "auto", margin: 0, top: placement.top ?? "auto", bottom: placement.bottom ?? "auto", left: placement.left, width: placement.width, maxHeight: placement.maxHeight }}
          className="overflow-y-auto overscroll-contain rounded-xl border border-border bg-surface p-1 text-sm text-foreground shadow-card"
        >
          {options.length === 0 && <p className="px-3 py-2 text-muted">No options</p>}
          {options.map((option, index) => {
            const isSelected = index === selectedIndex;
            return (
              <div
                key={`${option.value}-${index}`}
                id={`${id}-option-${index}`}
                role="option"
                data-index={index}
                aria-selected={isSelected}
                aria-disabled={option.disabled || undefined}
                // Keep focus on the trigger so keyboard navigation carries on.
                onMouseDown={(event) => event.preventDefault()}
                onMouseMove={() => !option.disabled && active !== index && setActive(index)}
                onClick={() => commit(index)}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 pointer-coarse:py-3 pointer-coarse:text-base ${
                  option.disabled ? "cursor-not-allowed text-muted/60" : index === active ? "bg-subtle" : ""
                } ${isSelected ? "font-semibold text-brand" : ""}`}
              >
                <span className="min-w-0 truncate">{option.label}</span>
                {isSelected && (
                  <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="m5 12 4 4L19 6" />
                  </svg>
                )}
              </div>
            );
          })}
        </div>
      )}

      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
