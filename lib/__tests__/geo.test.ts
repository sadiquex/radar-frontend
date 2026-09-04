import { describe, it, expect } from "vitest";
import { haversineMeters, shouldWritePosition, estimateSpeedMps, writePolicyFor } from "../geo";

describe("haversineMeters", () => {
  it("is ~0 for the same point", () => {
    expect(haversineMeters({ lat: 5.6, lng: -0.2 }, { lat: 5.6, lng: -0.2 })).toBeCloseTo(0, 5);
  });

  it("is ~111km for one degree of latitude", () => {
    const d = haversineMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });

  it("matches a known London→Paris distance (~343km)", () => {
    const d = haversineMeters({ lat: 51.5074, lng: -0.1278 }, { lat: 48.8566, lng: 2.3522 });
    expect(d).toBeGreaterThan(340_000);
    expect(d).toBeLessThan(346_000);
  });
});

describe("shouldWritePosition", () => {
  const A = { lat: 5.6037, lng: -0.187 };

  it("always writes the first position (no previous)", () => {
    expect(shouldWritePosition({ prev: null, next: A, msSinceLastWrite: 0 })).toBe(true);
  });

  it("writes when the cadence interval has elapsed even if barely moved", () => {
    const next = { lat: A.lat + 0.00001, lng: A.lng }; // ~1m
    expect(shouldWritePosition({ prev: A, next, msSinceLastWrite: 25_000 })).toBe(true);
  });

  it("writes on significant movement before the interval", () => {
    const next = { lat: A.lat + 0.001, lng: A.lng }; // ~111m
    expect(shouldWritePosition({ prev: A, next, msSinceLastWrite: 1_000 })).toBe(true);
  });

  it("skips tiny movement within the interval", () => {
    const next = { lat: A.lat + 0.00001, lng: A.lng }; // ~1m
    expect(shouldWritePosition({ prev: A, next, msSinceLastWrite: 1_000 })).toBe(false);
  });
});

describe("estimateSpeedMps", () => {
  it("is zero without a previous fix", () => {
    expect(estimateSpeedMps(null, { lat: 5.6, lng: -0.18 }, 1000)).toBe(0);
  });

  it("is zero for a non-positive interval, rather than dividing by zero", () => {
    const a = { lat: 5.6, lng: -0.18 };
    const b = { lat: 5.61, lng: -0.18 };
    expect(estimateSpeedMps(a, b, 0)).toBe(0);
    expect(estimateSpeedMps(a, b, -100)).toBe(0);
  });

  it("derives a plausible speed from distance over time", () => {
    const a = { lat: 5.6, lng: -0.18 };
    const b = { lat: 5.6, lng: -0.18 + 0.0009 }; // ~100m east
    const speed = estimateSpeedMps(a, b, 10_000);
    expect(speed).toBeGreaterThan(8);
    expect(speed).toBeLessThan(12);
  });
});

describe("writePolicyFor", () => {
  it("uses the slow policy below 2 m/s", () => {
    expect(writePolicyFor(0)).toEqual({ minIntervalMs: 20_000, minDistanceM: 30 });
    expect(writePolicyFor(1.99)).toEqual({ minIntervalMs: 20_000, minDistanceM: 30 });
  });

  it("switches at exactly 2 m/s", () => {
    expect(writePolicyFor(2).minIntervalMs).toBe(10_000);
  });

  it("switches at exactly 6 m/s", () => {
    expect(writePolicyFor(5.99).minIntervalMs).toBe(10_000);
    expect(writePolicyFor(6)).toEqual({ minIntervalMs: 5_000, minDistanceM: 20 });
  });

  it("treats a negative or NaN speed as stationary", () => {
    expect(writePolicyFor(-5).minIntervalMs).toBe(20_000);
    expect(writePolicyFor(NaN).minIntervalMs).toBe(20_000);
  });
});

describe("shouldWritePosition with speed", () => {
  const prev = { lat: 5.6, lng: -0.18 };
  const near = { lat: 5.6, lng: -0.18 + 0.0002 }; // ~22m

  it("keeps the original policy when speed is omitted", () => {
    expect(shouldWritePosition({ prev, next: near, msSinceLastWrite: 9_000 })).toBe(false);
    expect(shouldWritePosition({ prev, next: near, msSinceLastWrite: 21_000 })).toBe(true);
  });

  it("writes sooner when moving fast", () => {
    // 22m has not met the slow 30m threshold, but it clears the fast 20m one.
    expect(shouldWritePosition({ prev, next: near, msSinceLastWrite: 1_000, speedMps: 0 })).toBe(false);
    expect(shouldWritePosition({ prev, next: near, msSinceLastWrite: 1_000, speedMps: 8 })).toBe(true);
  });

  it("still respects an explicit override", () => {
    expect(
      shouldWritePosition({ prev, next: near, msSinceLastWrite: 1_000, speedMps: 8, minDistanceM: 500 })
    ).toBe(false);
  });
});
