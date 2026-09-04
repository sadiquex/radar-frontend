import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { patternFor, hapticsSupported, buzz } from "../haptics";

describe("patternFor", () => {
  it("buzzes hardest for an alarm", () => {
    expect(patternFor("alarm")).toEqual([60, 40, 60]);
  });

  it("buzzes once for attention", () => {
    expect(patternFor("attention")).toEqual([40]);
  });

  it("stays silent for tones that need no interruption", () => {
    expect(patternFor("info")).toBeNull();
    expect(patternFor("calm")).toBeNull();
    expect(patternFor("waiting")).toBeNull();
  });
});

describe("buzz", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reports no support when navigator.vibrate is absent, as on iOS", () => {
    vi.stubGlobal("navigator", {});
    expect(hapticsSupported()).toBe(false);
    expect(buzz("alarm")).toBe(false);
  });

  it("passes the pattern through when supported", () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal("navigator", { vibrate });
    expect(buzz("alarm")).toBe(true);
    expect(vibrate).toHaveBeenCalledWith([60, 40, 60]);
  });

  it("does not call vibrate for a silent tone", () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal("navigator", { vibrate });
    expect(buzz("calm")).toBe(false);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("survives a throwing vibrate implementation", () => {
    vi.stubGlobal("navigator", { vibrate: () => { throw new Error("denied"); } });
    expect(buzz("alarm")).toBe(false);
  });
});
