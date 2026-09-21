import { Badge } from "@/components/ui/badge";
import type { NotificationPriority } from "@/lib/api/notifications";

export const PRIORITY_LABEL: Record<NotificationPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

export const PRIORITIES = Object.keys(PRIORITY_LABEL) as NotificationPriority[];

const PRIORITY_TONE = { LOW: "neutral", MEDIUM: "neutral", HIGH: "brand", URGENT: "danger" } as const;

export function PriorityBadge({ priority }: { priority: NotificationPriority }) {
  return <Badge tone={PRIORITY_TONE[priority]}>{PRIORITY_LABEL[priority]}</Badge>;
}

/** Small filled dot marking an unread notification. */
export function UnreadDot({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden className={`size-2 shrink-0 rounded-full bg-brand ${className}`} />
  );
}

/**
 * `web_url` comes from the API, so only relative paths and http(s) links are
 * ever rendered as links (never `javascript:` and the like).
 */
export function linkTarget(url: string | null): { href: string; external: boolean } | null {
  if (!url) return null;
  if (url.startsWith("/") && !url.startsWith("//")) return { href: url, external: false };
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? { href: parsed.toString(), external: true } : null;
  } catch {
    return null;
  }
}
