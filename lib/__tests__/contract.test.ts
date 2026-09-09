import { describe, it, expect } from "vitest";
import contract from "../../contract.json";
import { generateShareCode, SHARE_CODE_ALPHABET } from "../shareCode";
import { haversineMeters, shouldWritePosition } from "../geo";
import { computeStatuses } from "../status";
import { diffStatuses } from "../notify";
import { createLocalData } from "../data/local";
import { ATTENTION_ORDER } from "../pulse";
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

  it("calls somebody arrived at the shared radius", () => {
    // Behavioural pin on ARRIVE_RADIUS_M, which is module-private.
    //
    // This one crosses the network boundary in a way the others do not. Arrival
    // is derived here on every render during a trip, and derived *again* on the
    // server exactly once — by the purge sweep's snapshot pass, at the moment
    // the trip's location data is erased. If the two radii drift, somebody's
    // history disagrees with what their group watched happen, and there is no
    // longer any data left to work out which one was right.
    const degreesFor = (metres: number) => metres / 111_195;
    const at = (metres: number) => [
      {
        id: "rider",
        tripId: "t",
        displayName: "Rider",
        latitude: ACCRA.lat + degreesFor(metres),
        longitude: ACCRA.lng,
        status: null,
        lastMovedAt: null,
        lastSeenAt: 0,
      },
    ];

    const inside = computeStatuses(at(contract.arriveRadiusM - 1), ACCRA, 0);
    expect(inside.rider!.status).toBe("arrived");

    const outside = computeStatuses(at(contract.arriveRadiusM + 1), ACCRA, 0);
    expect(outside.rider!.status).not.toBe("arrived");
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

  it.each(contract.statusGoldens)("answers the shared golden: $name", (golden) => {
    // This is the frontend's half of the two-engine agreement. The backend
    // runs the identical fixtures against its own port, so a rule that changes
    // on one side fails on the other rather than silently disagreeing on a
    // dashboard.
    const participants = golden.members.map((m) => ({
      id: m.id,
      tripId: "t1",
      displayName: m.id,
      latitude: m.lat,
      longitude: m.lng,
      status: null as StatusKey | null,
      lastMovedAt: m.lastMovedAt,
      lastSeenAt: golden.now,
    }));

    const got = computeStatuses(participants, golden.destination, golden.now);

    for (const [id, expected] of Object.entries(golden.expected)) {
      expect(got[id]?.status, `member ${id} in "${golden.name}"`).toBe(expected);
    }
  });

  it("uses the shared attention order", () => {
    // This array exists in both repos — it decides which trip is most worth
    // your attention on Home and which rider is first on the trip screen.
    // Drift would make those two screens disagree about the same group.
    expect(ATTENTION_ORDER).toEqual(contract.attentionOrder);
  });
});
