export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

// Great-circle distance between two coordinates, in metres.
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface WritePolicy {
  minIntervalMs: number;
  minDistanceM: number;
}

// Speed in metres per second from two fixes. Used when the browser does not
// report coords.speed, which is common on desktop and on some Android builds.
export function estimateSpeedMps(
  prev: LatLng | null,
  next: LatLng,
  elapsedMs: number
): number {
  if (!prev || elapsedMs <= 0) return 0;
  return haversineMeters(prev, next) / (elapsedMs / 1000);
}

// The original 20s/30m policy was tuned for driving. A cyclist at 30km/h covers
// 30m in under four seconds, so the group would see a stale position for most
// of the interval. Bounds are half-open: exactly 2 takes the middle row,
// exactly 6 takes the last. Negative or NaN speeds (coords.speed can be both)
// are treated as stationary.
//
// 5s is a floor chosen for a localStorage write. This table is the single
// place to retune write pressure when the Supabase backend lands.
export function writePolicyFor(speedMps: number): WritePolicy {
  const speed = Number.isFinite(speedMps) && speedMps > 0 ? speedMps : 0;
  if (speed < 2) return { minIntervalMs: 20_000, minDistanceM: 30 };
  if (speed < 6) return { minIntervalMs: 10_000, minDistanceM: 25 };
  return { minIntervalMs: 5_000, minDistanceM: 20 };
}

// Battery/network-friendly write policy: write on a steady cadence, or sooner when
// the user has moved a meaningful distance. Passing `speedMps` scales the cadence
// to how fast the user is actually moving; omitting it keeps the original
// 20s/30m behaviour.
export function shouldWritePosition({
  prev,
  next,
  msSinceLastWrite,
  speedMps,
  minIntervalMs,
  minDistanceM,
}: {
  prev: LatLng | null;
  next: LatLng;
  msSinceLastWrite: number;
  speedMps?: number;
  minIntervalMs?: number;
  minDistanceM?: number;
}): boolean {
  if (!prev) return true;
  const policy = speedMps === undefined
    ? { minIntervalMs: 20_000, minDistanceM: 30 }
    : writePolicyFor(speedMps);
  const interval = minIntervalMs ?? policy.minIntervalMs;
  const distance = minDistanceM ?? policy.minDistanceM;
  if (haversineMeters(prev, next) >= distance) return true;
  return msSinceLastWrite >= interval;
}
