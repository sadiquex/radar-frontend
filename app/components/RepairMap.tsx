"use client";

import { useEffect, useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MlMap, Marker as MlMarker } from "maplibre-gl";
import { OSM_STYLE } from "./LiveMap";
import type { RankedPoint } from "@/lib/repairs/atlas";

/**
 * The atlas map.
 *
 * Separate from `LiveMap` rather than a prop on it, because the two want
 * opposite behaviour in the one place that matters. `LiveMap` re-fits its
 * bounds every time its markers change — correct for a group view, where the
 * whole job is keeping everyone in frame. Here it would be a bug: changing the
 * category filter would rip the map back from wherever the rider had just
 * panned it. This one frames the points once and then leaves the view alone.
 *
 * Pins are drawn as DOM elements rather than a symbol layer so the category
 * icon and the staleness ring can be plain SVG and CSS, and so a tap target
 * can be 40px without a hit-test layer.
 */

/** How many of the nearest points the opening view is framed around. */
const FRAME_POINTS = 4;

/** Inline SVG paths, lifted from the same lucide icons the list rows use. */
const ICON_PATHS: Record<string, string> = {
  shop:
    '<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7"/>',
  mechanic:
    '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  pump:
    '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
  tube:
    '<circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="m9.17 14.83-4.24 4.24"/><circle cx="12" cy="12" r="4"/>',
  water:
    '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
};

function pinEl(rp: RankedPoint, selected: boolean): HTMLDivElement {
  const el = document.createElement("div");
  const stale = rp.trust.freshness === "stale" || rp.trust.unconfirmed;

  // Colour reinforces, it never carries: the staleness is spelled out in words
  // on the row and in the sheet. A dashed ring is the second, non-colour
  // channel here, for the same reason status uses a glyph.
  const ink = stale ? "var(--c-muted)" : "var(--c-ground)";
  const fill = stale ? "var(--c-raised)" : "var(--c-text)";

  el.setAttribute("role", "button");
  el.setAttribute("aria-label", `${rp.point.name}. ${rp.trust.label}`);
  el.style.cssText = `width:36px;height:36px;border-radius:999px;background:${fill};color:${ink};
    display:grid;place-items:center;cursor:pointer;
    border:${stale ? "1.5px dashed var(--c-line-strong)" : "1.5px solid transparent"};
    box-shadow:0 2px 8px rgba(0,0,0,.28)${selected ? ",0 0 0 3px var(--c-text)" : ""};
    transition:box-shadow .15s ease;`;
  el.innerHTML = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    ${ICON_PATHS[rp.point.category] ?? ICON_PATHS.mechanic}</svg>`;
  return el;
}

function hereEl(): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText = `width:16px;height:16px;border-radius:999px;background:var(--c-ahead);
    border:2.5px solid var(--c-ground);box-shadow:0 0 0 5px var(--c-ahead-soft);`;
  return el;
}

export function RepairMap({
  ranked,
  here,
  selectedId,
  onSelect,
  className,
}: {
  ranked: RankedPoint[];
  here: { lat: number; lng: number } | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markerRefs = useRef<MlMarker[]>([]);
  const readyRef = useRef(false);
  const framedRef = useRef(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const MlNS = await import("maplibre-gl");
      if (cancelled || !containerRef.current) return;

      const start = here ?? { lat: 5.5713, lng: -0.2 };
      const map = new MlNS.Map({
        container: containerRef.current,
        style: OSM_STYLE,
        center: [start.lng, start.lat],
        zoom: 13,
        attributionControl: { compact: true },
      });
      mapRef.current = map;
      map.on("load", () => {
        readyRef.current = true;
        sync();
      });
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

  function sync() {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;

    void import("maplibre-gl").then((MlNS) => {
      markerRefs.current.forEach((m) => m.remove());
      markerRefs.current = [];

      for (const rp of ranked) {
        const el = pinEl(rp, rp.point.id === selectedId);
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          onSelectRef.current(rp.point.id);
        });
        markerRefs.current.push(
          new MlNS.Marker({ element: el }).setLngLat([rp.point.lng, rp.point.lat]).addTo(map),
        );
      }

      if (here) {
        markerRefs.current.push(
          new MlNS.Marker({ element: hereEl() }).setLngLat([here.lng, here.lat]).addTo(map),
        );
      }

      // Frame once, on the first paint that has something to frame, and never
      // again. Re-fitting on every change is what makes a filterable map
      // unusable — see the note at the top of this file.
      //
      // Framed on the nearest few rather than on everything: fitting all of
      // Greater Accra puts 20km in a 210px strip, which lands every useful pin
      // in one overlapping clump and shows the rider mostly places they cannot
      // reach. The far ones are still there to pan to.
      if (!framedRef.current && ranked.length > 0) {
        framedRef.current = true;
        const pts: [number, number][] = ranked
          .slice(0, FRAME_POINTS)
          .map((r) => [r.point.lng, r.point.lat]);
        if (here) pts.push([here.lng, here.lat]);
        const b = pts.reduce((acc, p) => acc.extend(p), new MlNS.LngLatBounds(pts[0], pts[0]));
        map.fitBounds(b, { padding: 44, maxZoom: 15, duration: 0 });
      }
    });
  }

  useEffect(() => {
    sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ranked, here, selectedId]);

  /** Recentre on a selected point without changing zoom. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;
    const found = ranked.find((r) => r.point.id === selectedId);
    if (found) map.easeTo({ center: [found.point.lng, found.point.lat], duration: 400 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  return <div ref={containerRef} className={className} style={{ width: "100%", height: "100%" }} />;
}
