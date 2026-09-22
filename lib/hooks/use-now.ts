"use client";

import { useEffect, useState } from "react";

/** The current time in ms, re-read every `intervalMs` while `active`, so countdowns can render without calling `Date.now()` in render. */
export function useNow(active = true, intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    const interval = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(interval);
  }, [active, intervalMs]);
  return now;
}
