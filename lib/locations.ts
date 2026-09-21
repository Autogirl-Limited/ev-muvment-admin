/**
 * Suggestions for the free-text vehicle location. The API stores whatever is
 * typed and filters by exact match, so a suggestion list keeps spellings
 * consistent (a stray "Lagoss" would otherwise split the fleet in two).
 */
export const NIGERIAN_LOCATIONS = [
  "Abia", "Abuja", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Calabar",
  "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano",
  "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo",
  "Plateau", "Port Harcourt", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara",
] as const;

/** Suggestions plus any locations already in use, de-duplicated case-insensitively. */
export function locationSuggestions(inUse: string[]): string[] {
  const seen = new Map<string, string>();
  [...inUse, ...NIGERIAN_LOCATIONS].forEach((location) => {
    const key = location.trim().toLowerCase();
    if (key && !seen.has(key)) seen.set(key, location.trim());
  });
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}
