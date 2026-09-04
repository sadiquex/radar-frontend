import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..");
const css = readFileSync(join(root, "app", "globals.css"), "utf8");

// ─── Contrast ───────────────────────────────────────────────────────────────
// The palette is only correct if it is provably correct, so the ratios are
// asserted against the CSS that actually ships rather than a copy in a doc.
const lin = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** Pull one theme's token block out of globals.css. */
function tokens(selector: string): Record<string, string> {
  const at = css.indexOf(selector);
  expect(at, `${selector} missing from globals.css`).toBeGreaterThan(-1);
  const body = css.slice(at, css.indexOf("}", at));
  const out: Record<string, string> = {};
  for (const [, name, value] of body.matchAll(/--c-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    out[name] = value;
  }
  return out;
}

const THEMES = {
  light: tokens(":root {"),
  dark: tokens(':root[data-theme="dark"] {'),
};
const STATUSES = ["arrived", "withg", "ahead", "behind", "stopped"];

describe.each(Object.entries(THEMES))("%s theme contrast", (name, t) => {
  it("declares every token the app reads", () => {
    for (const key of ["ground", "raised", "sunken", "line", "line-strong", "text", "muted", "faint", "scrim"]) {
      expect(t[key], `--c-${key} missing in ${name}`).toBeDefined();
    }
    for (const s of STATUSES) {
      expect(t[s], `--c-${s} missing in ${name}`).toBeDefined();
      expect(t[`${s}-soft`], `--c-${s}-soft missing in ${name}`).toBeDefined();
    }
    for (let i = 0; i < 8; i++) {
      expect(t[`av-${i}`]).toBeDefined();
      expect(t[`av-${i}-ink`]).toBeDefined();
    }
  });

  it("meets AAA for body text and AA for muted labels", () => {
    expect(contrast(t.text, t.ground)).toBeGreaterThanOrEqual(7);
    // Labels moved off `faint` onto `muted` precisely so they pass AA.
    expect(contrast(t.muted, t.ground)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps faint above the 3:1 needed for non-text UI", () => {
    expect(contrast(t.faint, t.ground)).toBeGreaterThanOrEqual(3);
  });

  it("gives lineStrong a real edge at 3:1", () => {
    expect(contrast(t["line-strong"], t.ground)).toBeGreaterThanOrEqual(3);
  });

  it("passes AA for every status colour on the ground", () => {
    for (const s of STATUSES) {
      expect(contrast(t[s], t.ground), `${s} on ${name} ground`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("passes AA for every status pill: colour on its own soft tint", () => {
    for (const s of STATUSES) {
      expect(contrast(t[s], t[`${s}-soft`]), `${s} pill in ${name}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("passes AA for avatar initials on every slot", () => {
    for (let i = 0; i < 8; i++) {
      expect(contrast(t[`av-${i}-ink`], t[`av-${i}`]), `avatar slot ${i} in ${name}`)
        .toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("theme declaration hygiene", () => {
  it("declares dark under both the system preference and an explicit choice", () => {
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    expect(css).toContain(':root:not([data-theme="light"])');
    expect(css).toContain(':root[data-theme="dark"]');
  });

  it("keeps the two dark blocks identical, so the toggle and the OS agree", () => {
    const media = tokens(':root:not([data-theme="light"]) {');
    expect(media).toEqual(THEMES.dark);
  });

  it("filters only the map canvas, never the container holding the markers", () => {
    expect(css).toContain('[data-theme="dark"] .maplibregl-canvas');
    expect(css).not.toMatch(/\[data-theme="dark"\]\s+\.maplibregl-map\s*\{[^}]*filter/);
  });
});

// ─── Type scale ─────────────────────────────────────────────────────────────
describe("type scale floor", () => {
  const SCREENS = ["Radar.tsx", "PhoneFrame.tsx", "JoinFlow.tsx"];

  it.each(SCREENS)("has no type below 12px in %s", (file) => {
    const src = readFileSync(join(root, "app", "components", file), "utf8");
    const tooSmall = [...src.matchAll(/fontSize:\s*(\d+)/g)]
      .map((m) => Number(m[1]))
      .filter((n) => n < 12);
    // 9px distance labels on the horizon were the whole reason for this pass.
    expect(tooSmall).toEqual([]);
  });

  it("keeps text inputs at 16px or above, or iOS zooms the viewport on focus", () => {
    const src = readFileSync(join(root, "app", "components", "Radar.tsx"), "utf8");
    const inputs = src.match(/<input[\s\S]{0,900}?\/>/g) ?? [];
    expect(inputs.length).toBeGreaterThan(0);
    for (const input of inputs) {
      const size = input.match(/fontSize:\s*(\d+)/);
      expect(size, `an <input> has no explicit fontSize:\n${input}`).not.toBeNull();
      expect(Number(size![1])).toBeGreaterThanOrEqual(16);
    }
  });
});
