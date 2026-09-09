import type { LiveTripEntry, TripPulse } from "./data/history";
import type { StatusKey } from "./types";

/**
 * Turning a list of live trips into something a screen can rank and draw.
 *
 * Extracted rather than left in the component because this repo's vitest runs
 * in node with no DOM and silently does not collect `.test.tsx` — logic inside
 * a component is logic with no test.
 */

/**
 * Stopped is first because it is the only status that means somebody may need
 * help. Arrived is last because it needs nothing.
 */
export const ATTENTION_ORDER: readonly StatusKey[] = [
  "stopped", "behind", "ahead", "with", "arrived",
];

/** Unlocated sorts below every known status: nothing is known to rank on. */
const attentionRank = (worst: StatusKey | null): number => {
  const i = worst === null ? -1 : ATTENTION_ORDER.indexOf(worst);
  return i === -1 ? ATTENTION_ORDER.length : i;
};

/** Worst status first, then soonest to expire. Returns a new array. */
export function rankTrips(trips: LiveTripEntry[]): LiveTripEntry[] {
  return [...trips].sort((a, b) => {
    const byAttention =
      attentionRank(a.pulse?.worst ?? null) - attentionRank(b.pulse?.worst ?? null);
    if (byAttention !== 0) return byAttention;
    return a.expiresAt - b.expiresAt;
  });
}

export interface Contact {
  tripId: string;
  /** 0 at the centre (arrived), 1 on the outer ring (furthest out). */
  radius: number;
  /** Radians. Encodes nothing; it only has to be stable. */
  angle: number;
  status: StatusKey | null;
  memberCount: number;
  /** False when nobody has reported a position — drawn as an outlined slot. */
  located: boolean;
}

/**
 * FNV-1a, for a stable angle per trip.
 *
 * `useLiveTrips` refetches every 30 seconds and the list order changes as
 * statuses do, so an angle derived from an index would move a contact on every
 * poll — movement that did not happen. Derived from the id, it never moves.
 */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

export function contactsFor(trips: LiveTripEntry[]): Contact[] {
  const distances = trips
    .map((t) => t.pulse?.kmLeftMax ?? null)
    .filter((km): km is number => km !== null);
  // Guard the all-arrived case: every distance is 0 and the scale collapses.
  const furthest = Math.max(0, ...distances);

  return trips.map((t) => {
    const km = t.pulse?.kmLeftMax ?? null;
    // No pulse, or no destination to measure against: park it on the rim
    // rather than imply it is nearly done.
    const radius = km === null || furthest === 0 ? (km === 0 ? 0 : 1) : km / furthest;

    return {
      tripId: t.tripId,
      radius,
      angle: (hash(t.tripId) / 0xffffffff) * Math.PI * 2,
      status: t.pulse?.worst ?? null,
      memberCount: t.memberCount,
      located: t.pulse !== null,
    };
  });
}

/**
 * The pulse as a sentence.
 *
 * Every card says this next to its colour. Five statuses tuned to pass AA on
 * one ground sit in a narrow luminance band, so they collide in greyscale and
 * for colourblind users — the same argument the STATUS map in Radar.tsx makes
 * for pairing every colour with a glyph.
 */
export function pulseWords(pulse: TripPulse | null): string {
  if (pulse === null) return "Nobody located yet";
  if (pulse.stopped > 0) return `${pulse.stopped} stopped`;
  if (pulse.moving === 0 && pulse.arrived > 0) return "Everyone arrived";
  if (pulse.worst === "behind") return "Someone behind";
  if (pulse.worst === "ahead") return "Someone ahead";
  return "Everyone with the group";
}
