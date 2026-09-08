import type { StatusKey } from "./types";
import type { Finisher, TripEntry } from "./data/history";

/**
 * View-model logic for the trip history screens.
 *
 * Pure, and here rather than inside a component, for the reason everything
 * pure in this app is: Vitest runs in the node environment with no DOM, so
 * anything embedded in a `.tsx` file is untestable until somebody changes the
 * test config. Grouping, formatting and the outcome verdict are exactly the
 * parts worth testing.
 */

/** What a trip is called when nobody named it. */
export const UNTITLED = "Untitled trip";

export const tripTitle = (entry: TripEntry): string => entry.name?.trim() || UNTITLED;

/**
 * How a finished trip went, for the one-glyph summary in a list row.
 *
 * Reuses the app's existing status vocabulary rather than inventing a second
 * one: `STATUS[key].glyph` is how meaning is carried everywhere else, and a
 * separate set of history icons would be a regression in a design that
 * deliberately does not rely on colour.
 *
 *  - `arrived`  everybody who finished got there
 *  - `behind`   somebody did not
 *  - `stopped`  there was no destination, so there is nothing to report
 */
export function outcomeOf(entry: TripEntry): StatusKey | null {
  if (entry.kind !== "past") return null;
  if (entry.finishers.length === 0) return null;
  // A trip with no destination has null arrival for everyone: unknowable, and
  // rendering it as failure would be a claim nobody made.
  if (entry.finishers.every((f) => f.arrived === null)) return "stopped";
  return entry.finishers.every((f) => f.arrived === true) ? "arrived" : "behind";
}

/** "3 of 4 arrived", or null when the trip had no destination to arrive at. */
export function arrivalSummary(finishers: Finisher[]): string | null {
  const answerable = finishers.filter((f) => f.arrived !== null);
  if (answerable.length === 0) return null;
  const got = answerable.filter((f) => f.arrived === true).length;
  return got === answerable.length
    ? `Everyone arrived`
    : `${got} of ${answerable.length} arrived`;
}

/**
 * How long the trip ran, at the coarsest honest resolution.
 *
 * Minutes below an hour, then hours and minutes. Never seconds: the timestamps
 * come from a trip's creation and expiry, and a figure like "2h 14m 08s"
 * implies a precision that neither of them has.
 */
export function formatDuration(fromMs: number, toMs: number): string {
  const totalMinutes = Math.max(0, Math.round((toMs - fromMs) / 60_000));
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

/** How long a live trip has left, for the resume card. */
export function formatRemaining(expiresAtMs: number, nowMs: number): string {
  const minutes = Math.max(0, Math.round((expiresAtMs - nowMs) / 60_000));
  if (minutes === 0) return "expiring";
  if (minutes < 60) return `${minutes} min left`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h left`;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "12 Sep" for this year, "12 Sep 2025" otherwise. */
export function formatDay(atMs: number, nowMs: number): string {
  const at = new Date(atMs);
  const short = MONTHS[at.getMonth()]!.slice(0, 3);
  const sameYear = at.getFullYear() === new Date(nowMs).getFullYear();
  return sameYear
    ? `${at.getDate()} ${short}`
    : `${at.getDate()} ${short} ${at.getFullYear()}`;
}

export interface TripGroup {
  /** "September" this year, "September 2025" otherwise. */
  heading: string;
  trips: TripEntry[];
}

const startedAt = (entry: TripEntry): number => entry.startedAt;

/**
 * Groups history by the month a trip started, preserving the server's order.
 *
 * The server returns newest first and the screen renders in that order, so
 * this walks the list and cuts a new group whenever the month changes rather
 * than bucketing and re-sorting — which would silently reorder a page whose
 * ordering the cursor depends on.
 *
 * Live trips are excluded: they belong in their own section at the top of the
 * screen, not filed under the month they happen to have started in.
 */
export function groupByMonth(trips: TripEntry[], nowMs: number): TripGroup[] {
  const thisYear = new Date(nowMs).getFullYear();
  const groups: TripGroup[] = [];

  for (const trip of trips) {
    if (trip.kind === "live") continue;
    const at = new Date(startedAt(trip));
    const heading =
      at.getFullYear() === thisYear
        ? MONTHS[at.getMonth()]!
        : `${MONTHS[at.getMonth()]} ${at.getFullYear()}`;

    const last = groups[groups.length - 1];
    if (last !== undefined && last.heading === heading) last.trips.push(trip);
    else groups.push({ heading, trips: [trip] });
  }

  return groups;
}

/** The live trips in a history page, which the Trips screen shows above the rest. */
export const liveOnly = (trips: TripEntry[]) =>
  trips.filter((t): t is Extract<TripEntry, { kind: "live" }> => t.kind === "live");
