import { describe, it, expect } from "vitest";
import jsQR from "jsqr";
import { qrSvg, qrModules, QUIET_ZONE_MODULES } from "../qrCode";

/** Renders a module matrix to RGBA pixels so a real decoder can read it. */
function toPixels(matrix: { size: number; dark: (x: number, y: number) => boolean }, scale = 4) {
  const dim = (matrix.size + QUIET_ZONE_MODULES * 2) * scale;
  const rgba = new Uint8ClampedArray(dim * dim * 4).fill(255);
  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) {
      if (!matrix.dark(x, y)) continue;
      const px = (x + QUIET_ZONE_MODULES) * scale;
      const py = (y + QUIET_ZONE_MODULES) * scale;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const i = ((py + dy) * dim + (px + dx)) * 4;
          rgba[i] = 0;
          rgba[i + 1] = 0;
          rgba[i + 2] = 0;
        }
      }
    }
  }
  return { rgba, dim };
}

describe("qrModules", () => {
  // The previous QR on this screen was decorative and looked scannable but
  // never was. So the test that matters is not "does it render" — it is
  // "does a real decoder read the right thing back out".
  it("produces a QR a decoder can actually read", () => {
    const url = "https://radar-for-sports.vercel.app/t/AWUEHN/join";
    const { rgba, dim } = toPixels(qrModules(url));
    const decoded = jsQR(rgba, dim, dim);
    expect(decoded?.data).toBe(url);
  });

  it("round-trips a long link", () => {
    const url = "https://radar-for-sports.vercel.app/t/AWUEHN/join?from=poster";
    const { rgba, dim } = toPixels(qrModules(url));
    expect(jsQR(rgba, dim, dim)?.data).toBe(url);
  });

  it("round-trips a bare code", () => {
    const { rgba, dim } = toPixels(qrModules("AWUEHN"));
    expect(jsQR(rgba, dim, dim)?.data).toBe("AWUEHN");
  });

  it("keeps a quiet zone, without which many scanners refuse to read", () => {
    expect(QUIET_ZONE_MODULES).toBeGreaterThanOrEqual(4);
  });

  it("is deterministic for the same input", () => {
    const a = qrModules("AWUEHN");
    const b = qrModules("AWUEHN");
    expect(a.size).toBe(b.size);
    expect(a.dark(0, 0)).toBe(b.dark(0, 0));
  });
});

describe("qrSvg", () => {
  it("renders an svg sized in module units", () => {
    const svg = qrSvg("https://x.test/t/AWUEHN/join");
    expect(svg).toMatch(/^<svg /);
    expect(svg).toContain("</svg>");
    // viewBox in module units keeps it crisp at any rendered size.
    expect(svg).toMatch(/viewBox="0 0 \d+ \d+"/);
  });

  it("uses currentColor so it inherits the theme", () => {
    // The screen has a light and a dark theme; a hardcoded black QR would be
    // invisible on one of them.
    expect(qrSvg("AWUEHN")).toContain("currentColor");
  });

  it("draws the light modules as a background rather than leaving them clear", () => {
    // A QR on a dark background with no light fill is unreadable.
    const svg = qrSvg("AWUEHN");
    expect(svg).toMatch(/<rect[^>]*fill="[^"]*"/);
  });

  it("contains no script or foreign content", () => {
    // It is injected as markup, so it must be inert.
    const svg = qrSvg("https://x.test/t/AWUEHN/join");
    expect(svg).not.toMatch(/<script|onload=|foreignObject/i);
  });
});
