import { Button } from "@/components/ui/button";
import type { Pagination as PaginationInfo } from "@/lib/api/staff";

interface PaginationProps {
  pagination: PaginationInfo | undefined;
  onPage: (page: number) => void;
  noun?: string;
}

export function Pagination({ pagination, onPage, noun = "items" }: PaginationProps) {
  if (!pagination) return null;
  const { page, page_size, total_items, total_pages, has_next, has_prev } = pagination;
  const from = total_items === 0 ? 0 : (page - 1) * page_size + 1;
  const to = Math.min(page * page_size, total_items);

  return (
    <div className="flex flex-col gap-3 border-t border-border p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted">
        {total_items === 0 ? `No ${noun}` : `Showing ${from}-${to} of ${total_items} ${noun}`}
      </p>
      {total_pages > 1 && (
        <div className="flex items-center gap-2">
          <Button variant="secondary" disabled={!has_prev} onClick={() => onPage(page - 1)} className="flex-1 sm:flex-none">
            Previous
          </Button>
          <span className="px-2 text-sm tabular-nums text-muted">
            {page} / {total_pages}
          </span>
          <Button variant="secondary" disabled={!has_next} onClick={() => onPage(page + 1)} className="flex-1 sm:flex-none">
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
