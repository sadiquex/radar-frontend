import { describe, it, expect } from "vitest";
// Relative, not `@/` — vitest.config.ts declares no alias and every existing
// test under lib/ imports relatively. An `@/` here fails to resolve at runtime.
import { convoyAt, CONVOY_DESTINATION, CONVOY_TICKS, VIEWER_ID } from "../convoy";
import { computeStatuses } from "../../status";
import { computeVerdict, type Verdict } from "../../verdict";

const NOW = 1_700_000_000_000;

/** The landing page's own pipeline, run here exactly as the component runs it. */
function verdictAt(tick: number): Verdict {
  const participants = convoyAt(tick, NOW);
  const statuses = computeStatuses(
    participants,
    { lat: CONVOY_DESTINATION.lat, lng: CONVOY_DESTINATION.lng },
    NOW
  );
  return computeVerdict({
    participants,
    statuses,
    selfId: VIEWER_ID,
    destinationName: CONVOY_DESTINATION.name,
    now: NOW,
  });
}

const everyTick = [...Array(CONVOY_TICKS).keys()];

describe("the landing convoy", () => {
  it("puts four riders on the road at every tick, none of them the viewer", () => {
    for (const t of everyTick) {
      const riders = convoyAt(t, NOW);
      expect(riders, `tick ${t}`).toHaveLength(4);
      expect(riders.map((r) => r.id)).not.toContain(VIEWER_ID);
      // computeStatuses drops unlocated members, and a dropped member is an
      // empty roster row on a public page.
      for (const r of riders) {
        expect(r.latitude, `tick ${t}, ${r.displayName}`).not.toBeNull();
        expect(r.longitude, `tick ${t}, ${r.displayName}`).not.toBeNull();
      }
    }
  });

  it("is deterministic", () => {
    expect(convoyAt(20, NOW)).toEqual(convoyAt(20, NOW));
  });

  it("never shows a blank or waiting card", () => {
    for (const t of everyTick) {
      const v = verdictAt(t);
      expect(v.headline, `tick ${t}`).not.toBe("");
      // "Waiting for locations" / "Just you so far" are correct in the app and
      // nonsense on a landing page.
      expect(v.tone, `tick ${t}`).not.toBe("waiting");
    }
  });

  it("nobody is ever stopped — the script would have to stand a rider still", () => {
    for (const t of everyTick) {
      expect(verdictAt(t).status, `tick ${t}`).not.toBe("stopped");
    }
  });

  it("plays the three beats, in order", () => {
    const behind = everyTick.filter((t) => verdictAt(t).status === "behind");
    const together = everyTick.filter((t) => verdictAt(t).eyebrow === "ALL GOOD");
    const arrived = everyTick.filter((t) => verdictAt(t).status === "arrived");

    expect(behind.length, "beat 1 never plays").toBeGreaterThan(0);
    expect(together.length, "beat 2 never plays").toBeGreaterThan(0);
    expect(arrived.length, "beat 3 never plays").toBeGreaterThan(0);

    // Each beat holds long enough to be read at ~600ms/tick.
    for (const [name, beat] of [["behind", behind], ["together", together], ["arrived", arrived]] as const) {
      expect(beat.length, `${name} beat is too short to read`).toBeGreaterThanOrEqual(8);
    }

    expect(Math.max(...behind), "behind must precede together").toBeLessThan(Math.min(...together));
    expect(Math.max(...together), "together must precede arrived").toBeLessThan(Math.min(...arrived));
  });

  it("names Ama, and anchors her gap to the group rather than to the viewer", () => {
    const t = everyTick.find((t) => verdictAt(t).status === "behind")!;
    const v = verdictAt(t);
    expect(v.eyebrow).toBe("HEADS UP");
    expect(v.headline).toMatch(/^Ama is \d+\.\d km back$/);
    // KM BEHIND YOU would mean the viewer leaked into the convoy.
    expect(v.metricLabel).toBe("KM BEHIND THE GROUP");
    expect(v.metric).toMatch(/^\d+\.\d$/);
  });

  it("reads 'All together' with the distance still to run", () => {
    const t = everyTick.find((t) => verdictAt(t).eyebrow === "ALL GOOD")!;
    const v = verdictAt(t);
    expect(v.headline).toBe("All together");
    expect(v.metricLabel).toBe("KM TO AKOSOMBO");
  });

  it("names the single rider who arrives", () => {
    const t = everyTick.find((t) => verdictAt(t).status === "arrived")!;
    const v = verdictAt(t);
    expect(v.eyebrow).toBe("ARRIVED");
    expect(v.headline).toBe("Kofi has arrived");
  });
});
