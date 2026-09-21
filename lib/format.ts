/** Display helpers shared by the staff screens. Times are shown in Nigeria (Africa/Lagos). */
export const LAGOS = "Africa/Lagos";

export function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: LAGOS }).format(new Date(iso));
}

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeZone: LAGOS }).format(new Date(iso));
}

export function naira(value: number, fractionDigits = 0) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function fullName(person: { first_name: string; last_name: string; username: string }) {
  return `${person.first_name} ${person.last_name}`.trim() || person.username;
}

/** Case-insensitive, whitespace-trimmed equality, used to catch duplicate names before the API does. */
export function sameName(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
