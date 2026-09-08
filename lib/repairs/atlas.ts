/**
 * Filtering, ranking, and the one line at the top of the atlas.
 *
 * Same shape as `lib/verdict.ts` does for the group view, and for the same
 * reason: a rider reads one field, not a list. Here the field is "how far to
 * the nearest thing that can help", because that is the entire question
 * somebody standing over a dead bike is asking.
 *
 * Ranking is by distance alone, and stale points are **not** demoted. That is
 * a consequence of the never-auto-hide rule: quietly sinking an old point down
 * the list is hiding it by another name, and it would leave the rider unable
 * to tell "there is nothing near me" from "there is something near me that we
 * have decided not to show you". The caveat is carried in words on the row
 * instead, where it can be read and overruled.
 */

import { haversineMeters } from "../geo";
import type { RepairCategory, RepairPoint } from "./types";
import { trustOf, type Trust } from "./trust";

export interface RankedPoint {
  point: RepairPoint;
  /** Null when the rider's position is unknown — permission denied, or desktop. */
  meters: number | null;
  trust: Trust;
}

export interface AtlasVerdict {
  eyebrow: string;
  headline: string;
  /** The number, rendered large. Null when there is nothing to measure. */
  metric: string | null;
  metricLabel: string | null;
  /** The caveat under it, when the nearest thing is not to be trusted. */
  caveat: string | null;
}

/** "240 m" under a kilometre, "2.4 km" over it. */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`;
}

export function rank(
  points: RepairPoint[],
  here: { lat: number; lng: number } | null,
  now: number,
  category: RepairCategory | "all",
): RankedPoint[] {
  const kept = category === "all" ? points : points.filter((p) => p.category === category);

  const ranked = kept.map((point) => ({
    point,
    meters: here ? haversineMeters(here, { lat: point.lat, lng: point.lng }) : null,
    trust: trustOf(point, now),
  }));

  // With no position there is no distance to sort on, so fall back to the
  // most recently vouched-for. Alphabetical would be arbitrary and putting the
  // oldest first would be actively unhelpful.
  return ranked.sort((a, b) =>
    a.meters !== null && b.meters !== null
      ? a.meters - b.meters
      : a.trust.ageDays - b.trust.ageDays,
  );
}

export function verdictFor(
  ranked: RankedPoint[],
  category: RepairCategory | "all",
  hasPosition: boolean,
): AtlasVerdict {
  const scope = category === "all" ? "REPAIR POINTS" : `NEARBY · ${category.toUpperCase()}`;

  if (ranked.length === 0) {
    return {
      eyebrow: scope,
      headline: category === "all" ? "Nothing here yet" : "None of those nearby",
      metric: null,
      metricLabel: null,
      caveat:
        category === "all"
          ? "Be the first — add a shop, a mechanic, or a pump you know."
          : "Try another category, or add the one you know about.",
    };
  }

  const nearest = ranked[0];

  if (!hasPosition || nearest.meters === null) {
    return {
      eyebrow: scope,
      headline: `${ranked.length} ${ranked.length === 1 ? "point" : "points"} on the map`,
      metric: null,
      metricLabel: null,
      caveat: "Turn on location to see what's closest to you.",
    };
  }

  return {
    eyebrow: scope,
    headline: "Nearest is",
    metric: formatDistance(nearest.meters),
    metricLabel: nearest.point.name.toUpperCase(),
    // Only speak up when the nearest thing carries a caveat. Repeating
    // "confirmed 3 days ago" at the top when it already sits on the row below
    // would spend the loudest part of the screen on the least surprising fact.
    caveat:
      nearest.trust.freshness === "stale" || nearest.trust.unconfirmed
        ? nearest.trust.label
        : null,
  };
}
