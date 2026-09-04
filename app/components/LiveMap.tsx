"use client";

import { useEffect, useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MlMap, Marker as MlMarker, StyleSpecification } from "maplibre-gl";

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  color: string;
  /** Text colour for the initial — avatar fills differ per theme. */
  ink: string;
  label: string;
  you?: boolean;
}

// Free OpenStreetMap raster tiles — fine for a frontend prototype. Swap for a
// keyed vector provider before production traffic.
const OSM_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

function pinEl(color: string, ink: string, label: string, ring: boolean): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText = `width:34px;height:34px;border-radius:999px;background:${color};color:${ink};
    display:grid;place-items:center;font:600 15px var(--font-display),sans-serif;
    box-shadow:0 2px 8px rgba(0,0,0,.35)${ring ? ",0 0 0 2px var(--c-text)" : ""};cursor:default;`;
  el.textContent = label;
  return el;
}

function flagEl(): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText = `width:36px;height:36px;border-radius:999px;background:var(--c-arrived);
    display:grid;place-items:center;box-shadow:0 0 0 6px var(--c-arrived-soft);color:var(--c-ground);`;
  el.innerHTML =
    '<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>';
  return el;
}

export function LiveMap({
  markers,
  destination,
  className,
  onPick,
}: {
  markers: MapMarker[];
  destination?: { lat: number; lng: number } | null;
  className?: string;
  onPick?: (pos: { lat: number; lng: number }) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markerRefs = useRef<MlMarker[]>([]);
  const readyRef = useRef(false);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    let MlNS: typeof import("maplibre-gl");

    (async () => {
      MlNS = await import("maplibre-gl");
      if (cancelled || !containerRef.current) return;

      const start = markers[0] ?? destination ?? { lat: 5.6037, lng: -0.187 };
      const map = new MlNS.Map({
        container: containerRef.current,
        style: OSM_STYLE,
        center: [start.lng, start.lat],
        zoom: 12,
        attributionControl: { compact: true },
      });
      mapRef.current = map;
      map.on("load", () => {
        readyRef.current = true;
        sync();
      });
      if (onPickRef.current) {
        map.on("click", (e) => onPickRef.current?.({ lat: e.lngLat.lat, lng: e.lngLat.lng }));
        map.getCanvas().style.cursor = "crosshair";
      }
    })();

    return () => {
      cancelled = true;
      markerRefs.current.forEach((m) => m.remove());
      markerRefs.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render markers + keep everything in view whenever inputs change.
  function sync() {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    import("maplibre-gl").then((MlNS) => {
      markerRefs.current.forEach((m) => m.remove());
      markerRefs.current = [];

      for (const mk of markers) {
        const marker = new MlNS.Marker({ element: pinEl(mk.color, mk.ink, mk.label, !!mk.you) })
          .setLngLat([mk.lng, mk.lat])
          .addTo(map);
        markerRefs.current.push(marker);
      }
      if (destination) {
        markerRefs.current.push(
          new MlNS.Marker({ element: flagEl() }).setLngLat([destination.lng, destination.lat]).addTo(map)
        );
      }

      const pts = [...markers.map((m) => [m.lng, m.lat] as [number, number])];
      if (destination) pts.push([destination.lng, destination.lat]);
      if (pts.length === 1) {
        map.easeTo({ center: pts[0], zoom: Math.max(map.getZoom(), 13), duration: 600 });
      } else if (pts.length > 1) {
        const b = pts.reduce(
          (acc, p) => acc.extend(p),
          new MlNS.LngLatBounds(pts[0], pts[0])
        );
        map.fitBounds(b, { padding: 60, maxZoom: 15, duration: 600 });
      }
    });
  }

  useEffect(() => {
    sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers, destination]);

  return <div ref={containerRef} className={className} style={{ width: "100%", height: "100%" }} />;
}
