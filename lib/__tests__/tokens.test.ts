import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
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

  it("shares one declaration block between the dark theme and the night section", () => {
    // The landing hero must be dark inside a light page, and :root[data-theme]
    // matches only <html>. A second block repeating thirty values would drift,
    // and only one of the two copies is contrast-tested above. `.gt-night` is
    // written on the line ABOVE the selector so the literal string the parser
    // searches for is still present verbatim.
    expect(css).toMatch(/\.gt-night,\n:root\[data-theme="dark"\] \{/);
  });
});

// ─── Type scale ─────────────────────────────────────────────────────────────
/**
 * Extracts whole `<Name ... />` elements, nested JSX and all.
 *
 * A regex cannot do this: `/<Row[\s\S]*?\/>/` stops at the first `/>` it
 * finds, which is almost always an icon inside the element rather than the
 * element's own close. Walking the braces is the only way to know where the
 * element actually ends.
 */
/**
 * Whether an element sets a prop *itself*, as opposed to somewhere inside one.
 *
 * The devices row passes `right={<button onClick={…}>Sign out</button>}` — a
 * plain `/onClick=/` over the whole element sees that inner handler and reports
 * a row that is not clickable at all. Only depth zero is the element's own
 * props.
 */
function hasOwnProp(markup: string, prop: string): boolean {
  let depth = 0;
  for (let i = 0; i < markup.length; i += 1) {
    const c = markup[i]!;
    if (c === "{") depth += 1;
    else if (c === "}") depth -= 1;
    else if (depth === 0 && markup.startsWith(`${prop}=`, i)) return true;
  }
  return false;
}

function jsxElements(src: string, name: string): string[] {
  const found: string[] = [];
  const open = new RegExp(`<${name}\\b`, "g");
  let match: RegExpExecArray | null;

  while ((match = open.exec(src)) !== null) {
    let depth = 0;
    for (let i = match.index; i < src.length; i += 1) {
      const c = src[i]!;
      if (c === "{") depth += 1;
      else if (c === "}") depth -= 1;
      else if (depth === 0 && c === "/" && src[i + 1] === ">") {
        found.push(src.slice(match.index, i + 2));
        break;
      }
    }
  }
  return found;
}

describe("type scale floor", () => {
  // Discovered, not listed. The hand-written list was ["Radar.tsx",
  // "PhoneFrame.tsx", "JoinFlow.tsx"], so every screen added after it was
  // written — TabBar and the account screens among them — was silently
  // unguarded, and the <input> rule below only ever looked at Radar.tsx while
  // the one text input somebody would actually get wrong lived elsewhere.
  const componentsDir = join(root, "app", "components");

  /**
   * Every component, at any depth. Non-recursive `readdirSync` was the same
   * bug as the hand-written list it replaced, one level up: `landing/` sits in
   * a subdirectory and would have been silently unguarded, which is exactly
   * how the 9px horizon labels survived the first time.
   *
   * Paths are returned relative to `componentsDir`, so `join(componentsDir, f)`
   * below and the `%s` test titles keep working unchanged.
   */
  const tsxUnder = (dir: string, prefix = ""): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? tsxUnder(join(dir, e.name), `${prefix}${e.name}/`)
        : e.name.endsWith(".tsx")
        ? [`${prefix}${e.name}`]
        : []
    );

  const SCREENS = tsxUnder(componentsDir);

  it("finds the screen components", () => {
    // A glob that matches nothing passes every assertion under it.
    expect(SCREENS.length).toBeGreaterThan(3);
  });

  it.each(SCREENS)("has no type below 12px in %s", (file) => {
    const src = readFileSync(join(componentsDir, file), "utf8");
    const tooSmall = [...src.matchAll(/fontSize:\s*(\d+)/g)]
      .map((m) => Number(m[1]))
      .filter((n) => n < 12);
    // 9px distance labels on the horizon were the whole reason for this pass.
    expect(tooSmall).toEqual([]);
  });

  it("never puts a button inside a clickable Row", () => {
    // Found by running the app, not by any test here. `Row` renders a <button>
    // when it has an onClick, and a <button> inside a <button> is invalid HTML:
    // React does not merely warn, hydration fails and the server's markup for
    // the entire document is discarded and re-rendered on the client.
    //
    // A row with anything interactive in `right` must leave `onClick` off and
    // let its contents own the interaction.
    const rows = SCREENS.flatMap((file) =>
      jsxElements(readFileSync(join(componentsDir, file), "utf8"), "Row").map((markup) => ({
        file,
        markup,
      }))
    );

    // A guard that matches nothing passes forever. The first version of this
    // used /<Row[\s\S]*?\/>/ and stopped at the first inner `/>` — an icon —
    // so it found eight rows and thought none of them was clickable.
    expect(rows.length).toBeGreaterThan(5);
    expect(rows.filter((r) => hasOwnProp(r.markup, "onClick")).length).toBeGreaterThan(0);

    const offenders = rows
      .filter((r) => hasOwnProp(r.markup, "onClick") && /<button\b/.test(r.markup))
      .map((r) => `${r.file}:\n${r.markup}`);
    expect(offenders).toEqual([]);
  });

  it("keeps text inputs at 16px or above, or iOS zooms the viewport on focus", () => {
    const inputs = SCREENS.flatMap((file) => {
      const src = readFileSync(join(componentsDir, file), "utf8");
      return (src.match(/<input[\s\S]{0,900}?\/>/g) ?? []).map((markup) => ({ file, markup }));
    });
    expect(inputs.length).toBeGreaterThan(0);
    for (const { file, markup } of inputs) {
      const size = markup.match(/fontSize:\s*(\d+)/);
      expect(size, `an <input> in ${file} has no explicit fontSize:\n${markup}`).not.toBeNull();
      expect(Number(size![1]), `an <input> in ${file} is below 16px`).toBeGreaterThanOrEqual(16);
    }
  });
});
