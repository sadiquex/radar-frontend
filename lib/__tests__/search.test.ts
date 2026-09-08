import { describe, it, expect, vi } from "vitest";
import { shouldSearch, createDebouncer, MIN_QUERY, DEBOUNCE_MS } from "../search";

describe("shouldSearch", () => {
  it("needs at least three characters after trimming", () => {
    expect(MIN_QUERY).toBe(3);
    expect(shouldSearch("")).toBe(false);
    expect(shouldSearch("a")).toBe(false);
    expect(shouldSearch("ab")).toBe(false);
    expect(shouldSearch("   ab   ")).toBe(false);
    expect(shouldSearch("abc")).toBe(true);
    expect(shouldSearch("  accra  ")).toBe(true);
  });

  it("agrees with the server, which refuses under three too", () => {
    // The client rule exists to save a round trip, not to disagree.
    expect(shouldSearch("ab")).toBe(false);
  });
});

describe("createDebouncer", () => {
  const fakeTimers = () => {
    let next = 1;
    const pending = new Map<number, () => void>();
    return {
      set: (fn: () => void, _ms: number) => {
        const id = next++;
        pending.set(id, fn);
        return id;
      },
      clear: (id: number) => void pending.delete(id),
      flush: () => {
        for (const fn of [...pending.values()]) fn();
        pending.clear();
      },
      get pendingCount() {
        return pending.size;
      },
    };
  };

  it("runs the last call and not the ones it superseded", () => {
    // Typing "accra" must not produce five requests.
    const timers = fakeTimers();
    const d = createDebouncer(DEBOUNCE_MS, timers);
    const calls: string[] = [];

    d.run(() => calls.push("a"));
    d.run(() => calls.push("ac"));
    d.run(() => calls.push("acc"));
    expect(timers.pendingCount).toBe(1);

    timers.flush();
    expect(calls).toEqual(["acc"]);
  });

  it("cancels a pending call, so an unmount cannot fire into a dead component", () => {
    const timers = fakeTimers();
    const d = createDebouncer(DEBOUNCE_MS, timers);
    const fn = vi.fn();

    d.run(fn);
    d.cancel();
    timers.flush();
    expect(fn).not.toHaveBeenCalled();
  });

  it("defaults to a quarter of a second, which is a keystroke apart", () => {
    expect(DEBOUNCE_MS).toBe(250);
  });
});
