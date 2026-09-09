import { describe, it, expect } from "vitest";
import { ATTENTION_ORDER, rankTrips, contactsFor, pulseWords } from "../pulse";
import type { LiveTripEntry, TripPulse } from "../data/history";
import type { StatusKey } from "../types";

const pulse = (over: Partial<TripPulse> = {}): TripPulse => ({
  stopped: 0, moving: 1, arrived: 0, worst: "with", kmLeftMax: 5, ...over,
});

const trip = (id: string, over: Partial<LiveTripEntry> = {}): LiveTripEntry => ({
  kind: "live", tripId: id, shareCode: id.toUpperCase(), name: id,
  destinationName: "Kotoka", memberCount: 2, startedAt: 0, expiresAt: 1000,
  wasCreator: true, pulse: pulse(), ...over,
});

describe("ATTENTION_ORDER", () => {
  it("puts stopped first and arrived last", () => {
    // Stopped is the only status that means somebody may need help; arrived
    // needs nothing.
    expect(ATTENTION_ORDER).toEqual(["stopped", "behind", "ahead", "with", "arrived"]);
  });
});

describe("rankTrips", () => {
  it("puts the trip that needs attention first", () => {
    const got = rankTrips([
      trip("calm", { pulse: pulse({ worst: "with" }) }),
      trip("done", { pulse: pulse({ worst: "arrived" }) }),
      trip("hurt", { pulse: pulse({ worst: "stopped" }) }),
    ]);
    expect(got.map((t) => t.tripId)).toEqual(["hurt", "calm", "done"]);
  });

  it("breaks ties by soonest expiry", () => {
    const got = rankTrips([
      trip("later", { expiresAt: 9000 }),
      trip("sooner", { expiresAt: 100 }),
    ]);
    expect(got.map((t) => t.tripId)).toEqual(["sooner", "later"]);
  });

  it("sorts an unlocated trip below every located one", () => {
    // Nothing is known about it, so it cannot out-rank a trip that has told us
    // somebody stopped.
    const got = rankTrips([
      trip("unknown", { pulse: null }),
      trip("calm", { pulse: pulse({ worst: "with" }) }),
    ]);
    expect(got.map((t) => t.tripId)).toEqual(["calm", "unknown"]);
  });

  it("does not mutate its input", () => {
    const input = [trip("a", { expiresAt: 9 }), trip("b", { expiresAt: 1 })];
    rankTrips(input);
    expect(input.map((t) => t.tripId)).toEqual(["a", "b"]);
  });
});

describe("contactsFor", () => {
  it("puts the furthest trip on the outer ring and an arrived one at the centre", () => {
    const got = contactsFor([
      trip("far", { pulse: pulse({ kmLeftMax: 10 }) }),
      trip("here", { pulse: pulse({ kmLeftMax: 0 }) }),
    ]);
    expect(got.find((c) => c.tripId === "far")!.radius).toBe(1);
    expect(got.find((c) => c.tripId === "here")!.radius).toBe(0);
  });

  it("gives a trip the same angle every time, so a poll does not move it", () => {
    // useLiveTrips refetches every four seconds. A contact that jumps on each
    // refresh reads as movement that did not happen.
    // "stable" first, then "stable" second — an angle derived from list
    // position would differ between these two; one derived from the id cannot.
    const first = contactsFor([trip("stable"), trip("other")])[0]!.angle;
    const second = contactsFor([trip("other"), trip("stable")])[1]!.angle;
    expect(first).toBe(second);
  });

  it("gives different trips different angles", () => {
    const got = contactsFor([trip("one"), trip("two"), trip("three")]);
    expect(new Set(got.map((c) => c.angle)).size).toBe(3);
  });

  it("marks an unlocated trip as such and parks it on the outer ring", () => {
    const [got] = contactsFor([trip("unknown", { pulse: null })]);
    expect(got).toMatchObject({ located: false, radius: 1, status: null });
  });

  it("parks a trip with no destination on the outer ring", () => {
    const [got] = contactsFor([trip("wander", { pulse: pulse({ kmLeftMax: null }) })]);
    expect(got!.radius).toBe(1);
    expect(got!.located).toBe(true);
  });

  it("does not divide by zero when every trip has arrived", () => {
    const got = contactsFor([
      trip("a", { pulse: pulse({ kmLeftMax: 0 }) }),
      trip("b", { pulse: pulse({ kmLeftMax: 0 }) }),
    ]);
    for (const c of got) expect(Number.isFinite(c.radius)).toBe(true);
  });
});

describe("pulseWords", () => {
  it("says what happened, so colour is never the only channel", () => {
    expect(pulseWords(null)).toBe("Nobody located yet");
    expect(pulseWords(pulse({ stopped: 2, worst: "stopped" }))).toBe("2 stopped");
    expect(pulseWords(pulse({ stopped: 1, worst: "stopped" }))).toBe("1 stopped");
    expect(pulseWords(pulse({ moving: 3, arrived: 0, worst: "with" })))
      .toBe("Everyone with the group");
    expect(pulseWords(pulse({ moving: 0, arrived: 3, worst: "arrived" })))
      .toBe("Everyone arrived");
    expect(pulseWords(pulse({ stopped: 0, moving: 1, arrived: 0, worst: "behind" })))
      .toBe("Someone behind");
    expect(pulseWords(pulse({ stopped: 0, moving: 1, arrived: 0, worst: "ahead" })))
      .toBe("Someone ahead");
  });
});
