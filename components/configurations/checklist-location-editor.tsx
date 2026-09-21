"use client";

import { useRef, useState } from "react";

import { Icon } from "@/components/dashboard/screen-kit";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { useDebounced } from "@/lib/hooks/use-debounced";
import {
  DEFAULT_RADIUS,
  MAX_RADIUS,
  MIN_RADIUS,
  PHASE_LABEL,
  emptyLocation,
  parseNumber,
  type FormErrors,
  type LocationForm,
  type Phase,
} from "@/lib/checklist-form";

interface GeocodeResult {
  display_name: string;
  lat: string;
  lon: string;
}

interface Props {
  phase: Phase;
  value: LocationForm | null;
  onChange: (next: LocationForm | null) => void;
  errors: FormErrors;
}

const PAIR = /^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/;

/** OpenStreetMap embed centred on the pin, sized to the radius so the geofence area is in view. */
function mapUrl(latitude: number, longitude: number, radius: number) {
  const latDelta = Math.max(radius * 2.5, 300) / 111_320;
  const lonDelta = latDelta / Math.max(Math.cos((latitude * Math.PI) / 180), 0.01);
  const bbox = [longitude - lonDelta, latitude - latDelta, longitude + lonDelta, latitude + latDelta].map((n) => n.toFixed(6)).join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latitude},${longitude}`;
}

export function ChecklistLocationEditor({ phase, value, onChange, errors }: Props) {
  const label = PHASE_LABEL[phase];
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const latitude = value ? parseNumber(value.latitude) : null;
  const longitude = value ? parseNumber(value.longitude) : null;
  const radius = value ? (parseNumber(value.radius) ?? DEFAULT_RADIUS) : DEFAULT_RADIUS;
  const validPin = latitude !== null && longitude !== null && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
  // Reload the map only once typing pauses.
  const mapSrc = useDebounced(validPin ? mapUrl(latitude, longitude, radius) : null, 600);

  const patch = (changes: Partial<LocationForm>) => value && onChange({ ...value, ...changes });

  const search = async () => {
    const text = query.trim();
    if (!text) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setSearching(true);
    setNotice(null);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(text)}`,
        { signal: controller.signal, headers: { Accept: "application/json" } },
      );
      if (!response.ok) throw new Error("search failed");
      const found = (await response.json()) as GeocodeResult[];
      setResults(found);
      if (found.length === 0) setNotice("No places found. Try a nearby landmark, or enter the coordinates below.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setResults(null);
      setNotice("Address search isn't available right now. You can still enter the coordinates yourself.");
    } finally {
      if (abort.current === controller) setSearching(false);
    }
  };

  const choose = (result: GeocodeResult) => {
    onChange({
      ...(value ?? emptyLocation()),
      address: result.display_name.slice(0, 255),
      latitude: Number(result.lat).toFixed(6),
      longitude: Number(result.lon).toFixed(6),
    });
    setResults(null);
    setQuery("");
  };

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) return setNotice("This browser can't share your location.");
    setLocating(true);
    setNotice(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocating(false);
        onChange({
          ...(value ?? emptyLocation()),
          latitude: coords.latitude.toFixed(6),
          longitude: coords.longitude.toFixed(6),
        });
      },
      () => {
        setLocating(false);
        setNotice("Couldn't get your location. Check the browser's location permission.");
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  if (!value) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border bg-subtle/40 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Icon name="mapPin" className="mt-0.5 size-5 shrink-0 text-muted" />
          <div>
            <p className="text-sm font-medium">No location for {label.toLowerCase()}</p>
            <p className="text-xs text-muted">Drivers are not geofenced. They can start from anywhere.</p>
          </div>
        </div>
        <Button variant="secondary" onClick={() => onChange(emptyLocation())} className="w-full sm:w-auto">
          <Icon name="plus" className="size-4" />
          Set a location
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{label} location</p>
          <p className="text-xs text-muted">Drivers must be within the radius to start this checklist.</p>
        </div>
        <Button variant="ghost" onClick={() => onChange(null)} className="-mr-2 h-9 shrink-0 text-danger hover:bg-danger-soft hover:text-danger">
          <Icon name="trash" className="size-4" />
          Remove
        </Button>
      </div>

      <div className="space-y-2">
        <label htmlFor={`${phase}-search`} className="block text-sm font-medium">Find a place</label>
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              id={`${phase}-search`}
              value={query}
              onChange={(event) => setQuery(event.target.value.slice(0, 200))}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  search();
                }
              }}
              placeholder="Search an address or landmark"
              autoComplete="off"
              className="h-10 w-full rounded-lg border border-input bg-surface pl-9 pr-3 text-sm outline-none transition placeholder:text-muted/60 pointer-coarse:h-11 pointer-coarse:text-base focus:border-brand focus:ring-3 focus:ring-brand/20"
            />
          </div>
          <Button variant="secondary" onClick={search} loading={searching} disabled={!query.trim()}>Search</Button>
        </div>
        {results && results.length > 0 && (
          <ul className="animate-fade-in divide-y divide-border overflow-hidden rounded-xl border border-border">
            {results.map((result) => (
              <li key={`${result.lat},${result.lon},${result.display_name}`}>
                <button type="button" onClick={() => choose(result)} className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left text-sm transition hover:bg-subtle">
                  <Icon name="mapPin" className="mt-0.5 size-4 shrink-0 text-muted" />
                  <span className="min-w-0 break-words">{result.display_name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <button type="button" onClick={useMyLocation} disabled={locating} className="inline-flex items-center gap-1.5 rounded-md py-1 text-xs font-medium text-brand hover:underline disabled:opacity-60 pointer-coarse:py-2">
          <Icon name="crosshair" className="size-3.5" />
          {locating ? "Locating..." : "Use my current location"}
        </button>
        {notice && <Alert tone="info">{notice}</Alert>}
      </div>

      <Field
        label="Address shown to drivers"
        value={value.address}
        onChange={(event) => patch({ address: event.target.value })}
        error={errors[`${phase}.address`]}
        hint="Edit freely. It isn't checked against the pin."
        maxLength={255}
        autoComplete="off"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Latitude"
          inputMode="decimal"
          value={value.latitude}
          onChange={(event) => {
            const text = event.target.value;
            const pair = PAIR.exec(text);
            // Pasting "6.5244, 3.3792" from a map fills both boxes.
            if (pair) patch({ latitude: pair[1], longitude: pair[2] });
            else patch({ latitude: text });
          }}
          error={errors[`${phase}.latitude`]}
          placeholder="6.5244"
          autoComplete="off"
        />
        <Field
          label="Longitude"
          inputMode="decimal"
          value={value.longitude}
          onChange={(event) => patch({ longitude: event.target.value })}
          error={errors[`${phase}.longitude`]}
          placeholder="3.3792"
          autoComplete="off"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-end justify-between gap-3">
          <label htmlFor={`${phase}-radius`} className="block text-sm font-medium">Allowed radius</label>
          <div className="flex items-center gap-1.5">
            <input
              id={`${phase}-radius`}
              inputMode="numeric"
              value={value.radius}
              onChange={(event) => patch({ radius: event.target.value.replace(/[^\d]/g, "").slice(0, 4) })}
              aria-invalid={errors[`${phase}.radius`] ? true : undefined}
              className={`h-9 w-20 rounded-lg border bg-surface px-2 text-right text-sm tabular-nums outline-none focus:border-brand focus:ring-3 focus:ring-brand/20 pointer-coarse:h-11 pointer-coarse:text-base ${errors[`${phase}.radius`] ? "border-danger" : "border-input"}`}
            />
            <span className="text-sm text-muted">m</span>
          </div>
        </div>
        <input
          type="range"
          aria-label={`${label} radius in metres`}
          min={MIN_RADIUS}
          max={MAX_RADIUS}
          step={10}
          value={Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, radius))}
          onChange={(event) => patch({ radius: event.target.value })}
          className="h-6 w-full cursor-pointer accent-[var(--brand)]"
        />
        <div className="flex justify-between text-xs text-muted">
          <span>{MIN_RADIUS} m</span>
          <span>{MAX_RADIUS.toLocaleString("en-NG")} m</span>
        </div>
        {errors[`${phase}.radius`] && <p className="text-xs text-danger">{errors[`${phase}.radius`]}</p>}
      </div>

      {validPin && mapSrc ? (
        <div className="space-y-1.5">
          <div className="overflow-hidden rounded-xl border border-border bg-subtle">
            <iframe
              key={mapSrc}
              title={`${label} location on a map`}
              src={mapSrc}
              loading="lazy"
              referrerPolicy="no-referrer"
              className="block h-52 w-full sm:h-64"
            />
          </div>
          <p className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <span>Pin at {latitude?.toFixed(5)}, {longitude?.toFixed(5)}, within {radius.toLocaleString("en-NG")} m</span>
            <a
              href={`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
            >
              Open larger map
              <Icon name="external" className="size-3.5" />
            </a>
          </p>
        </div>
      ) : (
        <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted">
          Search a place or enter coordinates to preview the map
        </div>
      )}
    </div>
  );
}
