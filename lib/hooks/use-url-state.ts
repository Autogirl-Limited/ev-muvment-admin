"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useDebounced } from "@/lib/hooks/use-debounced";

/**
 * List state (page, filters, tab) that lives in the URL, so views survive a
 * refresh and can be shared. Empty values are dropped from the query string.
 * Setting any key other than `page` resets to page 1.
 */
export function useUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const get = useCallback((key: string) => searchParams.get(key) ?? "", [searchParams]);

  const set = useCallback(
    (updates: Record<string, string | number | null | undefined>) => {
      const next = new URLSearchParams(searchParams.toString());
      let resetPage = false;
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === undefined || value === "" || (key === "page" && Number(value) <= 1)) {
          next.delete(key);
        } else {
          next.set(key, String(value));
        }
        if (key !== "page") resetPage = true;
      });
      if (resetPage && !("page" in updates)) next.delete("page");
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  return useMemo(() => ({ get, set, page }), [get, set, page]);
}

/**
 * A search box whose committed value lives in the URL. `text` is the live
 * input buffer; the URL (and so the query) only updates once typing pauses.
 */
export function useSearchState(url: ReturnType<typeof useUrlState>, key = "q") {
  const [text, setText] = useState(() => url.get(key));
  const debounced = useDebounced(text);
  const latest = useRef(url);
  useEffect(() => {
    latest.current = url;
  });
  useEffect(() => {
    if (debounced !== latest.current.get(key)) latest.current.set({ [key]: debounced.trim() });
  }, [debounced, key]);
  return { text, setText, committed: url.get(key) };
}
