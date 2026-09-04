// Every timestamp the app holds — lastSeenAt, lastMovedAt, expiresAt — now comes
// from the server. The status engine and "last ping" do arithmetic against
// "now", so "now" has to mean the server's now, not this device's.
//
// Without this, a phone whose clock runs ten minutes fast decides the entire
// group has been stationary for over five minutes and shows everyone as
// "stopped". That was invisible while both sides of the subtraction came from
// the same browser clock.

// Latency alone puts a sample a few hundred milliseconds out, and chasing that
// would rewrite the offset on every poll for nothing: the thresholds this feeds
// are five minutes and whole seconds.
const IGNORE_BELOW_MS = 1_000;

export interface Clock {
  now: () => number;
  record: (serverNow: number) => void;
  offsetMs: () => number;
}

export function createClock(localNow: () => number = Date.now): Clock {
  let offset = 0;

  return {
    now: () => localNow() + offset,
    offsetMs: () => offset,
    record(serverNow: number) {
      if (typeof serverNow !== "number" || !Number.isFinite(serverNow)) return;
      const sample = serverNow - localNow();
      if (Math.abs(sample) < IGNORE_BELOW_MS) {
        offset = 0;
        return;
      }
      offset = sample;
    },
  };
}

// One shared clock: the data layer records samples, the screens read `serverNow`.
const shared = createClock();

export const serverNow = shared.now;
export const recordServerTime = shared.record;
export const clockOffsetMs = shared.offsetMs;
