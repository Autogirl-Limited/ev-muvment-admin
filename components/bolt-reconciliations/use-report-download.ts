"use client";

import { useMutation } from "@tanstack/react-query";

import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/browser";
import { getReportDownload } from "@/lib/api/bolt-reconciliations";

/**
 * Fetches a short-lived signed link and hands it to the browser. The link's
 * Content-Disposition saves the file under its original name, so the page
 * stays where it is.
 */
export function useReportDownload() {
  const toast = useToast();
  const mutation = useMutation({
    mutationFn: (id: string) => getReportDownload(id),
    onSuccess: ({ url, file_name }) => {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file_name;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "The file couldn't be downloaded. Please try again."),
  });
  return {
    download: (id: string) => mutation.mutate(id),
    pendingId: mutation.isPending ? mutation.variables : null,
  };
}
