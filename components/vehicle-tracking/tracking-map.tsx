"use client";

import { useEffect, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";

export interface TrackingMapPoint {
  id: string;
  latitude: number;
  longitude: number;
  label: string;
  tone?: "online" | "ack" | "offline" | "route";
}

interface MapsApi {
  Map: new (node: HTMLElement, options: Record<string, unknown>) => MapsMap;
  Marker: new (options: Record<string, unknown>) => { addListener: (name: string, callback: () => void) => void; setMap: (map: null) => void };
  Polyline: new (options: Record<string, unknown>) => { setMap: (map: null) => void };
  LatLngBounds: new () => { extend: (point: { lat: number; lng: number }) => void };
}

interface MapsMap {
  fitBounds: (bounds: unknown, padding?: number) => void;
  setCenter: (point: { lat: number; lng: number }) => void;
  setZoom: (zoom: number) => void;
}

declare global {
  interface Window {
    google?: { maps: MapsApi };
  }
}

let mapsPromise: Promise<MapsApi> | null = null;

function loadMaps() {
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (mapsPromise) return mapsPromise;
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key || key === "changeme") return Promise.reject(new Error("Google Maps is not configured."));

  mapsPromise = new Promise<MapsApi>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-ev-google-maps]");
    const script = existing ?? document.createElement("script");
    const onLoad = () => window.google?.maps ? resolve(window.google.maps) : reject(new Error("Google Maps did not load."));
    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", () => reject(new Error("Google Maps is unavailable.")), { once: true });
    if (!existing) {
      script.dataset.evGoogleMaps = "true";
      script.async = true;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly`;
      document.head.appendChild(script);
    }
  });
  return mapsPromise;
}

const COLORS = { online: "#16a34a", ack: "#d97706", offline: "#64748b", route: "#2563eb" } as const;

export function TrackingMap({ points, route = [], onSelect }: { points: TrackingMapPoint[]; route?: TrackingMapPoint[]; onSelect?: (id: string) => void }) {
  const node = useRef<HTMLDivElement>(null);
  const map = useRef<MapsMap | null>(null);
  const overlays = useRef<Array<{ setMap: (map: null) => void }>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadMaps()
      .then((api) => {
        if (cancelled || !node.current) return;
        if (!map.current) {
          map.current = new api.Map(node.current, {
            center: { lat: 9.082, lng: 8.6753 },
            zoom: 6,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: true,
            clickableIcons: false,
          });
        }
        overlays.current.forEach((overlay) => overlay.setMap(null));
        overlays.current = [];
        const bounds = new api.LatLngBounds();
        const allPoints = route.length > 0 ? route : points;
        allPoints.forEach((point) => bounds.extend({ lat: point.latitude, lng: point.longitude }));

        points.forEach((point) => {
          const marker = new api.Marker({
            map: map.current,
            position: { lat: point.latitude, lng: point.longitude },
            title: point.label,
            icon: {
              path: "M12 2C7.6 2 4 5.6 4 10c0 5.8 8 12 8 12s8-6.2 8-12c0-4.4-3.6-8-8-8zm0 11a3 3 0 110-6 3 3 0 010 6z",
              fillColor: COLORS[point.tone ?? "offline"],
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 1.5,
              scale: 1.35,
              anchor: { x: 12, y: 22 },
            },
          });
          marker.addListener("click", () => onSelect?.(point.id));
          overlays.current.push(marker);
        });

        if (route.length > 1) {
          const line = new api.Polyline({
            map: map.current,
            path: route.map((point) => ({ lat: point.latitude, lng: point.longitude })),
            geodesic: true,
            strokeColor: COLORS.route,
            strokeOpacity: 0.9,
            strokeWeight: 4,
          });
          overlays.current.push(line);
        }
        if (allPoints.length === 1) {
          map.current.setCenter({ lat: allPoints[0].latitude, lng: allPoints[0].longitude });
          map.current.setZoom(15);
        } else if (allPoints.length > 1) {
          map.current.fitBounds(bounds, 56);
        }
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Map unavailable."));
    return () => { cancelled = true; };
  }, [onSelect, points, route]);

  if (error) return <div className="flex min-h-96 items-center justify-center bg-subtle/40 p-6"><Alert tone="error">{error} Live vehicle data remains available in the list.</Alert></div>;
  return <div ref={node} className="min-h-[28rem] w-full bg-subtle" aria-label="Vehicle tracking map" />;
}
