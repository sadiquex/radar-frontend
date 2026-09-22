// Relative, like every other module under lib/. This file is imported by a
// vitest test and vitest.config.ts declares no `@/` alias, so an alias here
// would resolve under Next and fail under the test runner.
import { haversineMeters, type LatLng } from "../geo";
import type { Participant } from "../types";

/**
 * A scripted convoy for the landing page, and nothing else.
 *
 * The page does not describe what Radar decides — it runs the real engine over
 * these coordinates and prints the answer. So this module's only job is to put
 * four riders somewhere defensible on a road at a given tick; every status and
 * every headline on the page comes from `computeStatuses` and `computeVerdict`
 * reading the output of this file.
 *
 * Positions are authored as **metres still to run**, not as latitudes. That is
 * the quantity `computeStatuses` actually measures — distance to the
 * destination, and separation between riders — so authoring in it means the
 * thresholds in `lib/status.ts` (100 m arrive, 100 m cluster, 150 m
 * ahead/behind margin) can be reasoned about directly while writing the script,
 * instead of being an emergent property of some latitudes.
 *
 * Pure and clock-free: `now` is passed in, the way `HomeDashboard` passes it
 * down, so every value on one paint agrees and the script is testable.
 */

/** Akosombo, as in the launch video. The name is what the verdict speaks. */
export const CONVOY_DESTINATION = { name: "Akosombo", lat: 6.3, lng: 0.05 };

/** Tema, roughly — the far end of the road. Only its direction matters. */
const ORIGIN: LatLng = { lat: 5.67, lng: -0.02 };

const DEST: LatLng = { lat: CONVOY_DESTINATION.lat, lng: CONVOY_DESTINATION.lng };

/** Measured, not asserted, so the interpolation below cannot drift from reality. */
const ROUTE_M = haversineMeters(ORIGIN, DEST);

/**
 * The viewer, who is deliberately **not** one of the riders.
 *
 * `computeVerdict` measures the named rider against the viewer when the viewer
 * has a position, and labels the metric "KM BEHIND YOU". A stranger reading a
 * landing page is not in this convoy: an unlisted id restores "KM BEHIND THE
 * GROUP", keeps a fictional "You" row out of the roster, and makes the `isSelf`
 * branches unreachable so nothing can tell a visitor they have fallen behind.
 */
export const VIEWER_ID = "landing-viewer";

const TRIP_ID = "landing-demo";

/** Metres still to run, per rider, at a keyframe. Interpolated between. */
interface Frame {
  t: number;
  ama: number;
  kofi: number;
  yaw: number;
  esi: number;
}

/**
 * The script. Three beats, each held long enough to read, with the gaps between
 * keyframes doing the travelling.
 *
 * Beat 1 (t 0–~38) — Ama is adrift. She has no neighbour inside the 100 m
 *   cluster radius, and sits more than 150 m beyond the median, so she reads
 *   `behind` while the other three read `with`.
 * Beat 2 (t ~39–62) — she closes up. Every rider is within 100 m of every
 *   other, so all four read `with` and the verdict falls through to
 *   "All together".
 * Beat 3 (t ~63–71) — Kofi crosses the 100 m arrival radius alone. The other
 *   three stay inside 100 m of him, so they stay `with` rather than flickering
 *   to `ahead`, and only Kofi is named.
 */
const FRAMES: Frame[] = [
  { t: 0,  ama: 3400, kofi: 1900, yaw: 1940, esi: 1880 },
  { t: 18, ama: 3020, kofi: 1600, yaw: 1640, esi: 1580 },
  { t: 40, ama: 900,  kofi: 880,  yaw: 920,  esi: 860 },
  { t: 56, ama: 260,  kofi: 200,  yaw: 250,  esi: 255 },
  { t: 64, ama: 180,  kofi: 85,   yaw: 168,  esi: 175 },
  { t: 71, ama: 150,  kofi: 60,   yaw: 140,  esi: 146 },
];

export const CONVOY_TICKS = FRAMES[FRAMES.length - 1].t + 1;

const RIDERS = [
  { id: "demo-ama", displayName: "Ama", key: "ama" },
  { id: "demo-kofi", displayName: "Kofi", key: "kofi" },
  { id: "demo-yaw", displayName: "Yaw", key: "yaw" },
  { id: "demo-esi", displayName: "Esi", key: "esi" },
] as const;

const lerp = (a: number, b: number, f: number) => a + (b - a) * f;

/**
 * A point that many metres short of the destination, along the road.
 *
 * Linear interpolation of latitude and longitude rather than a great-circle
 * walk: over a 70 km leg the two agree to well under a metre, and every
 * threshold this script plays against is 100 m or wider.
 */
function pointAt(metresToGo: number): LatLng {
  const f = metresToGo / ROUTE_M;
  return {
    lat: lerp(DEST.lat, ORIGIN.lat, f),
    lng: lerp(DEST.lng, ORIGIN.lng, f),
  };
}

/** The two keyframes surrounding `tick`, and how far between them it sits. */
function span(tick: number): { from: Frame; to: Frame; f: number } {
  const t = Math.min(Math.max(tick, 0), CONVOY_TICKS - 1);
  let i = 0;
  while (i < FRAMES.length - 2 && FRAMES[i + 1].t <= t) i += 1;
  const from = FRAMES[i];
  const to = FRAMES[i + 1];
  return { from, to, f: (t - from.t) / (to.t - from.t) };
}

/**
 * The convoy at `tick`.
 *
 * `lastMovedAt` is always recent: `isStopped` fires at five minutes without
 * movement, and a rider who goes `stopped` mid-script would hand the page an
 * alarm-toned verdict it never earned.
 */
export function convoyAt(tick: number, now: number): Participant[] {
  const { from, to, f } = span(tick);
  return RIDERS.map((rider) => {
    const pos = pointAt(lerp(from[rider.key], to[rider.key], f));
    return {
      id: rider.id,
      tripId: TRIP_ID,
      displayName: rider.displayName,
      latitude: pos.lat,
      longitude: pos.lng,
      // Status is derived, never stored — the app writes null here too.
      status: null,
      lastMovedAt: now - 1_000,
      lastSeenAt: now - 1_000,
    };
  });
}
