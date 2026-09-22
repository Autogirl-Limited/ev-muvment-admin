/** Display helpers shared by the staff screens. Times are shown in Nigeria (Africa/Lagos). */
export const LAGOS = "Africa/Lagos";

export function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: LAGOS }).format(new Date(iso));
}

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeZone: LAGOS }).format(new Date(iso));
}

/** "Just now", "5 min ago", "3 h ago", "2 d ago", then a plain date once it is over a week old. */
export function formatRelative(iso: string, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days} d ago` : formatDate(iso);
}

export function naira(value: number, fractionDigits = 0) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function kwh(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return `${new Intl.NumberFormat("en-NG", { maximumFractionDigits: 2 }).format(value)} kWh`;
}

export function fullName(person: { first_name: string; last_name: string; username: string }) {
  return `${person.first_name} ${person.last_name}`.trim() || person.username;
}

/** Case-insensitive, whitespace-trimmed equality, used to catch duplicate names before the API does. */
export function sameName(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
