import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * A regression guard over the icon set, not a unit test — the sibling of
 * `tokens.test.ts`, which likewise asserts claims about source files.
 *
 * Every failure mode of an app icon is invisible until it is too late: a
 * manifest that points at a file nobody shipped, a "512" that is really a
 * 192, an apple-touch-icon at the wrong size. Chrome refuses to offer the
 * install prompt, iOS silently substitutes a screenshot of the page, and
 * nothing in the build says a word. On this app that install is load-bearing:
 * iOS Safari delivers Web Push only to a PWA on the Home Screen, so a broken
 * icon set costs screen-off alerts on every iPhone.
 */

const ROOT = join(__dirname, "..", "..");
const publicPath = (...p: string[]) => join(ROOT, "public", ...p);

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

const manifest = JSON.parse(readFileSync(publicPath("manifest.json"), "utf8")) as {
  icons: ManifestIcon[];
  background_color: string;
  theme_color: string;
};

/**
 * Reads a PNG's real dimensions out of its IHDR chunk: 8-byte signature, then
 * a 4-byte length and the "IHDR" tag, then width and height as big-endian
 * uint32s. Cheaper than a decoder and enough to catch a mislabelled file.
 */
function pngSize(file: string): { width: number; height: number } {
  const buf = readFileSync(file);
  const signature = buf.subarray(0, 8).toString("latin1");
  expect(signature, `${file} is not a PNG`).toBe("\x89PNG\r\n\x1a\n");
  expect(buf.subarray(12, 16).toString("latin1"), `${file} has no IHDR`).toBe("IHDR");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe("manifest icons", () => {
  it("declares at least one icon", () => {
    // An empty array is what shipped before the logo existed, and it reads as
    // "no icons" to every installer.
    expect(manifest.icons.length).toBeGreaterThan(0);
  });

  it("points every icon at a file that exists", () => {
    for (const icon of manifest.icons) {
      expect(icon.src.startsWith("/"), `${icon.src} must be root-relative`).toBe(true);
      expect(existsSync(publicPath(icon.src)), `${icon.src} is declared but missing`).toBe(true);
    }
  });

  it("gives every icon the size it actually is", () => {
    for (const icon of manifest.icons) {
      if (!icon.src.endsWith(".png")) continue;
      const [w, h] = icon.sizes.split("x").map(Number);
      expect(pngSize(publicPath(icon.src))).toEqual({ width: w, height: h });
    }
  });

  it("offers the 192 and 512 Chrome requires before it will prompt to install", () => {
    const any = manifest.icons.filter((i) => (i.purpose ?? "any").split(" ").includes("any"));
    const sizes = any.map((i) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
  });

  it("ships a maskable icon so Android does not letterbox it", () => {
    // Without `maskable`, Android draws the icon inside a white rounded square
    // instead of filling the shape it wants.
    const maskable = manifest.icons.filter((i) => i.purpose?.split(" ").includes("maskable"));
    expect(maskable.length).toBeGreaterThan(0);
    expect(maskable.map((i) => i.sizes)).toContain("512x512");
  });

  it("declares the type browsers filter on", () => {
    for (const icon of manifest.icons) {
      expect(icon.type).toBe(icon.src.endsWith(".svg") ? "image/svg+xml" : "image/png");
    }
  });
});

describe("manifest colours", () => {
  const css = readFileSync(join(ROOT, "app", "globals.css"), "utf8");

  // The light ground, declared on bare :root — the app's default theme.
  const lightGround = css.match(/:root\s*\{[^}]*?--c-ground:\s*(#[0-9A-Fa-f]{6})/)?.[1];

  it("splashes the colour the app actually paints first", () => {
    // A splash screen in a colour the app never uses is a visible flash of the
    // wrong brand on every cold start. Light is the default theme.
    expect(lightGround).toBeTruthy();
    expect(manifest.background_color.toUpperCase()).toBe(lightGround!.toUpperCase());
  });

  it("themes the browser chrome to the same ground", () => {
    expect(manifest.theme_color.toUpperCase()).toBe(lightGround!.toUpperCase());
  });
});

describe("favicon", () => {
  const svgPath = join(ROOT, "app", "icon.svg");

  it("exists where Next serves it from", () => {
    expect(existsSync(svgPath)).toBe(true);
  });

  const svg = existsSync(svgPath) ? readFileSync(svgPath, "utf8") : "";

  it("never uses currentColor", () => {
    // A favicon inherits no colour from anything. `currentColor` resolves to
    // black, which is invisible against a dark browser tab — the exact bug
    // that made the first light-ground logo preview render blank.
    expect(svg).not.toContain("currentColor");
  });

  it("defines its colours for both themes", () => {
    // Browser tabs follow the OS theme, so a single-ground favicon disappears
    // into one of them.
    expect(svg).toContain("prefers-color-scheme: dark");
  });

  it("scales, rather than being pinned to one size", () => {
    expect(svg).toMatch(/viewBox="0 0 \d+ \d+"/);
  });
});

describe("apple touch icon", () => {
  it("is the 180 square iOS asks for", () => {
    // iOS does not scale an odd size gracefully; it also will not use the
    // manifest, so this file is the whole story on iPhone.
    const file = join(ROOT, "app", "apple-icon.png");
    expect(existsSync(file), "app/apple-icon.png is missing").toBe(true);
    expect(pngSize(file)).toEqual({ width: 180, height: 180 });
  });
});

describe("notification icon", () => {
  it("is a file the service worker can actually show", () => {
    // `showNotification` silently drops a missing icon and falls back to the
    // browser's own logo, which reads as a Chrome alert rather than a Radar one.
    const sw = readFileSync(publicPath("sw.js"), "utf8");
    const refs = [...sw.matchAll(/(?:icon|badge):\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(refs.length, "sw.js shows notifications with no icon").toBeGreaterThan(0);
    for (const ref of refs) {
      expect(existsSync(publicPath(ref)), `sw.js references ${ref}, which is missing`).toBe(true);
    }
  });
});
