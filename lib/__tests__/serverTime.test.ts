import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { createClock } from "../serverTime";

describe("createClock", () => {
  let localNow: number;
  const clock = () => createClock(() => localNow);

  beforeEach(() => {
    localNow = 1_000_000;
  });

  it("reads the local clock until the server has spoken", () => {
    expect(clock().now()).toBe(1_000_000);
  });

  it("reports no offset before the server has spoken", () => {
    expect(clock().offsetMs()).toBe(0);
  });

  it("follows the server's clock once it has", () => {
    // The device is 5 minutes behind the server. Every timestamp the client
    // holds is the server's, so time arithmetic must happen in server time.
    const c = clock();
    c.record(1_000_000 + 300_000);
    expect(c.now()).toBe(1_300_000);
    expect(c.offsetMs()).toBe(300_000);
  });

  it("corrects a device whose clock runs fast", () => {
    // The dangerous direction: a fast device would otherwise decide that
    // everyone in the group has been stationary for 5 minutes and is "stopped".
    const c = clock();
    localNow = 1_600_000; // device is 10 minutes ahead
    c.record(1_000_000);
    expect(c.now()).toBe(1_000_000);
    expect(c.offsetMs()).toBe(-600_000);
  });

  it("keeps advancing between samples", () => {
    const c = clock();
    c.record(1_000_000 + 300_000);
    localNow += 45_000;
    expect(c.now()).toBe(1_345_000);
  });

  it("adopts the most recent sample", () => {
    const c = clock();
    c.record(1_000_000 + 300_000);
    c.record(1_000_000 + 10_000);
    expect(c.offsetMs()).toBe(10_000);
  });

  it("ignores a sample that is not a finite number", () => {
    // A malformed or truncated response must not poison every subsequent
    // status calculation.
    const c = clock();
    c.record(1_000_000 + 300_000);
    c.record(NaN);
    c.record(Infinity);
    c.record(undefined as unknown as number);
    expect(c.offsetMs()).toBe(300_000);
  });

  it("treats a sub-second difference as no offset worth tracking", () => {
    // Network latency alone puts serverNow a few hundred ms out. Chasing that
    // would rewrite the offset on every poll for no benefit — the thresholds
    // this feeds are 5 minutes and whole seconds.
    const c = clock();
    c.record(1_000_400);
    expect(c.offsetMs()).toBe(0);
    expect(c.now()).toBe(1_000_000);
  });
});

describe("the shared browser clock", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is a singleton so every module sees the same correction", async () => {
    vi.resetModules();
    const { recordServerTime, serverNow, clockOffsetMs } = await import("../serverTime");
    recordServerTime(Date.now() + 3_600_000);
    expect(clockOffsetMs()).toBeGreaterThan(3_500_000);
    expect(serverNow()).toBeGreaterThan(Date.now() + 3_500_000);
    recordServerTime(Date.now()); // restore, this module is shared
  });
});
