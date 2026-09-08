/**
 * How much a repair point can be believed, and how to say so in one phrase.
 *
 * This module exists because of one product decision: **a point is never
 * hidden or demoted automatically.** Nothing decays out of the list, and only
 * an admin removes anything. That makes the age of the last confirmation the
 * whole of the quality signal, so it has to be legible on the row itself —
 * buried in a detail sheet it would never be read by the person it protects,
 * who is standing at the roadside deciding whether to ride two kilometres to
 * a shop that may have closed last year.
 *
 * Two independent axes, deliberately:
 *   - `freshness` — how long since anyone vouched for it
 *   - `unconfirmed` — whether anyone ever has
 * A point added yesterday by one stranger is fresh *and* unconfirmed, and the
 * rider deserves to know both.
 */

import type { RepairPoint } from "./types";

export type Freshness = "fresh" | "aging" | "stale";

const DAY = 86_400_000;

/** Inside this, a point reads as current with no caveat. */
export const AGING_AFTER_DAYS = 60;
/** Past this, the row carries an explicit warning — but still appears. */
export const STALE_AFTER_DAYS = 180;

export interface Trust {
  freshness: Freshness;
  /** Nobody has confirmed it since it was added. It rests on one stranger's word. */
  unconfirmed: boolean;
  /** The signal as a rider reads it, e.g. "Confirmed 3 weeks ago". */
  label: string;
  /** Whole days since the last confirmation, or since it was added. */
  ageDays: number;
}

// Hand-rolled rather than toLocaleDateString: the label is rendered on the
// server and again on the client, and a server running a different locale
// would produce two different strings for one point — a hydration mismatch
// that React resolves by throwing the server's document away.
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function monthYear(at: number): string {
  const d = new Date(at);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * "today" / "yesterday" / "5 days ago" / "3 weeks ago" / "7 months ago".
 *
 * Coarsens as it goes back, because precision that far out is false comfort:
 * the difference between 190 and 197 days changes nothing a rider would do.
 */
export function agoPhrase(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 61) {
    const weeks = Math.round(days / 7);
    return `${weeks} weeks ago`;
  }
  const months = Math.round(days / 30);
  return `${months} months ago`;
}

export function trustOf(point: RepairPoint, now: number): Trust {
  const since = point.confirmedAt ?? point.addedAt;
  const ageDays = Math.max(0, Math.floor((now - since) / DAY));

  const freshness: Freshness =
    ageDays >= STALE_AFTER_DAYS
      ? "stale"
      : ageDays >= AGING_AFTER_DAYS
        ? "aging"
        : "fresh";

  const unconfirmed = point.confirmedAt === null;

  // Order matters. "Never confirmed" is the stronger caveat and outranks a
  // date, because a rider who reads "not confirmed since Mar 2026" reasonably
  // infers somebody once did.
  const label = unconfirmed
    ? `Never confirmed · added ${agoPhrase(ageDays)}`
    : freshness === "stale"
      ? `Not confirmed since ${monthYear(since)}`
      : `Confirmed ${agoPhrase(ageDays)}`;

  return { freshness, unconfirmed, label, ageDays };
}
