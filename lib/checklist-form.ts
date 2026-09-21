import type {
  AIProvider,
  ChecklistLocation,
  ChecklistSettings,
  UpdateChecklistSettingsRequest,
  UpdatePhaseSettings,
} from "@/lib/api/checklists-groups";

/**
 * Form model for the checklist settings screen: string-typed inputs, plus the
 * logic that turns them into a minimal PATCH. That body must keep `null`
 * (clear a location / reset the model) and drop only `undefined` (unchanged).
 */

export type Phase = "pick_up" | "drop_off";
export const PHASES: readonly Phase[] = ["pick_up", "drop_off"];
export const PHASE_LABEL: Record<Phase, string> = { pick_up: "Pick-up", drop_off: "Drop-off" };

export const PROVIDER_LABEL: Record<AIProvider, string> = {
  DEEPSEEK: "DeepSeek",
  GEMINI: "Google Gemini",
  OPENAI: "OpenAI",
};

export const AI_MODEL_OPTIONS: Record<AIProvider, readonly string[]> = {
  DEEPSEEK: ["deepseek-chat", "deepseek-reasoner"],
  GEMINI: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
  OPENAI: ["gpt-5", "gpt-5-mini", "gpt-4.1", "gpt-4.1-mini", "gpt-4o", "gpt-4o-mini"],
};

export const MIN_RADIUS = 20;
export const MAX_RADIUS = 5000;
export const DEFAULT_RADIUS = 200;
export const MAX_GRACE = 180;

export interface LocationForm {
  address: string;
  latitude: string;
  longitude: string;
  radius: string;
}

export interface PhaseForm {
  /** "HH:MM" */
  start: string;
  end: string;
  location: LocationForm | null;
}

export interface SettingsForm {
  pick_up: PhaseForm;
  drop_off: PhaseForm;
  grace: string;
  provider: AIProvider;
  model: string;
}

export type FormErrors = Record<string, string>;

/** The API returns "HH:MM:SS"; inputs and comparisons use "HH:MM". */
export const trimSeconds = (time: string) => time.slice(0, 5);

export function emptyLocation(): LocationForm {
  return { address: "", latitude: "", longitude: "", radius: String(DEFAULT_RADIUS) };
}

function locationToForm(location: ChecklistLocation | null): LocationForm | null {
  return location
    ? {
        address: location.address,
        latitude: String(location.latitude),
        longitude: String(location.longitude),
        radius: String(location.radius_meters),
      }
    : null;
}

export function toForm(settings: ChecklistSettings): SettingsForm {
  return {
    pick_up: {
      start: trimSeconds(settings.pick_up.start_time),
      end: trimSeconds(settings.pick_up.end_time),
      location: locationToForm(settings.pick_up.location),
    },
    drop_off: {
      start: trimSeconds(settings.drop_off.start_time),
      end: trimSeconds(settings.drop_off.end_time),
      location: locationToForm(settings.drop_off.location),
    },
    grace: String(settings.grace_minutes),
    provider: settings.ai_provider,
    model: settings.ai_model ?? "",
  };
}

/** A finite number from an input, or null when blank/invalid. */
export function parseNumber(text: string): number | null {
  if (text.trim() === "") return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

const isWholeNumber = (text: string) => /^\d+$/.test(text.trim());

export function validate(form: SettingsForm): FormErrors {
  const errors: FormErrors = {};

  for (const phase of PHASES) {
    const { start, end, location } = form[phase];
    if (!start || !end) errors[`${phase}.window`] = "Set both an opening and a closing time.";
    else if (end <= start) {
      errors[`${phase}.window`] = "The window must close after it opens. Overnight windows aren't supported.";
    }

    if (location) {
      const address = location.address.trim();
      if (!address) errors[`${phase}.address`] = "Add the address drivers will see.";
      else if (address.length > 255) errors[`${phase}.address`] = "Addresses can be at most 255 characters.";

      const latitude = parseNumber(location.latitude);
      if (latitude === null) errors[`${phase}.latitude`] = "Enter a latitude.";
      else if (latitude < -90 || latitude > 90) errors[`${phase}.latitude`] = "Latitude must be between -90 and 90.";

      const longitude = parseNumber(location.longitude);
      if (longitude === null) errors[`${phase}.longitude`] = "Enter a longitude.";
      else if (longitude < -180 || longitude > 180) errors[`${phase}.longitude`] = "Longitude must be between -180 and 180.";

      const radius = parseNumber(location.radius);
      if (radius === null || !Number.isInteger(radius)) errors[`${phase}.radius`] = "Enter a whole number of metres.";
      else if (radius < MIN_RADIUS || radius > MAX_RADIUS) {
        errors[`${phase}.radius`] = `Radius must be between ${MIN_RADIUS} and ${MAX_RADIUS.toLocaleString("en-NG")} m.`;
      }
    }
  }

  if (!isWholeNumber(form.grace) || Number(form.grace) > MAX_GRACE) {
    errors.grace = `Enter a whole number of minutes from 0 to ${MAX_GRACE}.`;
  }
  if (form.model.trim().length > 100) errors.model = "Model names can be at most 100 characters.";

  return errors;
}

function locationChanged(base: ChecklistLocation | null, form: LocationForm | null): boolean {
  if (!base && !form) return false;
  if (!base || !form) return true;
  return (
    form.address.trim() !== base.address ||
    parseNumber(form.latitude) !== base.latitude ||
    parseNumber(form.longitude) !== base.longitude ||
    parseNumber(form.radius) !== base.radius_meters
  );
}

/** Only what differs from the loaded settings. An empty object means "nothing to save". */
export function buildPatch(base: ChecklistSettings, form: SettingsForm): UpdateChecklistSettingsRequest {
  const patch: UpdateChecklistSettingsRequest = {};

  for (const phase of PHASES) {
    const before = base[phase];
    const after = form[phase];
    const change: UpdatePhaseSettings = {};

    if (after.start !== trimSeconds(before.start_time)) change.start_time = after.start;
    if (after.end !== trimSeconds(before.end_time)) change.end_time = after.end;

    if (locationChanged(before.location, after.location)) {
      const location = after.location;
      const latitude = location ? parseNumber(location.latitude) : null;
      const longitude = location ? parseNumber(location.longitude) : null;
      // An object sets, `null` clears. Never omit a null here.
      change.location =
        location && latitude !== null && longitude !== null
          ? {
              address: location.address.trim(),
              latitude,
              longitude,
              // Sent explicitly: clearing a location keeps the old radius server-side.
              radius_meters: parseNumber(location.radius) ?? DEFAULT_RADIUS,
            }
          : null;
    }
    if (Object.keys(change).length) patch[phase] = change;
  }

  if (isWholeNumber(form.grace) && Number(form.grace) !== base.grace_minutes) {
    patch.grace_minutes = Number(form.grace);
  }
  if (form.provider !== base.ai_provider) patch.ai_provider = form.provider;

  const model = form.model.trim() || null; // blank resets to the provider default
  if (model !== base.ai_model) patch.ai_model = model;

  return patch;
}

const window_ = (start: string, end: string) => `${start}–${end}`;

/** Human-readable diff for the confirm dialog. */
export function describeChanges(base: ChecklistSettings, form: SettingsForm): string[] {
  const lines: string[] = [];

  for (const phase of PHASES) {
    const before = base[phase];
    const after = form[phase];
    const label = PHASE_LABEL[phase];

    const oldWindow = window_(trimSeconds(before.start_time), trimSeconds(before.end_time));
    const newWindow = window_(after.start, after.end);
    if (oldWindow !== newWindow) lines.push(`${label} window ${oldWindow} → ${newWindow} (WAT)`);

    if (locationChanged(before.location, after.location)) {
      if (!after.location) lines.push(`${label} location removed. Drivers are no longer checked against a location.`);
      else if (!before.location) lines.push(`${label} location set to ${after.location.address.trim()} (within ${after.location.radius} m)`);
      else lines.push(`${label} location changed to ${after.location.address.trim()} (within ${after.location.radius} m)`);
    }
  }

  if (isWholeNumber(form.grace) && Number(form.grace) !== base.grace_minutes) {
    lines.push(`Grace period ${base.grace_minutes} → ${Number(form.grace)} minutes`);
  }
  if (form.provider !== base.ai_provider) {
    lines.push(`AI provider ${PROVIDER_LABEL[base.ai_provider]} → ${PROVIDER_LABEL[form.provider]}`);
  }
  const model = form.model.trim() || null;
  if (model !== base.ai_model) {
    lines.push(`AI model ${base.ai_model ?? "provider default"} → ${model ?? "provider default"}`);
  }

  return lines;
}

/** Non-blocking heads-ups about a change. `nowLagos` is "HH:MM" in Nigeria time. */
export function warningsFor(base: ChecklistSettings, form: SettingsForm, nowLagos: string): string[] {
  const warnings: string[] = [];

  for (const phase of PHASES) {
    const windowChanged =
      form[phase].start !== trimSeconds(base[phase].start_time) || form[phase].end !== trimSeconds(base[phase].end_time);
    if (windowChanged && form[phase].end && form[phase].end < nowLagos) {
      warnings.push(`This window has already ended today, so drivers won't be able to start today's ${PHASE_LABEL[phase].toLowerCase()} checklist.`);
    }
  }
  if (form.drop_off.start && form.pick_up.end && form.drop_off.start < form.pick_up.end) {
    warnings.push("The drop-off window starts before the pick-up window ends. The two overlap.");
  }
  return warnings;
}
