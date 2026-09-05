import QRCode from "qrcode";

/**
 * Real, scannable QR codes.
 *
 * The screen used to show a decorative grid that looked like a QR and was not
 * one. This is the actual encoder, and it is covered by a test that decodes
 * the output with a real reader rather than checking that markup appeared.
 */

// Four modules is the spec's minimum; below it many scanners simply refuse.
export const QUIET_ZONE_MODULES = 4;

// Medium recovers ~15% damage, which is the right trade for a code shown on a
// screen or a printed sheet: enough for glare and thumbprints without inflating
// the module count so far that it stops resolving on a small phone display.
const ERROR_CORRECTION = "M" as const;

export interface QrMatrix {
  size: number;
  dark: (x: number, y: number) => boolean;
}

export function qrModules(text: string): QrMatrix {
  const qr = QRCode.create(text, { errorCorrectionLevel: ERROR_CORRECTION });
  const { size, data } = qr.modules;
  return {
    size,
    dark: (x: number, y: number) => data[y * size + x] === 1,
  };
}

/**
 * An SVG string for the code, in module units.
 *
 * `currentColor` rather than a fixed black: this screen has a light and a dark
 * theme, and a hardcoded colour would be invisible in one of them. The light
 * modules are painted explicitly for the same reason — a transparent QR on a
 * dark ground does not read.
 */
export function qrSvg(text: string): string {
  const { size, dark } = qrModules(text);
  const span = size + QUIET_ZONE_MODULES * 2;

  // One path for every dark module, which keeps the markup small and lets a
  // single fill carry the theme colour.
  let path = "";
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (dark(x, y)) {
        path += `M${x + QUIET_ZONE_MODULES} ${y + QUIET_ZONE_MODULES}h1v1h-1z`;
      }
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${span} ${span}" ` +
    `shape-rendering="crispEdges" role="img" aria-label="QR code to join this trip">` +
    `<rect width="${span}" height="${span}" fill="var(--qr-bg, #FFFFFF)"/>` +
    `<path d="${path}" fill="currentColor"/>` +
    `</svg>`
  );
}
