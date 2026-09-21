import type { Pagination } from "@/lib/api/staff";

/** Client-side paging for lists that are loaded whole. Returns the slice and a `Pagination` for <Pagination />. */
export function paginate<T>(items: T[], page: number, pageSize: number): { slice: T[]; pagination: Pagination } {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(Math.max(1, page), totalPages);
  return {
    slice: items.slice((current - 1) * pageSize, current * pageSize),
    pagination: {
      page: current,
      page_size: pageSize,
      total_items: items.length,
      total_pages: totalPages,
      has_next: current < totalPages,
      has_prev: current > 1,
    },
  };
}
