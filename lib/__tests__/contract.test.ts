import { describe, it, expect } from "vitest";
import contract from "../../contract.json";
import { generateShareCode, SHARE_CODE_ALPHABET } from "../shareCode";
import { haversineMeters, shouldWritePosition } from "../geo";
import { diffStatuses } from "../notify";
import { createLocalData } from "../data/local";
import type { StatusKey } from "../types";

// The backend is a separate repo, so these values exist twice. Drift is silent
// and expensive: a mismatched threshold breaks "stopped" detection, a
// mismatched alphabet makes every share code unfindable. contract.json is the
// referee and this suite is the frontend's half of the agreement.
//
// Where a constant is module-private the assertion is behavioural, which pins
// the actual rule rather than a number that happens to sit next to it.

function store() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

const ACCRA = { lat: 5.6037, lng: -0.187 };

describe("contract.json conformance", () => {
  it("uses the shared share-code alphabet", () => {
    expect(SHARE_CODE_ALPHABET).toBe(contract.shareCode.alphabet);
  });

  it("generates codes of the shared length", () => {
    expect(generateShareCode()).toHaveLength(contract.shareCode.length);
  });

  it.each(contract.haversineGoldens)("matches the shared golden %#", ({ a, b, meters }) => {
    expect(haversineMeters(a, b)).toBeCloseTo(meters, 2);
  });

  it("expires trips after the shared lifetime", () => {
    const data = createLocalData({
      storage: store(),
      genId: () => "t1",
      genCode: () => "AAAAAA",
      now: () => 1_000_000,
    });
    const trip = data.createTrip({}, "creator");
    expect(trip.expiresAt - trip.createdAt).toBe(contract.tripTtlMs);
  });

  it("ignores movement below the shared threshold when stamping lastMovedAt", () => {
    // Behavioural pin on MOVED_THRESHOLD_M, which is module-private. Both
    // halves matter: a rule that never fires and one that always fires are
    // equally broken. Each half needs its own participant, because
    // updatePosition always stores the new coordinates — so the threshold is
    // measured against the *last fix*, not the original one, and jitter
    // accumulates in the baseline.
    let clock = 1_000_000;
    const data = createLocalData({
      storage: store(),
      genId: () => "t1",
      genCode: () => "AAAAAA",
      now: () => clock,
    });
    const trip = data.createTrip({}, "c");
    data.joinTrip(trip.id, "still", "Still");
    data.joinTrip(trip.id, "moving", "Moving");

    const degreesFor = (metres: number) => metres / 111_195;
    const stillAt = data.updatePosition(trip.id, "still", ACCRA).lastMovedAt;
    const movingAt = data.updatePosition(trip.id, "moving", ACCRA).lastMovedAt;

    clock += 60_000;

    // A shade under the threshold: lastMovedAt must not move.
    const jittered = data.updatePosition(trip.id, "still", {
      lat: ACCRA.lat + degreesFor(contract.movedThresholdM - 0.1),
      lng: ACCRA.lng,
    });
    expect(jittered.lastMovedAt).toBe(stillAt);

    // A shade over: lastMovedAt must advance to now.
    const moved = data.updatePosition(trip.id, "moving", {
      lat: ACCRA.lat + degreesFor(contract.movedThresholdM + 0.1),
      lng: ACCRA.lng,
    });
    expect(moved.lastMovedAt).not.toBe(movingAt);
    expect(moved.lastMovedAt).toBe(clock);
  });

  it("writes positions on the shared cadence and distance", () => {
    const { minIntervalMs, minDistanceM } = contract.positionWrite;
    // Just inside both bounds: no write.
    expect(
      shouldWritePosition({
        prev: ACCRA,
        next: { lat: ACCRA.lat + (minDistanceM - 1) / 111_195, lng: ACCRA.lng },
        msSinceLastWrite: minIntervalMs - 1,
      })
    ).toBe(false);
    // Past the distance bound alone: write.
    expect(
      shouldWritePosition({
        prev: ACCRA,
        next: { lat: ACCRA.lat + (minDistanceM + 1) / 111_195, lng: ACCRA.lng },
        msSinceLastWrite: 0,
      })
    ).toBe(true);
    // Past the time bound alone: write.
    expect(
      shouldWritePosition({ prev: ACCRA, next: ACCRA, msSinceLastWrite: minIntervalMs })
    ).toBe(true);
  });

  it("renders each status transition from the shared template", () => {
    const statuses: StatusKey[] = ["arrived", "behind", "ahead", "stopped", "with"];
    for (const status of statuses) {
      const messages = diffStatuses(
        { a: "with", b: "behind" },
        { a: status, b: "behind" },
        { a: "Kojo", b: "Ama" }
      );
      const expected = contract.alertTemplates[status].replace("{name}", "Kojo");
      // "with" -> "with" is not a transition, so that one case yields nothing.
      if (status === "with") continue;
      expect(messages).toContain(expected);
    }
  });

  it("renders a missing name as the shared fallback", () => {
    const messages = diffStatuses({ a: "with" }, { a: "arrived" }, {});
    expect(messages).toEqual([
      contract.alertTemplates.arrived.replace("{name}", contract.alertTemplates.fallbackName),
    ]);
  });

  it("uses the shared everyone-arrived aggregate", () => {
    const messages = diffStatuses(
      { a: "with", b: "behind" },
      { a: "arrived", b: "arrived" },
      { a: "Kojo", b: "Ama" }
    );
    expect(messages).toEqual([contract.alertTemplates.everyoneArrived]);
  });
});
