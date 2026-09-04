import { describe, it, expect } from "vitest";
import { normalizeChoice, resolveTheme, THEME_BOOTSTRAP, THEME_KEY } from "../theme";

describe("normalizeChoice", () => {
  it("passes through explicit choices", () => {
    expect(normalizeChoice("light")).toBe("light");
    expect(normalizeChoice("dark")).toBe("dark");
  });

  it("treats anything else as system", () => {
    for (const raw of [null, undefined, "", "System", "auto", "DARK", "{}"]) {
      expect(normalizeChoice(raw)).toBe("system");
    }
  });
});

describe("resolveTheme", () => {
  it("honours an explicit choice over the system preference", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("follows the system preference when unset", () => {
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme(null, false)).toBe("light");
  });

  it("defaults to light for an unrecognised stored value with no dark preference", () => {
    expect(resolveTheme("auto", false)).toBe("light");
  });
});

describe("THEME_BOOTSTRAP", () => {
  it("references the same storage key the app writes", () => {
    expect(THEME_BOOTSTRAP).toContain(THEME_KEY);
  });

  it("cannot throw, so it can never block first paint", () => {
    expect(THEME_BOOTSTRAP).toContain("try{");
    expect(THEME_BOOTSTRAP).toContain("catch");
  });

  it("runs standalone in a browser-like scope", () => {
    const setAttribute = (name: string, value: string) => void calls.push([name, value]);
    const calls: [string, string][] = [];
    const fn = new Function("localStorage", "window", "document", `return ${THEME_BOOTSTRAP}`);
    fn(
      { getItem: () => "dark" },
      { matchMedia: () => ({ matches: false }) },
      { documentElement: { setAttribute } }
    );
    expect(calls).toEqual([["data-theme", "dark"]]);
  });
});
