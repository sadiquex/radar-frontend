import { data } from "./data";
import type { LatLng } from "./geo";

// A scripted convoy so a single person can see the whole experience — members
// spread out, pull ahead, fall behind, and arrive. Purely a frontend showcase;
// it writes through the same data layer as real members.
//
// Against a real backend these are `demo-*` participants, which only the trip's
// creator may create or move. The server enforces both.
const CAST = [
  { id: "demo-kofi", name: "Kofi", f: 0.22, speed: 0.055 }, // pulls ahead
  { id: "demo-esi", name: "Esi", f: 0.16, speed: 0.04 }, // travels with the group
  { id: "demo-yaw", name: "Yaw", f: 0.04, speed: 0.022 }, // trails behind
];

// Slower than the original 2.5s: three writes a tick over the network is real
// traffic, and the group view only needs to look alive, not busy.
const STEP_MS = 4_000;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function startDemoConvoy({
  tripId,
  origin,
  destination,
}: {
  tripId: string;
  origin: LatLng;
  destination: LatLng | null;
}): () => void {
  // If the trip has no destination, head ~5.5km north so movement is meaningful.
  const dest = destination ?? { lat: origin.lat + 0.05, lng: origin.lng };
  const movers = CAST.map((c) => ({ ...c }));

  let stopped = false;
  let ticking = false;

  const step = async () => {
    // A slow network must not let ticks pile up on each other.
    if (stopped || ticking) return;
    ticking = true;
    try {
      for (const m of movers) {
        if (stopped) return;
        m.f = Math.min(1, m.f + m.speed * (0.7 + Math.random() * 0.6));
        const jitter = (Math.random() - 0.5) * 0.0006; // ~±30m so pins don't overlap
        await data.updatePosition(tripId, m.id, {
          lat: lerp(origin.lat, dest.lat, m.f) + jitter,
          lng: lerp(origin.lng, dest.lng, m.f) + jitter,
        });
      }
    } catch {
      // A showcase: a dropped write is not worth interrupting the trip for.
    } finally {
      ticking = false;
    }
  };

  // The members have to exist before they can be moved.
  void (async () => {
    try {
      for (const m of movers) {
        if (stopped) return;
        await data.joinTrip(tripId, m.id, m.name);
      }
      await step();
    } catch {
      /* as above */
    }
  })();

  const handle = setInterval(() => void step(), STEP_MS);
  return () => {
    stopped = true;
    clearInterval(handle);
  };
}
