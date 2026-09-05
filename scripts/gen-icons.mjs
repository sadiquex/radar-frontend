/**
 * Generates the Radar icon set from one geometry definition.
 *
 * Run with `npm run icons`. Every asset is a rendering of the same two
 * drawings, so a change to the mark cannot land in the favicon and miss the
 * home screen. `lib/__tests__/icons.test.ts` guards the output.
 *
 * The two drawings exist because one cannot do both jobs. Below roughly 40px
 * the full mark's two rings and two contacts collapse into a smudge, so
 * anything small gets the reduced glyph: one ring, you, and a single contact.
 * That contact is what keeps the small size Radar rather than a generic
 * bullseye, and of three candidate reductions it was the only one still
 * legible at 16px.
 */
import { writeFileSync, mkdtempSync, copyFileSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const FRONTEND = dirname(dirname(fileURLToPath(import.meta.url)));

// Headless Chrome is the rasteriser because it is the one this machine has:
// no rsvg-convert, no ImageMagick, no sharp. Override with CHROME_PATH.
const CHROME =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!existsSync(CHROME)) {
  console.error(`No Chrome at ${CHROME}. Set CHROME_PATH to a Chrome or Chromium binary.`);
  process.exit(1);
}
const work = mkdtempSync(join(tmpdir(), "radar-icons-"));

// The app's own tokens, read off app/globals.css. Light values are the ones
// with measured contrast on the light ground; dark values likewise.
const LIGHT = { ink: "#15171B", ground: "#F5F3EE", arrived: "#0B6B3A", ahead: "#1B4FA8", behind: "#9C4208" };
const DARK  = { ink: "#ECEAE4", ground: "#0E1116", arrived: "#5BD18A", ahead: "#7FADFF", behind: "#F5904C" };

// --- the two drawings, on a 64 unit grid ------------------------------------

/** The full mark: you at the centre, the group around you, range rings. */
const full = (c) => `
  <circle cx="32" cy="32" r="25" fill="none" stroke="${c.ink}" stroke-opacity=".28" stroke-width="3"/>
  <circle cx="32" cy="32" r="14" fill="none" stroke="${c.ink}" stroke-opacity=".28" stroke-width="3"/>
  <circle cx="47" cy="19" r="4.5" fill="${c.ahead}"/>
  <circle cx="17" cy="43" r="4.5" fill="${c.behind}"/>
  <circle cx="32" cy="32" r="5.5" fill="${c.arrived}"/>
  <circle cx="32" cy="32" r="9" fill="none" stroke="${c.ink}" stroke-width="2.5"/>`;

/**
 * The reduced glyph, for 32px and below. One ring, you, and a single contact
 * riding the ring — the contact is what keeps it Radar and not a target, and
 * it was the only one of three candidate reductions still legible at 16px.
 */
const reduced = (c) => `
  <circle cx="32" cy="32" r="21" fill="none" stroke="${c.ink}" stroke-opacity=".45" stroke-width="6"/>
  <circle cx="32" cy="32" r="9.5" fill="${c.arrived}"/>
  <circle cx="47.5" cy="16.5" r="7.5" fill="${c.ahead}"/>`;

/** Scales a drawing about the centre, to leave a tile the padding it needs. */
const inset = (body, scale) =>
  `<g transform="translate(32 32) scale(${scale}) translate(-32 -32)">${body}</g>`;

// --- the theme-aware favicon ------------------------------------------------

// A favicon inherits no colour from the page, so both themes are declared here
// and `currentColor` is never used.
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Radar">
  <title>Radar</title>
  <style>
    .ring { stroke: ${LIGHT.ink}; stroke-opacity: .45 }
    .you { fill: ${LIGHT.arrived} }
    .contact { fill: ${LIGHT.ahead} }
    @media (prefers-color-scheme: dark) {
      .ring { stroke: ${DARK.ink} }
      .you { fill: ${DARK.arrived} }
      .contact { fill: ${DARK.ahead} }
    }
  </style>
  <circle class="ring" cx="32" cy="32" r="21" fill="none" stroke-width="6"/>
  <circle class="you" cx="32" cy="32" r="9.5"/>
  <circle class="contact" cx="47.5" cy="16.5" r="7.5"/>
</svg>
`;
writeFileSync(join(FRONTEND, "app", "icon.svg"), faviconSvg);

// The same mark as a full-size brand asset, for anywhere a vector is wanted.
const markSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Radar">
  <title>Radar</title>
  <style>
    .ink { stroke: ${LIGHT.ink} }
    .you { fill: ${LIGHT.arrived} }
    .ahead { fill: ${LIGHT.ahead} }
    .behind { fill: ${LIGHT.behind} }
    @media (prefers-color-scheme: dark) {
      .ink { stroke: ${DARK.ink} }
      .you { fill: ${DARK.arrived} }
      .ahead { fill: ${DARK.ahead} }
      .behind { fill: ${DARK.behind} }
    }
  </style>
  <circle class="ink" cx="32" cy="32" r="25" fill="none" stroke-opacity=".28" stroke-width="3"/>
  <circle class="ink" cx="32" cy="32" r="14" fill="none" stroke-opacity=".28" stroke-width="3"/>
  <circle class="ahead" cx="47" cy="19" r="4.5"/>
  <circle class="behind" cx="17" cy="43" r="4.5"/>
  <circle class="you" cx="32" cy="32" r="5.5"/>
  <circle class="ink" cx="32" cy="32" r="9" fill="none" stroke-width="2.5"/>
</svg>
`;
writeFileSync(join(FRONTEND, "public", "mark.svg"), markSvg);

// --- rasterisation ----------------------------------------------------------

/**
 * Renders one drawing to a PNG at an exact pixel size through headless Chrome,
 * which is the only rasteriser on this machine. The page is sized to the
 * target and scrollbars are hidden so the capture is the icon and nothing else.
 */
function raster({ name, size, body, ground }) {
  const page = `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;overflow:hidden;background:${ground ?? "transparent"}}
    svg{display:block}
  </style><svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">${body}</svg>`;

  const html = join(work, `${name}.html`);
  const out = join(work, `${name}.png`);
  writeFileSync(html, page);

  execFileSync(CHROME, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--default-background-color=00000000",
    `--window-size=${size},${size}`,
    `--screenshot=${out}`,
    `file://${html}`,
  ], { stdio: "pipe" });

  const buf = readFileSync(out);
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  if (w !== size || h !== size) throw new Error(`${name}: got ${w}x${h}, wanted ${size}x${size}`);
  return out;
}

// A brand tile is a fixed object, not a theme-aware one: it sits on whatever
// wallpaper the phone has, so it gets one ground and has to survive all of
// them. Measured at 60px against a colourful, a near-black and a pale
// wallpaper: the dark ground disappears entirely on a dark wallpaper, leaving
// rings floating with no tile. Cream holds on all three, and it is also the
// manifest's background_color, so the icon flows straight into the splash.
const TILE = LIGHT;

const targets = [
  // purpose "any": drawn as-is, so the mark needs its own padding.
  { name: "icon-192", size: 192, body: inset(full(TILE), 0.78), ground: TILE.ground,
    dest: join(FRONTEND, "public", "icon-192.png") },
  { name: "icon-512", size: 512, body: inset(full(TILE), 0.78), ground: TILE.ground,
    dest: join(FRONTEND, "public", "icon-512.png") },

  // purpose "maskable": Android crops to an arbitrary shape, so everything
  // that matters has to sit inside the middle two thirds.
  { name: "icon-maskable-512", size: 512, body: inset(full(TILE), 0.66), ground: TILE.ground,
    dest: join(FRONTEND, "public", "icon-maskable-512.png") },

  // iOS: the whole story on iPhone, since Safari ignores the manifest. Opaque
  // and full bleed — iOS applies its own corner radius.
  { name: "apple-icon", size: 180, body: inset(full(TILE), 0.74), ground: TILE.ground,
    dest: join(FRONTEND, "app", "apple-icon.png") },

  // Android notification badge: only the alpha channel is used, so this is a
  // white silhouette of the reduced glyph on transparency.
  { name: "icon-badge", size: 96,
    body: reduced({ ink: "#FFFFFF", arrived: "#FFFFFF", ahead: "#FFFFFF" }),
    dest: join(FRONTEND, "public", "icon-badge.png") },
];

for (const t of targets) {
  copyFileSync(raster(t), t.dest);
  console.log(`  ${t.dest.replace(FRONTEND + "/", "")}  ${t.size}x${t.size}`);
}
console.log("  app/icon.svg\n  public/mark.svg");
