import { haversineMeters, type LatLng } from "./geo";
import type { Participant, StatusKey } from "./types";

export interface MemberStatus {
  status: StatusKey;
  kmLeft: number;
}

// Tunable thresholds. Conservative defaults that read well on a city/intercity scale.
//
// CLUSTER_RADIUS_M, AHEAD_BEHIND_MARGIN_M and STOPPED_MS are exported (not
// module-private) so `lib/__tests__/contract.test.ts` can pin them
// numerically against contract.json, the same way
// `backend/src/domain/status.test.ts` pins its ported copy. A behavioural
// pin alone does not discriminate finely enough here: sweeping these values
// still passes the shared status goldens across most of their plausible
// range, so the numeric assertion is what actually catches drift.
// ARRIVE_RADIUS_M stays module-private; it crosses the network boundary
// (the purge sweep derives arrival on the server too), so it is pinned
// behaviourally instead — see the "calls somebody arrived" test below.
const ARRIVE_RADIUS_M = 100; // at the destination
export const CLUSTER_RADIUS_M = 100; // "with group" — near the group's centre
export const AHEAD_BEHIND_MARGIN_M = 150; // how far off the median you must be to count as ahead/behind
export const STOPPED_MS = 5 * 60 * 1000; // no movement for 5 min

interface Located {
  id: string;
  pos: LatLng;
  lastMovedAt: number | null;
}

// "With group" per the PRD: within a defined distance of *most members*. Counting
// neighbours (rather than distance to a mean centroid) stays robust to stragglers.
function nearMajority(m: Located, all: Located[]): boolean {
  const near = all.filter((o) => haversineMeters(m.pos, o.pos) <= CLUSTER_RADIUS_M).length;
  return near > all.length / 2;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const isStopped = (m: Located, now: number) =>
  m.lastMovedAt != null && now - m.lastMovedAt >= STOPPED_MS;

/**
 * Derives each located member's status relative to the group (and destination, if any).
 * Returns a map keyed by participant id; members without a position are omitted.
 *
 * Precedence: arrived > stopped > with group > ahead / behind.
 */
export function computeStatuses(
  participants: Participant[],
  destination: LatLng | null,
  now: number
): Record<string, MemberStatus> {
  const located: Located[] = participants
    .filter((p) => p.latitude != null && p.longitude != null)
    .map((p) => ({
      id: p.id,
      pos: { lat: p.latitude as number, lng: p.longitude as number },
      lastMovedAt: p.lastMovedAt,
    }));

  if (located.length === 0) return {};

  const result: Record<string, MemberStatus> = {};

  if (destination) {
    const distances = new Map(located.map((m) => [m.id, haversineMeters(m.pos, destination)]));
    const med = median([...distances.values()]);

    for (const m of located) {
      const distToDest = distances.get(m.id)!;
      const kmLeft = distToDest / 1000;
      let status: StatusKey;

      if (distToDest <= ARRIVE_RADIUS_M) status = "arrived";
      else if (isStopped(m, now)) status = "stopped";
      else if (nearMajority(m, located)) status = "with";
      else if (distToDest < med - AHEAD_BEHIND_MARGIN_M) status = "ahead";
      else if (distToDest > med + AHEAD_BEHIND_MARGIN_M) status = "behind";
      else status = "with";

      result[m.id] = { status, kmLeft };
    }
    return result;
  }

  // No destination: "ahead/behind" has no reference direction — classify only by
  // whether each member is travelling with the pack or has become separated.
  for (const m of located) {
    let status: StatusKey;
    if (isStopped(m, now)) status = "stopped";
    else if (nearMajority(m, located)) status = "with";
    else status = "behind";
    result[m.id] = { status, kmLeft: 0 };
  }
  return result;
}
