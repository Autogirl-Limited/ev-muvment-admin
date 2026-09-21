export function LogoMark({ className = "size-9" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-[28%] bg-brand text-brand-foreground ${className}`}
    >
      <svg viewBox="0 0 24 24" className="size-[58%]" fill="currentColor">
        <path d="M13.2 2.5 5 13.6h5.4L9.3 21.5l9.2-12.1h-5.6z" />
      </svg>
    </span>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark />
      <span className="text-lg font-semibold tracking-tight">EV Muvment</span>
    </span>
  );
}
