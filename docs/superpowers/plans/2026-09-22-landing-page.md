# Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a marketing landing page at `/` that demonstrates the verdict engine by running it, and relocate the app to `/app` without breaking a single share link.

**Architecture:** The app moves one segment down so `/` is free. The landing page is three components plus one pure module: `lib/landing/convoy.ts` scripts four riders along a route, and `computeStatuses` + `computeVerdict` — the app's own engine, untouched — turn those coordinates into the headline the page displays. The hero borrows the audited dark palette by joining a `.gt-night` class onto the existing `[data-theme="dark"]` token block.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Tailwind (layout only) with inline `style={{}}` referencing `C`/`FONT`, Vitest (node environment). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-22-landing-page-design.md`

## Global Constraints

- **Run everything from `frontend/`.** The git repo and `package.json` live there, not at the parent directory.
- **The bar is four green after every task:** `npx tsc --noEmit`, `npm test`, `npm run lint`, `npm run build`.
- **Never run `npm run build` while `npm run dev` is running.** The build overwrites `.next` under the dev server and every dynamic route 404s. Stop dev, `rm -rf .next`, build.
- **Never run two dev servers for this repo at once.** They share one `.next` and the second wedges the first.
- **Colours are CSS custom property references, never hex.** `C.ground` is the literal string `"var(--c-ground)"`. Colour arithmetic in JS is impossible; use the declared `--c-*-soft` tokens or `STATUS[s].soft`.
- **No `fontSize` below 12** anywhere under `app/components/` — `lib/__tests__/tokens.test.ts` enforces it and Task 3 extends that enforcement to subdirectories.
- **Heights are `100dvh`, never `100vh`.**
- **Styling convention:** inline `style={{...}}` referencing `C`/`FONT`, not Tailwind colour utilities. Tailwind is for layout (`flex`, `grid`, `gap-*`) only.
- **Product name comes from `PRODUCT_NAME` in `lib/brand.ts`.** Never hardcode "Radar" in user-visible text.
- **Deep links `/join` and `/t/[code]/join` must not move.** A share link is `${origin}/t/${code}/join` and codes are already in the wild.
- **Vitest runs in the `node` environment** with `include: ["**/*.test.ts"]`. A `.test.tsx` file is silently not collected — do not write one.
- **`vitest.config.ts` declares no `@/` alias.** Anything under `lib/` imports relatively (`../geo`, `../../status`), because those modules are pulled into tests. Components under `app/` may keep `@/lib/...`: they are `.tsx` and never collected.
- **Commit after every task.** Commit messages end with the `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` trailer.

---

### Task 1: Move the app to `/app`

Indivisible: a half-finished move leaves the app broken at every route. No test is written first because this task adds no behaviour — its verification is that the router still resolves every route and the four-green bar stays green.

**Files:**
- Move: `app/(tabs)/` → `app/app/(tabs)/` (6 page/layout files)
- Move: `app/trips/[tripId]/page.tsx` → `app/app/trips/[tripId]/page.tsx`
- Modify: `app/components/JoinFlow.tsx`, `app/components/TabBar.tsx`
- Modify: `public/manifest.json`
- Modify: `CLAUDE.md` (the Architecture section lists the routes)

**Interfaces:**
- Consumes: nothing
- Produces: the route surface every later task links into — `/app`, `/app/trips`, `/app/you`, `/app/repairs`, `/app/t/[code]`, `/app/trips/[tripId]`, with `/join` and `/t/[code]/join` unmoved.

- [ ] **Step 1: Record the routes that exist now, to compare against later**

```bash
cd /Users/ibrahim/Desktop/codes/personal/frontend-web/active-radar/frontend
pgrep -f next-server && echo "STOP: a dev server is running, kill it first" || echo "clear"
find app -name 'page.tsx' -o -name 'layout.tsx' | sort
```

Expected: nine files — the root layout, six under `(tabs)`, `trips/[tripId]`, `join`, and `t/[code]/join`.

- [ ] **Step 2: Move the files with `git mv` so history follows**

```bash
mkdir -p app/app
git mv 'app/(tabs)' 'app/app/(tabs)'
mkdir -p app/app/trips
git mv app/trips/[tripId] app/app/trips/[tripId]
rmdir app/trips
find app/app -name 'page.tsx' -o -name 'layout.tsx' | sort
```

Expected: seven files, all under `app/app/`. `app/join/` and `app/t/[code]/join/` are untouched.

- [ ] **Step 3: Fix the relative imports the move broke**

Every moved file gained one directory level. `@/lib/...` alias imports are unaffected — only `../` paths change.

```bash
# (tabs)/page.tsx, trips/page.tsx, you/page.tsx  →  one more ../
sed -i '' 's|"\.\./components/|"../../components/|g; s|"\.\./hooks/|"../../hooks/|g' \
  'app/app/(tabs)/page.tsx' 'app/app/(tabs)/layout.tsx'
sed -i '' 's|"\.\./\.\./components/|"../../../components/|g; s|"\.\./\.\./hooks/|"../../../hooks/|g' \
  'app/app/(tabs)/trips/page.tsx' 'app/app/(tabs)/you/page.tsx' 'app/app/(tabs)/repairs/page.tsx'
sed -i '' 's|"\.\./\.\./\.\./components/|"../../../../components/|g; s|"\.\./\.\./\.\./hooks/|"../../../../hooks/|g' \
  'app/app/(tabs)/t/[code]/page.tsx'
sed -i '' 's|"\.\./\.\./components/|"../../../components/|g; s|"\.\./\.\./hooks/|"../../../hooks/|g' \
  'app/app/trips/[tripId]/page.tsx'
npx tsc --noEmit
```

Expected: PASS. If `tsc` reports an unresolved module, the depth for that file is wrong — count the directories between it and `app/components/` and fix that one file by hand rather than re-running the sed.

- [ ] **Step 4: Repoint every internal link**

`/join` and `` `/t/${code}/join` `` must NOT change. Order matters: rewrite the longer, more specific patterns before the shorter ones.

```bash
FILES=$(find app/app -name '*.tsx'; echo app/components/JoinFlow.tsx)

# `/t/${x}` → `/app/t/${x}`, but never `/t/${x}/join`
perl -pi -e 's{`/t/\$\{([^}]+)\}`}{`/app/t/\$\{$1\}`}g' $FILES

# /trips and /trips/${x}
perl -pi -e 's{`/trips/\$\{([^}]+)\}`}{`/app/trips/\$\{$1\}`}g' $FILES
perl -pi -e 's{"/trips"}{"/app/trips"}g' $FILES

# bare root pushes
perl -pi -e 's{(router\.(?:push|replace)\()"/"\)}{$1"/app")}g' $FILES
```

Then the tab bar's href table by hand — `app/components/TabBar.tsx`:

```ts
const TABS: { key: TabKey; href: string; label: string; icon: typeof Home }[] = [
  { key: "home", href: "/app", label: "Home", icon: Home },
  { key: "trips", href: "/app/trips", label: "Trips", icon: Route },
  // Sits before "You" rather than after it: the first three are things you do,
  // the last is who you are, and a settings tab in the middle of that reads as
  // a mis-tap waiting to happen.
  { key: "repairs", href: "/app/repairs", label: "Repairs", icon: Wrench },
  { key: "you", href: "/app/you", label: "You", icon: User },
];
```

- [ ] **Step 5: Verify no link was missed, and no deep link was damaged**

```bash
echo "--- must be EMPTY (unmigrated links) ---"
grep -rnE 'router\.(push|replace)\("/"\)|"/trips"|`/trips/|`/t/\$\{[^}]+\}`' app/app app/components || echo OK

echo "--- must still exist (deep links, unchanged) ---"
grep -rn 'location.origin}/t/' app/app          # the two share-URL builders
grep -rn '/t/\${found.shareCode}/join' app/app  # the non-member redirect
grep -rn 'push("/join")' app/app                # join-by-code entry
```

Expected: the first block prints `OK`; the other three each print their matches with **no `/app` prefix**. A `/app/t/.../join` anywhere in that output is a bug — revert it.

- [ ] **Step 6: Point the manifest at the app**

`public/manifest.json`: `"start_url": "/"` → `"start_url": "/app"`.

- [ ] **Step 7: Update the route list in `CLAUDE.md`**

In the Architecture section, the bullets naming `app/(tabs)/…` are now stale. Rewrite the paths to `app/app/(tabs)/…` and their URLs to `/app…`, and add one line above them:

```markdown
- `app/page.tsx` — `/`: the marketing landing page. The app lives under `/app`; `/join` and `/t/[code]/join` stay at the root because share links in the wild point at them. See `docs/superpowers/specs/2026-09-22-landing-page-design.md`.
```

- [ ] **Step 8: Verify the whole route surface**

```bash
rm -rf .next && npm run build
```

Expected: build succeeds, and the printed route table contains exactly `/app`, `/app/repairs`, `/app/t/[code]`, `/app/trips`, `/app/trips/[tripId]`, `/app/you`, `/join`, `/t/[code]/join`. There is **no `/` yet** — Task 4 adds it. A `/` appearing here means a stray `app/page.tsx` exists.

- [ ] **Step 9: Four green**

```bash
npx tsc --noEmit && npm test && npm run lint
```

Expected: all PASS. `npm run build` already passed in Step 8.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor: move the app to /app so the root can hold a landing page

/ can hold one page, and a route group cannot resolve the collision —
(tabs) and a marketing group would both claim it. So the app moves down a
segment and the root is left free.

/join and /t/CODE/join deliberately do not move. A share link is
\${origin}/t/\${code}/join and those codes are already in the wild, so
relocating them would break every trip anyone has shared.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The convoy engine

**Files:**
- Create: `lib/landing/convoy.ts`
- Test: `lib/landing/__tests__/convoy.test.ts`

**Interfaces:**
- Consumes: `haversineMeters`, `LatLng` from `../geo`; `Participant` from `../types`; `computeStatuses` from `../../status`; `computeVerdict` from `../../verdict` — **relative, never `@/`**: `vitest.config.ts` declares no alias, so an `@/` import resolves under Next and fails under the test runner
- Produces:
  - `CONVOY_DESTINATION: { name: string; lat: number; lng: number }`
  - `CONVOY_TICKS: number` (72)
  - `VIEWER_ID: string` — deliberately not one of the riders
  - `convoyAt(tick: number, now: number): Participant[]`

**Why the viewer is not a rider.** `computeVerdict` picks its metric anchor from `useGroupReference = !selfLocated || group.some(p => p.id === selfId)`. With a located self it measures the subject against *you* and labels the metric `KM BEHIND YOU`. A page visitor is not in this convoy, so an unlisted `VIEWER_ID` is both the honest framing and the one that yields `KM BEHIND THE GROUP`. It also keeps a fictional "You" row out of the roster and makes `isSelf` unreachable, so no branch can tell a stranger "You have fallen behind".

- [ ] **Step 1: Write the failing test**

Create `lib/landing/__tests__/convoy.test.ts`:

```ts
import { describe, it, expect } from "vitest";
// Relative, not `@/` — vitest.config.ts declares no alias and every existing
// test under lib/ imports relatively. An `@/` here fails to resolve at runtime.
import { convoyAt, CONVOY_DESTINATION, CONVOY_TICKS, VIEWER_ID } from "../convoy";
import { computeStatuses } from "../../status";
import { computeVerdict, type Verdict } from "../../verdict";

const NOW = 1_700_000_000_000;

/** The landing page's own pipeline, run here exactly as the component runs it. */
function verdictAt(tick: number): Verdict {
  const participants = convoyAt(tick, NOW);
  const statuses = computeStatuses(
    participants,
    { lat: CONVOY_DESTINATION.lat, lng: CONVOY_DESTINATION.lng },
    NOW
  );
  return computeVerdict({
    participants,
    statuses,
    selfId: VIEWER_ID,
    destinationName: CONVOY_DESTINATION.name,
    now: NOW,
  });
}

const everyTick = [...Array(CONVOY_TICKS).keys()];

describe("the landing convoy", () => {
  it("puts four riders on the road at every tick, none of them the viewer", () => {
    for (const t of everyTick) {
      const riders = convoyAt(t, NOW);
      expect(riders, `tick ${t}`).toHaveLength(4);
      expect(riders.map((r) => r.id)).not.toContain(VIEWER_ID);
      // computeStatuses drops unlocated members, and a dropped member is an
      // empty roster row on a public page.
      for (const r of riders) {
        expect(r.latitude, `tick ${t}, ${r.displayName}`).not.toBeNull();
        expect(r.longitude, `tick ${t}, ${r.displayName}`).not.toBeNull();
      }
    }
  });

  it("is deterministic", () => {
    expect(convoyAt(20, NOW)).toEqual(convoyAt(20, NOW));
  });

  it("never shows a blank or waiting card", () => {
    for (const t of everyTick) {
      const v = verdictAt(t);
      expect(v.headline, `tick ${t}`).not.toBe("");
      // "Waiting for locations" / "Just you so far" are correct in the app and
      // nonsense on a landing page.
      expect(v.tone, `tick ${t}`).not.toBe("waiting");
    }
  });

  it("nobody is ever stopped — the script would have to stand a rider still", () => {
    for (const t of everyTick) {
      expect(verdictAt(t).status, `tick ${t}`).not.toBe("stopped");
    }
  });

  it("plays the three beats, in order", () => {
    const behind = everyTick.filter((t) => verdictAt(t).status === "behind");
    const together = everyTick.filter((t) => verdictAt(t).eyebrow === "ALL GOOD");
    const arrived = everyTick.filter((t) => verdictAt(t).status === "arrived");

    expect(behind.length, "beat 1 never plays").toBeGreaterThan(0);
    expect(together.length, "beat 2 never plays").toBeGreaterThan(0);
    expect(arrived.length, "beat 3 never plays").toBeGreaterThan(0);

    // Each beat holds long enough to be read at ~600ms/tick.
    for (const [name, beat] of [["behind", behind], ["together", together], ["arrived", arrived]] as const) {
      expect(beat.length, `${name} beat is too short to read`).toBeGreaterThanOrEqual(8);
    }

    expect(Math.max(...behind), "behind must precede together").toBeLessThan(Math.min(...together));
    expect(Math.max(...together), "together must precede arrived").toBeLessThan(Math.min(...arrived));
  });

  it("names Ama, and anchors her gap to the group rather than to the viewer", () => {
    const t = everyTick.find((t) => verdictAt(t).status === "behind")!;
    const v = verdictAt(t);
    expect(v.eyebrow).toBe("HEADS UP");
    expect(v.headline).toMatch(/^Ama is \d+\.\d km back$/);
    // KM BEHIND YOU would mean the viewer leaked into the convoy.
    expect(v.metricLabel).toBe("KM BEHIND THE GROUP");
    expect(v.metric).toMatch(/^\d+\.\d$/);
  });

  it("reads 'All together' with the distance still to run", () => {
    const t = everyTick.find((t) => verdictAt(t).eyebrow === "ALL GOOD")!;
    const v = verdictAt(t);
    expect(v.headline).toBe("All together");
    expect(v.metricLabel).toBe("KM TO AKOSOMBO");
  });

  it("names the single rider who arrives", () => {
    const t = everyTick.find((t) => verdictAt(t).status === "arrived")!;
    const v = verdictAt(t);
    expect(v.eyebrow).toBe("ARRIVED");
    expect(v.headline).toBe("Kofi has arrived");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run lib/landing/__tests__/convoy.test.ts
```

Expected: FAIL — `Failed to resolve import "../convoy"`.

- [ ] **Step 3: Write the implementation**

Create `lib/landing/convoy.ts`:

```ts
// Relative, like every other module under lib/. This file is imported by a
// vitest test and vitest.config.ts declares no `@/` alias, so an alias here
// would resolve under Next and fail under the test runner.
import { haversineMeters, type LatLng } from "../geo";
import type { Participant } from "../types";

/**
 * A scripted convoy for the landing page, and nothing else.
 *
 * The page does not describe what Radar decides — it runs the real engine over
 * these coordinates and prints the answer. So this module's only job is to put
 * four riders somewhere defensible on a road at a given tick; every status and
 * every headline on the page comes from `computeStatuses` and `computeVerdict`
 * reading the output of this file.
 *
 * Positions are authored as **metres still to run**, not as latitudes. That is
 * the quantity `computeStatuses` actually measures — distance to the
 * destination, and separation between riders — so authoring in it means the
 * thresholds in `lib/status.ts` (100 m arrive, 100 m cluster, 150 m
 * ahead/behind margin) can be reasoned about directly while writing the script,
 * instead of being an emergent property of some latitudes.
 *
 * Pure and clock-free: `now` is passed in, the way `HomeDashboard` passes it
 * down, so every value on one paint agrees and the script is testable.
 */

/** Akosombo, as in the launch video. The name is what the verdict speaks. */
export const CONVOY_DESTINATION = { name: "Akosombo", lat: 6.3, lng: 0.05 };

/** Tema, roughly — the far end of the road. Only its direction matters. */
const ORIGIN: LatLng = { lat: 5.67, lng: -0.02 };

const DEST: LatLng = { lat: CONVOY_DESTINATION.lat, lng: CONVOY_DESTINATION.lng };

/** Measured, not asserted, so the interpolation below cannot drift from reality. */
const ROUTE_M = haversineMeters(ORIGIN, DEST);

/**
 * The viewer, who is deliberately **not** one of the riders.
 *
 * `computeVerdict` measures the named rider against the viewer when the viewer
 * has a position, and labels the metric "KM BEHIND YOU". A stranger reading a
 * landing page is not in this convoy: an unlisted id restores "KM BEHIND THE
 * GROUP", keeps a fictional "You" row out of the roster, and makes the `isSelf`
 * branches unreachable so nothing can tell a visitor they have fallen behind.
 */
export const VIEWER_ID = "landing-viewer";

const TRIP_ID = "landing-demo";

/** Metres still to run, per rider, at a keyframe. Interpolated between. */
interface Frame {
  t: number;
  ama: number;
  kofi: number;
  yaw: number;
  esi: number;
}

/**
 * The script. Three beats, each held long enough to read, with the gaps between
 * keyframes doing the travelling.
 *
 * Beat 1 (t 0–~38) — Ama is adrift. She has no neighbour inside the 100 m
 *   cluster radius, and sits more than 150 m beyond the median, so she reads
 *   `behind` while the other three read `with`.
 * Beat 2 (t ~39–62) — she closes up. Every rider is within 100 m of every
 *   other, so all four read `with` and the verdict falls through to
 *   "All together".
 * Beat 3 (t ~63–71) — Kofi crosses the 100 m arrival radius alone. The other
 *   three stay inside 100 m of him, so they stay `with` rather than flickering
 *   to `ahead`, and only Kofi is named.
 */
const FRAMES: Frame[] = [
  { t: 0,  ama: 3400, kofi: 1900, yaw: 1940, esi: 1880 },
  { t: 18, ama: 3020, kofi: 1600, yaw: 1640, esi: 1580 },
  { t: 40, ama: 900,  kofi: 880,  yaw: 920,  esi: 860 },
  { t: 56, ama: 260,  kofi: 200,  yaw: 250,  esi: 255 },
  { t: 64, ama: 180,  kofi: 85,   yaw: 168,  esi: 175 },
  { t: 71, ama: 150,  kofi: 60,   yaw: 140,  esi: 146 },
];

export const CONVOY_TICKS = FRAMES[FRAMES.length - 1].t + 1;

const RIDERS = [
  { id: "demo-ama", displayName: "Ama", key: "ama" },
  { id: "demo-kofi", displayName: "Kofi", key: "kofi" },
  { id: "demo-yaw", displayName: "Yaw", key: "yaw" },
  { id: "demo-esi", displayName: "Esi", key: "esi" },
] as const;

const lerp = (a: number, b: number, f: number) => a + (b - a) * f;

/**
 * A point that many metres short of the destination, along the road.
 *
 * Linear interpolation of latitude and longitude rather than a great-circle
 * walk: over a 70 km leg the two agree to well under a metre, and every
 * threshold this script plays against is 100 m or wider.
 */
function pointAt(metresToGo: number): LatLng {
  const f = metresToGo / ROUTE_M;
  return {
    lat: lerp(DEST.lat, ORIGIN.lat, f),
    lng: lerp(DEST.lng, ORIGIN.lng, f),
  };
}

/** The two keyframes surrounding `tick`, and how far between them it sits. */
function span(tick: number): { from: Frame; to: Frame; f: number } {
  const t = Math.min(Math.max(tick, 0), CONVOY_TICKS - 1);
  let i = 0;
  while (i < FRAMES.length - 2 && FRAMES[i + 1].t <= t) i += 1;
  const from = FRAMES[i];
  const to = FRAMES[i + 1];
  return { from, to, f: (t - from.t) / (to.t - from.t) };
}

/**
 * The convoy at `tick`.
 *
 * `lastMovedAt` is always recent: `isStopped` fires at five minutes without
 * movement, and a rider who goes `stopped` mid-script would hand the page an
 * alarm-toned verdict it never earned.
 */
export function convoyAt(tick: number, now: number): Participant[] {
  const { from, to, f } = span(tick);
  return RIDERS.map((rider) => {
    const pos = pointAt(lerp(from[rider.key], to[rider.key], f));
    return {
      id: rider.id,
      tripId: TRIP_ID,
      displayName: rider.displayName,
      latitude: pos.lat,
      longitude: pos.lng,
      // Status is derived, never stored — the app writes null here too.
      status: null,
      lastMovedAt: now - 1_000,
      lastSeenAt: now - 1_000,
    };
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run lib/landing/__tests__/convoy.test.ts
```

Expected: PASS, 8 tests.

If "beat is too short to read" fails, widen that beat by moving the neighbouring keyframe `t` values apart — do not weaken the assertion. If `metricLabel` comes back `KM BEHIND YOU`, `VIEWER_ID` has leaked into `RIDERS`.

- [ ] **Step 5: Four green, then commit**

```bash
npx tsc --noEmit && npm test && npm run lint
git add lib/landing
git commit -m "feat: script a convoy for the landing page to run the engine over

The page will not describe what Radar decides; it runs computeStatuses and
computeVerdict over these coordinates and prints the answer, so a threshold
change in lib/status.ts moves the marketing copy with it.

Positions are authored as metres still to run rather than as latitudes,
because metres are what computeStatuses measures — the 100m arrive, 100m
cluster and 150m ahead/behind thresholds can then be reasoned about while
writing the script instead of emerging from some coordinates.

The viewer id is deliberately not one of the riders. computeVerdict
measures the named rider against the viewer when the viewer has a
position and says 'KM BEHIND YOU'; a stranger reading the page is not in
this convoy.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The night ground, and a guard that reaches into subdirectories

Both halves are edits to the safety net, and both must land before any landing component exists — otherwise the first component written is the one that slips past the type-scale floor.

**Files:**
- Modify: `app/globals.css` (one selector line)
- Modify: `lib/__tests__/tokens.test.ts` (recursive enumeration + one new assertion)

**Interfaces:**
- Consumes: nothing
- Produces: the `.gt-night` class — put it on any element and everything inside it resolves the audited dark palette, in either theme.

- [ ] **Step 1: Write the failing assertion for the shared block**

In `lib/__tests__/tokens.test.ts`, inside `describe("theme declaration hygiene", ...)`, add:

```ts
  it("shares one declaration block between the dark theme and the night section", () => {
    // The landing hero must be dark inside a light page, and :root[data-theme]
    // matches only <html>. A second block repeating thirty values would drift,
    // and only one of the two copies is contrast-tested above. `.gt-night` is
    // written on the line ABOVE the selector so the literal string the parser
    // searches for is still present verbatim.
    expect(css).toMatch(/\.gt-night,\s*\n:root\[data-theme="dark"\] \{/);
  });
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run lib/__tests__/tokens.test.ts -t "shares one declaration block"
```

Expected: FAIL — the pattern is not in `globals.css` yet.

- [ ] **Step 3: Add `.gt-night` to the existing dark block**

In `app/globals.css`, find `:root[data-theme="dark"] {` (the explicit block, *not* the one inside `@media`) and put `.gt-night,` on the line above it with the comment:

```css
/* The night ground, for a section that must stay dark inside a light page —
   the landing hero. A second selector rather than a copy: two copies of thirty
   values drift, and `tokens.test.ts` only contrast-tests one of them. Custom
   properties resolve from the nearest declaring ancestor, so a `.gt-night`
   section beats :root in either theme, and in dark mode it declares identical
   values and changes nothing.

   `.gt-night` is written FIRST so the literal `:root[data-theme="dark"] {`
   that tokens.test.ts searches for is still present verbatim. */
.gt-night,
:root[data-theme="dark"] {
  color-scheme: dark;
  --c-ground: #0E1116;
  /* …every existing declaration unchanged… */
}
```

Nothing inside the block changes. `html, body` no longer paints this section's background, so any `.gt-night` element sets its own `background: var(--c-ground)`.

- [ ] **Step 4: Run the whole token suite**

```bash
npx vitest run lib/__tests__/tokens.test.ts
```

Expected: PASS, including the pre-existing "keeps the two dark blocks identical" test. If the *contrast* tests start failing, `.gt-night` was written below the selector instead of above it and the parser is now slicing the wrong block.

- [ ] **Step 5: Make the component scan recursive**

In the same file, replace the `SCREENS` enumeration in `describe("type scale floor", ...)`:

```ts
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
```

- [ ] **Step 6: Prove the scan actually reaches a subdirectory**

A guard that silently matches nothing passes every assertion under it, so plant an offender and confirm it is caught.

```bash
mkdir -p app/components/landing
printf 'export const Guard = () => <span style={{ fontSize: 9 }}>x</span>;\n' \
  > app/components/landing/_guardcheck.tsx
npx vitest run lib/__tests__/tokens.test.ts -t "has no type below 12px"
```

Expected: **FAIL**, naming `landing/_guardcheck.tsx`. That failure is the proof the guard works.

```bash
rm app/components/landing/_guardcheck.tsx
npx vitest run lib/__tests__/tokens.test.ts
```

Expected: PASS. The directory stays (empty) for Task 4.

- [ ] **Step 7: Four green, then commit**

```bash
npx tsc --noEmit && npm test && npm run lint && rm -rf .next && npm run build
git add app/globals.css lib/__tests__/tokens.test.ts
git commit -m "feat: a night ground for a dark section inside a light page

The landing hero has to be dark whatever theme the visitor is in, and
:root[data-theme=\"dark\"] matches only <html>. .gt-night joins that block
as a second selector rather than copying thirty values, because only one
of two copies would be contrast-tested and the other would drift.

It is written above the selector so tokens.test.ts still finds the
literal string it parses for, which was checked by running that parser
over the patched sheet: 35 tokens, identical values, hygiene intact.

Also makes the type-scale scan recursive. It was readdirSync at one
level, so anything under components/landing/ would have been unguarded —
the same failure as the hand-written list that scan already replaced.
Verified by planting a 9px offender in a subdirectory and watching it
fail.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Act I — the hero

**Files:**
- Create: `app/page.tsx`
- Create: `app/components/landing/Hero.tsx`
- Modify: `app/globals.css` (the CTA-swap classes)

**Interfaces:**
- Consumes: `C`, `FONT`, `Mark` from `../Radar`; `LiveScope` from `../LiveScope`; `Contact` from `@/lib/pulse`; `PRODUCT_NAME` from `@/lib/brand`
- Produces: `<Hero />`, and `app/page.tsx` as the assembly point Tasks 5 and 6 add sections to.

- [ ] **Step 1: Add the CTA-swap classes to `app/globals.css`**

Append, next to the `.gt-tabbar` rules it mirrors:

```css
/* The landing's primary call to action reads "Start a trip" for a stranger and
   "Open Radar" for somebody whose browser has been signed in. Both labels are
   in the markup and CSS chooses, for the same reason `.gt-tabbar` does it this
   way: deciding in React means the server renders one label and the client
   renders another on its first pass, and React responds to that mismatch by
   discarding the whole server document — which throws away whatever
   THEME_BOOTSTRAP had just set. See lib/accountFlag.ts. */
.gt-cta-returning { display: none; }
[data-signed-in="1"] .gt-cta-new { display: none; }
[data-signed-in="1"] .gt-cta-returning { display: inline; }
```

- [ ] **Step 2: Write the hero**

Create `app/components/landing/Hero.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CornerDownLeft } from "lucide-react";
import { C, FONT, Mark } from "../Radar";
import { LiveScope } from "../LiveScope";
import type { Contact } from "@/lib/pulse";
import { PRODUCT_NAME } from "@/lib/brand";

/**
 * Act I: the scope.
 *
 * Dark whatever theme the visitor is in, via `.gt-night` — the app's own
 * audited dark palette, not a second one. The argument the page makes is that
 * Radar is an instrument, and an instrument's glow does not read on the cream
 * ground the app defaults to. Act II crosses back to that ground, which is the
 * honest thing to do: it is what you actually get.
 */

/**
 * Contacts arriving on the ring, one at a time — the page joining its own trip.
 * Angles are arbitrary and only have to be stable; `memberCount` drives the dot
 * size inside LiveScope, which saturates at three.
 */
const ARRIVALS: Contact[] = [
  { tripId: "l-1", radius: 0.86, angle: -0.95, status: "ahead", memberCount: 1, located: true },
  { tripId: "l-2", radius: 0.52, angle: 2.15, status: "with", memberCount: 2, located: true },
  { tripId: "l-3", radius: 0.93, angle: 3.85, status: "behind", memberCount: 1, located: true },
  { tripId: "l-4", radius: 0.3, angle: 5.42, status: "arrived", memberCount: 3, located: true },
];

const ARRIVAL_MS = 900;

export function Hero() {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    // Reduced motion gets the finished field rather than an empty one: the
    // global CSS override collapses durations, but this is a JS timer and
    // would otherwise still tick.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(ARRIVALS.length);
      return;
    }
    if (shown >= ARRIVALS.length) return;
    const timer = setTimeout(() => setShown((n) => n + 1), ARRIVAL_MS);
    return () => clearTimeout(timer);
  }, [shown]);

  return (
    <section
      className="gt-night relative"
      style={{ background: C.ground, color: C.text }}
    >
      <div className="mx-auto w-full max-w-[1200px] px-6">
        <nav className="flex items-center justify-between" style={{ paddingTop: 28 }}>
          <span className="flex items-center gap-2">
            <Mark size={20} />
            <span style={{ fontFamily: FONT.display, fontWeight: 600, fontSize: 17, letterSpacing: "-0.02em" }}>
              {PRODUCT_NAME}
            </span>
          </span>
          <Link
            href="/app"
            style={{ fontFamily: FONT.body, fontSize: 15, color: C.muted, padding: "12px 4px" }}
          >
            <span className="gt-cta-new">Open the app</span>
            <span className="gt-cta-returning">Open {PRODUCT_NAME}</span>
          </Link>
        </nav>

        <div className="grid items-center gap-12 md:grid-cols-[1.1fr_0.9fr]" style={{ padding: "clamp(48px, 9vh, 104px) 0" }}>
          <div>
            <p
              style={{
                fontFamily: FONT.mono, fontSize: 12, fontWeight: 500,
                letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted,
              }}
            >
              Temporary location sharing
            </p>

            <h1
              style={{
                fontFamily: FONT.display, fontWeight: 500,
                fontSize: "clamp(2.75rem, 7vw, 6rem)", lineHeight: 0.98,
                letterSpacing: "-0.04em", marginTop: 20,
              }}
            >
              Know where<br />everyone is.<br />
              <span style={{ color: C.muted }}>Without the calls.</span>
            </h1>

            <p
              style={{
                fontFamily: FONT.body, color: C.muted, marginTop: 24, maxWidth: "46ch",
                fontSize: "clamp(1rem, 1.2vw, 1.1875rem)", lineHeight: 1.55,
              }}
            >
              For groups moving together — a cycling group, a convoy, a hiking party. Join from a
              link in seconds, with nothing to install. Every trip expires in 8 hours.
            </p>

            <div className="flex flex-wrap gap-3" style={{ marginTop: 34 }}>
              <Link
                href="/app"
                className="inline-flex items-center justify-center gap-2"
                style={{
                  fontFamily: FONT.body, fontSize: 16, fontWeight: 600,
                  background: C.text, color: C.ground,
                  borderRadius: 14, padding: "0 24px", minHeight: 52,
                }}
              >
                <span className="gt-cta-new">Start a trip</span>
                <span className="gt-cta-returning">Open {PRODUCT_NAME}</span>
                <ArrowRight size={19} />
              </Link>
              <Link
                href="/join"
                className="inline-flex items-center justify-center gap-2"
                style={{
                  fontFamily: FONT.body, fontSize: 16, fontWeight: 600,
                  color: C.text, border: `1px solid ${C.lineStrong}`,
                  borderRadius: 14, padding: "0 24px", minHeight: 52,
                }}
              >
                Join with a code
                <CornerDownLeft size={19} />
              </Link>
            </div>

            {/* Not "no account needed". Google sign-in exists and `signInAvailable`
                is true whenever the API and a client id are configured; claiming
                otherwise misrepresents the product. The accounts section in
                Sections.tsx carries the full story. */}
            <p style={{ fontFamily: FONT.body, fontSize: 13, color: C.faint, marginTop: 18 }}>
              Nothing to install. An account is optional.
            </p>
          </div>

          <div className="grid place-items-center">
            <LiveScope contacts={ARRIVALS.slice(0, shown)} size="min(420px, 78vw)" />
          </div>
        </div>

        <p
          style={{
            fontFamily: FONT.display, fontWeight: 500,
            fontSize: "clamp(1.5rem, 3.2vw, 2.5rem)", lineHeight: 1.15,
            letterSpacing: "-0.03em", color: C.text,
            borderTop: `1px solid ${C.line}`, paddingTop: 32, paddingBottom: 56, maxWidth: "20ch",
          }}
        >
          A map full of pins <span style={{ color: C.muted }}>answers nothing.</span>
        </p>
      </div>

      {/* The horizon: the cut from night to the daylight ground the app uses. */}
      <div style={{ height: 1, background: C.arrived, opacity: 0.55 }} />
    </section>
  );
}
```

- [ ] **Step 3: Create the page**

Create `app/page.tsx`:

```tsx
import { Hero } from "./components/landing/Hero";

/**
 * The landing page.
 *
 * A server component that assembles the acts; only the pieces that animate are
 * client components. It inherits the root layout, so it gets the fonts, the
 * pre-paint theme bootstrap and the safe-area insets for free.
 */
export default function LandingPage() {
  return (
    <main>
      <Hero />
    </main>
  );
}
```

- [ ] **Step 4: Verify the route exists and the hero renders dark**

```bash
rm -rf .next && npm run build
```

Expected: the route table now lists `/` alongside `/app` and the rest.

Then, in a dev server (`npm run dev`, and only one at a time), open `http://localhost:3000`:
- the hero is `#0E1116` **even with the OS in light mode** — this is the `.gt-night` inheritance working
- four contacts arrive on the ring, about 900 ms apart
- the CTA reads "Start a trip"; running `localStorage.setItem("gt:signedIn","1")` in the console and reloading makes it read "Open Radar" with no flash
- `/app` still loads the app

- [ ] **Step 5: Four green, then commit**

```bash
npx tsc --noEmit && npm test && npm run lint
git add app/page.tsx app/components/landing/Hero.tsx app/globals.css
git commit -m "feat: act I of the landing page — the scope

Dark whatever theme the visitor is in, because an instrument's glow does
not read on the cream ground the app defaults to. Act II crosses back to
that ground, which is the honest thing to do: it is what you get.

The primary CTA carries both labels and lets CSS choose between them off
the pre-paint data-signed-in flag. Deciding in React would mean the
server and client render different trees and React would discard the
server document, undoing THEME_BOOTSTRAP — accountFlag.ts already
documents that failure.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Act II §1 — the verdict, running

The centrepiece. Every word in the card comes from the engine.

**Files:**
- Create: `app/components/landing/VerdictDemo.tsx`
- Modify: `app/page.tsx` (mount it)

**Interfaces:**
- Consumes: `convoyAt`, `CONVOY_DESTINATION`, `CONVOY_TICKS`, `VIEWER_ID` from `@/lib/landing/convoy`; `computeStatuses` from `@/lib/status`; `computeVerdict` from `@/lib/verdict`; `C`, `FONT`, `STATUS`, `Glyph` from `../Radar`
- Produces: `<VerdictDemo />`

- [ ] **Step 1: Write the component**

Create `app/components/landing/VerdictDemo.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { C, FONT, STATUS, Glyph } from "../Radar";
import { convoyAt, CONVOY_DESTINATION, CONVOY_TICKS, VIEWER_ID } from "@/lib/landing/convoy";
import { computeStatuses } from "@/lib/status";
import { computeVerdict } from "@/lib/verdict";

/**
 * Act II, §1: the engine, running.
 *
 * Nothing here is copy. The eyebrow, the headline, the metric and every status
 * word are `computeVerdict` and `computeStatuses` reading scripted coordinates
 * out of `lib/landing/convoy.ts` — the same two functions the trip screen
 * calls. If somebody retunes AHEAD_BEHIND_MARGIN_M, this page changes with it,
 * which is the point: a marketing claim that can go stale is a marketing claim
 * that will.
 *
 * `aria-hidden`, and deliberately not a live region. A headline that rewrites
 * itself every 600ms would be announced every 600ms. The static sentence
 * beside it carries the same information for a screen reader.
 */

const TICK_MS = 600;

/** The beat to hold on when motion is unwelcome: Ama adrift, the clearest one. */
const STILL_TICK = 18;

/** Fixed domain for the horizon, so the strip does not rescale under the dots. */
const HORIZON_KM = 3.6;

export function VerdictDemo() {
  const [tick, setTick] = useState(STILL_TICK);
  const [running, setRunning] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);

  // A setInterval driving a demo nobody is looking at is a battery cost, and
  // this page is mostly read on a phone.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const io = new IntersectionObserver(
      ([entry]) => setRunning(entry.isIntersecting),
      { threshold: 0.25 }
    );
    io.observe(host);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setTick((t) => (t + 1) % CONVOY_TICKS), TICK_MS);
    return () => clearInterval(timer);
  }, [running]);

  const { verdict, rows } = useMemo(() => {
    // One `now` for the whole frame, so every derived value on this paint
    // agrees — the convention HomeDashboard already follows.
    const now = Date.now();
    const participants = convoyAt(tick, now);
    const statuses = computeStatuses(
      participants,
      { lat: CONVOY_DESTINATION.lat, lng: CONVOY_DESTINATION.lng },
      now
    );
    return {
      verdict: computeVerdict({
        participants,
        statuses,
        selfId: VIEWER_ID,
        destinationName: CONVOY_DESTINATION.name,
        now,
      }),
      rows: participants.map((p, i) => ({
        id: p.id,
        name: p.displayName,
        slot: i % 8,
        status: statuses[p.id]?.status ?? "with",
        kmLeft: statuses[p.id]?.kmLeft ?? 0,
      })),
    };
  }, [tick]);

  return (
    <section style={{ background: C.ground, color: C.text }}>
      <div className="mx-auto w-full max-w-[1200px] px-6" style={{ padding: "clamp(64px, 10vh, 120px) 24px" }}>
        <div className="grid gap-12 md:grid-cols-[0.85fr_1.15fr] md:items-center">
          <div>
            <p
              style={{
                fontFamily: FONT.mono, fontSize: 12, fontWeight: 500,
                letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted,
              }}
            >
              The whole group, in one line
            </p>
            <h2
              style={{
                fontFamily: FONT.display, fontWeight: 500, marginTop: 18,
                fontSize: "clamp(2rem, 4vw, 3.25rem)", lineHeight: 1.05, letterSpacing: "-0.03em",
              }}
            >
              A map shows you dots.<br />
              <span style={{ color: C.muted }}>Radar tells you what they mean.</span>
            </h2>
            <p
              style={{
                fontFamily: FONT.body, color: C.muted, marginTop: 22, maxWidth: "42ch",
                fontSize: "clamp(1rem, 1.2vw, 1.1875rem)", lineHeight: 1.55,
              }}
            >
              Everyone&rsquo;s position reduced to one sentence and one number, because a rider at
              effort reads one field, not eight. This is the engine running, not a recording —
              four riders on the road to {CONVOY_DESTINATION.name}: one falls back and catches up,
              then another reaches the destination.
            </p>
          </div>

          <div
            ref={hostRef}
            aria-hidden
            style={{
              background: C.raised, border: `1px solid ${C.line}`,
              borderRadius: 22, padding: "clamp(24px, 3vw, 38px)",
            }}
          >
            <p
              style={{
                fontFamily: FONT.mono, fontSize: 12, fontWeight: 500,
                letterSpacing: "0.14em", textTransform: "uppercase",
                color: verdict.status ? STATUS[verdict.status].color : C.muted,
              }}
            >
              {verdict.eyebrow}
            </p>

            <p
              style={{
                fontFamily: FONT.display, fontWeight: 500, marginTop: 10,
                fontSize: "clamp(1.6rem, 3vw, 2.4rem)", lineHeight: 1.1, letterSpacing: "-0.03em",
              }}
            >
              {verdict.headline}
            </p>

            {verdict.metric !== null && (
              <div className="flex items-baseline gap-3" style={{ marginTop: 18 }}>
                <span
                  className="tnum"
                  style={{
                    fontFamily: FONT.display, fontWeight: 600,
                    fontSize: "clamp(2.6rem, 5vw, 4rem)", lineHeight: 1, letterSpacing: "-0.04em",
                  }}
                >
                  {verdict.metric}
                </span>
                <span
                  style={{
                    fontFamily: FONT.mono, fontSize: 12, fontWeight: 500,
                    letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted,
                  }}
                >
                  {verdict.metricLabel}
                </span>
              </div>
            )}

            {/* The horizon: everyone's place along the road, left to right. */}
            <div style={{ marginTop: 34 }}>
              <div className="relative" style={{ height: 30 }}>
                <div
                  className="absolute left-0 right-0"
                  style={{ top: "50%", height: 2, background: C.line }}
                />
                {rows.map((r) => {
                  const x = Math.min(Math.max(1 - r.kmLeft / HORIZON_KM, 0), 1);
                  return (
                    <span
                      key={r.id}
                      className="absolute grid place-items-center"
                      style={{
                        left: `${x * 100}%`, top: "50%", transform: "translate(-50%,-50%)",
                        width: 22, height: 22, borderRadius: 999,
                        background: STATUS[r.status].color, color: C.raised,
                        transition: "left 560ms linear",
                      }}
                    >
                      <Glyph s={r.status} size={12} />
                    </span>
                  );
                })}
              </div>
              <div className="flex justify-between" style={{ marginTop: 6 }}>
                {["Start", CONVOY_DESTINATION.name].map((label) => (
                  <span
                    key={label}
                    style={{
                      fontFamily: FONT.mono, fontSize: 12, letterSpacing: "0.12em",
                      textTransform: "uppercase", color: C.faint,
                    }}
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 26, borderTop: `1px solid ${C.line}` }}>
              {rows.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-3"
                  style={{ padding: "13px 0", borderBottom: `1px solid ${C.line}` }}
                >
                  <span
                    className="grid place-items-center shrink-0"
                    style={{
                      width: 32, height: 32, borderRadius: 999,
                      background: `var(--c-av-${r.slot})`, color: `var(--c-av-${r.slot}-ink)`,
                      fontFamily: FONT.body, fontSize: 13, fontWeight: 600,
                    }}
                  >
                    {r.name.slice(0, 1)}
                  </span>
                  <span style={{ fontFamily: FONT.body, fontSize: 16, flex: 1 }}>{r.name}</span>
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full"
                    style={{
                      background: STATUS[r.status].soft, color: STATUS[r.status].color,
                      fontFamily: FONT.body, fontSize: 13, fontWeight: 600, padding: "5px 11px",
                    }}
                  >
                    <Glyph s={r.status} size={12} />
                    {STATUS[r.status].label}
                  </span>
                  <span
                    className="tnum"
                    style={{ fontFamily: FONT.body, fontSize: 14, color: C.muted, minWidth: 64, textAlign: "right" }}
                  >
                    {r.kmLeft.toFixed(1)} km
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* The demo is aria-hidden; this is what it says, said once. */}
        <p className="sr-only">
          A worked example: four riders heading to {CONVOY_DESTINATION.name}. One falls more than
          150 metres behind the group&rsquo;s median and the screen reads &ldquo;Ama is 1.4 km
          back&rdquo;. She catches up and it reads &ldquo;All together&rdquo;. One rider reaches the
          destination and it names him.
        </p>
      </div>
    </section>
  );
}
```

`sr-only` is not in this project's Tailwind output by default. Confirm with `grep -rn "sr-only" app/ tailwind.config.ts`; if it is absent, replace `className="sr-only"` with the inline equivalent:

```tsx
style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}
```

- [ ] **Step 2: Mount it in `app/page.tsx`**

```tsx
import { Hero } from "./components/landing/Hero";
import { VerdictDemo } from "./components/landing/VerdictDemo";

export default function LandingPage() {
  return (
    <main>
      <Hero />
      <VerdictDemo />
    </main>
  );
}
```

- [ ] **Step 3: Verify it behaves**

```bash
npx tsc --noEmit && npm run lint
npm run dev   # one dev server only
```

At `http://localhost:3000`:
- the card cycles: `HEADS UP / Ama is 1.4 km back` → `ALL GOOD / All together` → `ARRIVED / Kofi has arrived`
- the metric label reads **KM BEHIND THE GROUP**, never "KM BEHIND YOU" — the latter means `VIEWER_ID` leaked into the riders
- the roster has four rows and no "You"
- scrolling the card out of view stops the dots moving (watch the DOM in devtools, or just confirm it resumes from a sensible state)
- with "Reduce motion" on in the OS, the card holds still on the *behind* beat instead of flickering

- [ ] **Step 4: Four green, then commit**

```bash
npx tsc --noEmit && npm test && npm run lint && rm -rf .next && npm run build
git add app/components/landing/VerdictDemo.tsx app/page.tsx
git commit -m "feat: act II opens with the verdict engine running

Nothing in the card is copy. The eyebrow, the headline, the metric and
every status word are computeVerdict and computeStatuses reading the
scripted convoy — the same two functions the trip screen calls. A claim
that can go stale is a claim that will, so this one cannot.

aria-hidden and deliberately not a live region: a headline that rewrites
itself every 600ms would be announced every 600ms. A static sentence
beside it says the same thing once. The interval stops when the card
leaves the viewport, and reduced motion holds the clearest beat.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Act II §2–§6 and the footer

**Files:**
- Create: `app/components/landing/Sections.tsx`
- Modify: `app/page.tsx` (mount them)

**Interfaces:**
- Consumes: `C`, `FONT`, `STATUS`, `Glyph`, `Mark` from `../Radar`; `PRODUCT_NAME` from `@/lib/brand`; `StatusKey` from `@/lib/types`
- Produces: `<Statuses />`, `<Forgets />`, `<Accounts />`, `<HowItWorks />`, `<Craft />`, `<Close />`, `<SiteFooter />`

All seven are static presentation with no state between them, so they share one file. There is nothing to split until something needs to change independently.

- [ ] **Step 1: Write the sections**

Create `app/components/landing/Sections.tsx`:

```tsx
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { C, FONT, STATUS, Glyph, Mark } from "../Radar";
import { PRODUCT_NAME } from "@/lib/brand";
import type { StatusKey } from "@/lib/types";

/**
 * Act II, §2 onward: the static half of the landing page.
 *
 * Six sections with no state and nothing shared between them but the shell
 * helpers below, so they live in one file until one of them needs to change on
 * its own. Labels, glyphs and colours come from `STATUS` rather than being
 * retyped, so a rename in the app cannot leave the marketing page lying.
 */

const Shell = ({ children, tone = C.ground }: { children: React.ReactNode; tone?: string }) => (
  <section style={{ background: tone, color: C.text }}>
    <div className="mx-auto w-full max-w-[1200px] px-6" style={{ padding: "clamp(64px, 10vh, 120px) 24px" }}>
      {children}
    </div>
  </section>
);

const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <p
    style={{
      fontFamily: FONT.mono, fontSize: 12, fontWeight: 500,
      letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted,
    }}
  >
    {children}
  </p>
);

const H2 = ({ children }: { children: React.ReactNode }) => (
  <h2
    style={{
      fontFamily: FONT.display, fontWeight: 500, marginTop: 18,
      fontSize: "clamp(2rem, 4vw, 3.25rem)", lineHeight: 1.05, letterSpacing: "-0.03em",
    }}
  >
    {children}
  </h2>
);

const Body = ({ children }: { children: React.ReactNode }) => (
  <p
    style={{
      fontFamily: FONT.body, color: C.muted, marginTop: 20, maxWidth: "48ch",
      fontSize: "clamp(1rem, 1.2vw, 1.1875rem)", lineHeight: 1.55,
    }}
  >
    {children}
  </p>
);

// ─── §2 The five statuses ───────────────────────────────────────────────────
// The rules, not the app's own `hint` strings: those are written to fit a
// tooltip at phone width and read as shorthand out of that context.
const RULES: { key: StatusKey; rule: string }[] = [
  { key: "arrived", rule: "Within 100 metres of the destination." },
  { key: "ahead", rule: "More than 150 metres closer than the group's median." },
  { key: "behind", rule: "More than 150 metres further than the median." },
  { key: "with", rule: "Near a majority of the others — counted as neighbours, so one straggler cannot drag the average." },
  { key: "stopped", rule: "Hasn't moved 20 metres in five minutes." },
];

export const Statuses = () => (
  <Shell tone={C.sunken}>
    <Eyebrow>Five statuses</Eyebrow>
    <H2>Read at a glance, not decoded.</H2>

    <div className="grid gap-x-10 gap-y-7 md:grid-cols-2" style={{ marginTop: 44 }}>
      {RULES.map(({ key, rule }) => (
        <div key={key} className="flex items-start gap-4">
          <span
            className="grid place-items-center shrink-0"
            style={{
              width: 46, height: 46, borderRadius: 14,
              background: STATUS[key].soft, color: STATUS[key].color,
            }}
          >
            <Glyph s={key} size={18} />
          </span>
          <span>
            <span
              style={{ fontFamily: FONT.display, fontSize: 19, fontWeight: 600, letterSpacing: "-0.02em" }}
            >
              {STATUS[key].label}
            </span>
            <span
              className="block"
              style={{ fontFamily: FONT.body, fontSize: 15, color: C.muted, lineHeight: 1.5, marginTop: 4 }}
            >
              {rule}
            </span>
          </span>
        </div>
      ))}
    </div>

    <p
      style={{
        fontFamily: FONT.body, fontSize: 15, color: C.muted, marginTop: 42,
        borderTop: `1px solid ${C.line}`, paddingTop: 22, maxWidth: "62ch", lineHeight: 1.55,
      }}
    >
      Status is carried by a glyph, never by colour alone — five colours that all pass contrast on
      one background land in a narrow band of lightness, so they collide in greyscale and for
      colourblind riders. The glyph is the channel. Colour only reinforces it.
    </p>
  </Shell>
);

// ─── §3 Then it forgets ─────────────────────────────────────────────────────
const KEPT = ["Trip name", "When it ran", "Where it was headed", "Who finished"];
const GONE = [
  { label: "Every coordinate", note: "deleted" },
  { label: "The route taken", note: "never recorded" },
];

export const Forgets = () => (
  <Shell>
    <div className="grid gap-12 md:grid-cols-[1fr_0.9fr] md:items-start">
      <div>
        <Eyebrow>Eight hours</Eyebrow>
        <H2>Then it forgets.</H2>
        <Body>
          Eight hours after a trip starts, every coordinate is deleted. Not archived. Not
          anonymised. Deleted.
        </Body>
        <p
          style={{
            fontFamily: FONT.display, fontSize: "clamp(1.125rem, 1.8vw, 1.5rem)",
            lineHeight: 1.35, letterSpacing: "-0.02em", marginTop: 26, maxWidth: "34ch",
          }}
        >
          There is no position-history table to keep them in.{" "}
          <span style={{ color: C.muted }}>
            Coordinates are overwritten in place, never appended.
          </span>
        </p>
      </div>

      <div
        style={{
          background: C.raised, border: `1px solid ${C.line}`,
          borderRadius: 18, padding: "clamp(22px, 2.6vw, 32px)",
        }}
      >
        <p
          style={{
            fontFamily: FONT.mono, fontSize: 12, fontWeight: 500, letterSpacing: "0.12em",
            textTransform: "uppercase", color: C.muted,
          }}
        >
          What a finished trip leaves behind
        </p>
        <p style={{ fontFamily: FONT.body, fontSize: 14, color: C.faint, marginTop: 8, lineHeight: 1.5 }}>
          And only if somebody in it was signed in, and therefore asked for a record. A trip whose
          riders were all anonymous is erased completely.
        </p>

        <div style={{ marginTop: 20 }}>
          {KEPT.map((label) => (
            <div
              key={label}
              className="flex items-center justify-between"
              style={{ padding: "11px 0", borderTop: `1px solid ${C.line}` }}
            >
              <span style={{ fontFamily: FONT.body, fontSize: 15 }}>{label}</span>
              <span style={{ fontFamily: FONT.body, fontSize: 14, color: C.muted }}>kept</span>
            </div>
          ))}
          {GONE.map(({ label, note }) => (
            <div
              key={label}
              className="flex items-center justify-between"
              style={{ padding: "11px 0", borderTop: `1px solid ${C.lineStrong}` }}
            >
              <span style={{ fontFamily: FONT.body, fontSize: 15, color: C.muted }}>{label}</span>
              <span style={{ fontFamily: FONT.body, fontSize: 14, fontWeight: 600, color: C.stopped }}>
                {note}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </Shell>
);

// ─── §3a Optional accounts ──────────────────────────────────────────────────
// The page cannot say "no account needed" and be true: Google sign-in exists.
// Saying so properly strengthens the privacy argument instead of weakening it —
// an optional account that stores no email is a better story than silence.
//
// Every claim here is checked against the code, not the docs:
//   `AccountProfile` in lib/data/account.ts is `{ displayName: string }`;
//   the `users` table is keyed on google_sub + display name with NO email column;
//   signInAvailable = BACKEND === "http" && googleClientId.length > 0.
//
// Sign-in is DESCRIBED, never offered as a call to action — the same posture the
// in-app landing screen takes, where it sits below the two things people came to
// do. That also keeps this honest while the OAuth app is in Testing mode.
const ACCOUNT_GIVES = [
  "A history of the trips you took.",
  "A name that follows you, instead of being typed into every trip.",
  "Settings that follow you between devices.",
];

export const Accounts = () => (
  <Shell>
    <div className="grid gap-12 md:grid-cols-[0.95fr_1.05fr] md:items-start">
      <div>
        <Eyebrow>Optional accounts</Eyebrow>
        <H2>Signed in or not, it works the same.</H2>
        <Body>
          Radar needs no account. Starting a trip, joining one, the verdict, the map — all of it
          works with nobody signed in.
        </Body>
      </div>

      <div>
        <p
          style={{
            fontFamily: FONT.mono, fontSize: 12, fontWeight: 500, letterSpacing: "0.12em",
            textTransform: "uppercase", color: C.muted,
          }}
        >
          What signing in with Google adds
        </p>
        <div style={{ marginTop: 14 }}>
          {ACCOUNT_GIVES.map((line) => (
            <p
              key={line}
              style={{
                fontFamily: FONT.body, fontSize: 16, lineHeight: 1.5,
                padding: "12px 0", borderTop: `1px solid ${C.line}`,
              }}
            >
              {line}
            </p>
          ))}
        </div>
        <p
          style={{
            fontFamily: FONT.display, fontSize: "clamp(1.0625rem, 1.5vw, 1.375rem)",
            lineHeight: 1.4, letterSpacing: "-0.02em", marginTop: 26,
            borderTop: `1px solid ${C.lineStrong}`, paddingTop: 22,
          }}
        >
          It takes two fields from Google: an account identifier and a display name.{" "}
          <span style={{ color: C.muted }}>
            Not your email. Not your picture. There is no email column in the database to put one
            in.
          </span>
        </p>
      </div>
    </div>
  </Shell>
);

// ─── §4 How it works ────────────────────────────────────────────────────────
const STEPS = [
  // Destination search shipped (DestinationSearch.tsx, GET /v1/geocode proxying
  // Photon), so "drop a pin" alone understates what Create actually does.
  { n: "01", title: "Start a trip", body: "Name it if you like, and set where you're headed — search for the place, or drop a pin on the map. Both optional." },
  { n: "02", title: "Share the code", body: "Six characters, a link, or a QR code. No 0 or O, no 1 or I, so nobody mishears it." },
  { n: "03", title: "Ride", body: "Everyone sees the same one-line verdict. Nobody installs anything." },
];

export const HowItWorks = () => (
  <Shell tone={C.sunken}>
    <Eyebrow>How it works</Eyebrow>
    <H2>Three taps, then nothing to manage.</H2>

    <div className="grid gap-8 md:grid-cols-3" style={{ marginTop: 46 }}>
      {STEPS.map(({ n, title, body }) => (
        <div key={n} style={{ borderTop: `1px solid ${C.lineStrong}`, paddingTop: 20 }}>
          <span
            className="tnum"
            style={{ fontFamily: FONT.mono, fontSize: 13, letterSpacing: "0.12em", color: C.faint }}
          >
            {n}
          </span>
          <p style={{ fontFamily: FONT.display, fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", marginTop: 12 }}>
            {title}
          </p>
          <p style={{ fontFamily: FONT.body, fontSize: 15, color: C.muted, lineHeight: 1.55, marginTop: 8 }}>
            {body}
          </p>
        </div>
      ))}
    </div>
  </Shell>
);

// ─── §5 Craft ───────────────────────────────────────────────────────────────
const CRAFT = [
  { title: "Light by default", body: "A dark screen loses to reflected sunlight, so the light theme is the tuned one. Dark is there for night." },
  { title: "Signage type", body: "Archivo and Signika, drawn for wayfinding rather than for web apps. They hold at 13px in glare." },
  // The trailing caveat is load-bearing: the app only claims a wake lock when
  // `"wakeLock" in navigator`, so the landing page must not claim more.
  { title: "The screen stays awake", body: "Geolocation stops being delivered when the screen sleeps, which is exactly when the group needs it. Radar holds the screen on for the length of a trip, wherever the browser allows it." },
  { title: "Writes speed up as you do", body: "Every 20 seconds at rest, every 5 at 30 km/h. A cyclist covers 30 metres in under four seconds." },
];

export const Craft = () => (
  <Shell>
    <Eyebrow>Built to be read at speed</Eyebrow>
    <H2>Designed for a phone on a handlebar.</H2>

    <div className="grid gap-x-10 gap-y-8 md:grid-cols-2" style={{ marginTop: 44 }}>
      {CRAFT.map(({ title, body }) => (
        <div key={title}>
          <p style={{ fontFamily: FONT.display, fontSize: 19, fontWeight: 600, letterSpacing: "-0.02em" }}>
            {title}
          </p>
          <p style={{ fontFamily: FONT.body, fontSize: 15, color: C.muted, lineHeight: 1.55, marginTop: 6, maxWidth: "44ch" }}>
            {body}
          </p>
        </div>
      ))}
    </div>
  </Shell>
);

// ─── §6 Close ───────────────────────────────────────────────────────────────
export const Close = () => (
  <Shell tone={C.sunken}>
    <div className="grid place-items-center text-center">
      <H2>Start a trip.</H2>
      <Body>It takes about ten seconds, and it expires by itself.</Body>
      <div className="flex flex-wrap justify-center gap-3" style={{ marginTop: 32 }}>
        <Link
          href="/app"
          className="inline-flex items-center justify-center gap-2"
          style={{
            fontFamily: FONT.body, fontSize: 16, fontWeight: 600,
            background: C.text, color: C.ground, borderRadius: 14, padding: "0 24px", minHeight: 52,
          }}
        >
          <span className="gt-cta-new">Start a trip</span>
          <span className="gt-cta-returning">Open {PRODUCT_NAME}</span>
          <ArrowRight size={19} />
        </Link>
        <Link
          href="/join"
          className="inline-flex items-center justify-center gap-2"
          style={{
            fontFamily: FONT.body, fontSize: 16, fontWeight: 600, color: C.text,
            border: `1px solid ${C.lineStrong}`, borderRadius: 14, padding: "0 24px", minHeight: 52,
          }}
        >
          Join with a code
        </Link>
      </div>
    </div>
  </Shell>
);

export const SiteFooter = () => (
  <footer style={{ background: C.ground, borderTop: `1px solid ${C.line}` }}>
    <div
      className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-4 px-6"
      style={{ paddingTop: 30, paddingBottom: "calc(30px + var(--safe-b))" }}
    >
      <span className="flex items-center gap-2">
        <Mark size={18} />
        <span style={{ fontFamily: FONT.display, fontSize: 15, fontWeight: 600, letterSpacing: "-0.02em" }}>
          {PRODUCT_NAME}
        </span>
        <span style={{ fontFamily: FONT.body, fontSize: 14, color: C.muted }}>
          — temporary location sharing for groups moving together.
        </span>
      </span>
      <span className="flex items-center gap-5">
        <Link href="/app" style={{ fontFamily: FONT.body, fontSize: 14, color: C.muted }}>
          Open {PRODUCT_NAME}
        </Link>
        <Link href="/join" style={{ fontFamily: FONT.body, fontSize: 14, color: C.muted }}>
          Join a trip
        </Link>
      </span>
    </div>
  </footer>
);
```

- [ ] **Step 2: Mount them**

`app/page.tsx`:

```tsx
import { Hero } from "./components/landing/Hero";
import { VerdictDemo } from "./components/landing/VerdictDemo";
import { Statuses, Forgets, Accounts, HowItWorks, Craft, Close, SiteFooter } from "./components/landing/Sections";

export default function LandingPage() {
  return (
    <>
      <main>
        <Hero />
        <VerdictDemo />
        <Statuses />
        <Forgets />
        <Accounts />
        <HowItWorks />
        <Craft />
        <Close />
      </main>
      <SiteFooter />
    </>
  );
}
```

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit && npm run lint
npx vitest run lib/__tests__/tokens.test.ts
```

Expected: PASS — in particular "has no type below 12px in landing/Sections.tsx", which now runs because Task 3 made the scan recursive.

In the browser, check at 375px wide as well as desktop: no horizontal scroll, every section single-column, the receipt card readable.

- [ ] **Step 4: Four green, then commit**

```bash
npx tsc --noEmit && npm test && npm run lint && rm -rf .next && npm run build
git add app/components/landing/Sections.tsx app/page.tsx
git commit -m "feat: the rest of act II — statuses, erasure, how it works

Labels, glyphs and colours come from the STATUS table rather than being
retyped, so a rename in the app cannot leave the marketing page lying.
The rules beside them are written out longhand instead of reusing the
app's hint strings, which are drawn to fit a tooltip at phone width.

The erasure section is a receipt rather than a paragraph: what a
finished trip keeps, ruled off from what it never had.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Metadata, the share image, and the final pass

**Files:**
- Modify: `app/page.tsx` (export `metadata`)
- Modify: `app/layout.tsx` (`metadataBase`)
- Create: `public/og.jpg` (copied)
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: everything above
- Produces: the shippable page

- [ ] **Step 1: Copy the share image**

```bash
cp brag-output/brag.jpg public/og.jpg
file public/og.jpg
```

Expected: a JPEG, 1920x1080. It is the launch video's own key frame and already carries the product's language.

- [ ] **Step 2: Set `metadataBase` in `app/layout.tsx`**

Without it, Next resolves Open Graph image URLs relative and warns at build time.

```ts
export const metadata: Metadata = {
  // Open Graph image URLs must be absolute. NEXT_PUBLIC_SITE_URL lets a
  // preview deploy advertise itself rather than production.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://radar-for-sports.vercel.app"),
  title: "Radar",
  // …the rest unchanged…
};
```

- [ ] **Step 3: Give the landing page its own metadata**

At the top of `app/page.tsx`:

```tsx
import type { Metadata } from "next";

const DESCRIPTION =
  "Temporary location sharing for groups moving together. One sentence and one number instead of a map full of pins. Join from a link in seconds, no install, and every trip expires in 8 hours.";

export const metadata: Metadata = {
  title: "Radar — Know where everyone is. Without the calls.",
  description: DESCRIPTION,
  openGraph: {
    title: "Radar — Know where everyone is. Without the calls.",
    description: DESCRIPTION,
    type: "website",
    images: [{ url: "/og.jpg", width: 1920, height: 1080, alt: "Radar" }],
  },
  twitter: { card: "summary_large_image", title: "Radar", description: DESCRIPTION, images: ["/og.jpg"] },
};
```

The title is spelled out rather than interpolated from `PRODUCT_NAME` because `metadata` is evaluated at build time in a server module and a rename here is a deliberate marketing decision, not a mechanical one.

- [ ] **Step 4: Update `CLAUDE.md`**

Add to the Architecture section, after the routes:

```markdown
- **The landing page is a consumer of `lib/`, never an editor of it.** `app/page.tsx` plus `app/components/landing/` render at marketing scale and import only what is scale-free from `Radar.tsx` (`C`, `FONT`, `STATUS`, `Glyph`, `Mark`) — that file is inline-styled for a 460px frame and its screens do not survive a 1200px canvas. The verdict shown on the page is `computeVerdict()`'s real output over the scripted coordinates in `lib/landing/convoy.ts`, so retuning a threshold in `lib/status.ts` changes the marketing page too. That is intended.
- **`.gt-night` is the dark palette as a class**, sharing one declaration block with `:root[data-theme="dark"]` in `globals.css`. It is written on the line *above* that selector because `tokens.test.ts` parses for the literal string.
```

- [ ] **Step 5: The full four-green bar, from clean**

```bash
pgrep -f next-server && echo "kill the dev server first" || true
rm -rf .next
npx tsc --noEmit && npm test && npm run lint && npm run build
```

Expected: all four PASS. The route table lists `/`, `/app`, `/app/repairs`, `/app/t/[code]`, `/app/trips`, `/app/trips/[tripId]`, `/app/you`, `/join`, `/t/[code]/join`.

- [ ] **Step 6: Walk the app manually, once**

The move in Task 1 is the part with the most reach, and only a real click-through covers it.

1. `/` — the landing renders, hero dark in both OS themes
2. `/` → "Start a trip" → lands on `/app`
3. `/app` → create a trip → the Share screen shows a code
4. Copy the share link — it must read `…/t/CODE/join`, with **no** `/app`
5. Open that link in a second browser profile → join → lands on `/app/t/CODE`
6. Tab bar reaches `/app`, `/app/trips`, `/app/repairs`, `/app/you`
7. `/app/trips` → open a past trip → `/app/trips/<id>`
8. `/join` → type the code → joins
9. `localStorage.setItem("gt:signedIn","1")`, reload `/` → both CTAs read "Open Radar", no flash

- [ ] **Step 7: Commit**

```bash
git add app/page.tsx app/layout.tsx public/og.jpg CLAUDE.md
git commit -m "feat: metadata and the share image for the landing page

metadataBase is set from NEXT_PUBLIC_SITE_URL with production as the
fallback, so a preview deploy advertises itself instead of pointing its
Open Graph image at production. Without it Next resolves the image
relative and warns at build.

The share image is the launch video's own key frame, which already
carries the product's language.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Notes for whoever executes this

- **Task 1 is the risky one.** It touches every route in the app and nothing else depends on taste. If a link is missed, the symptom is a 404 on a tab, not a build failure — which is why Step 5 greps rather than trusting the build, and Step 6 of Task 7 clicks every route.
- **Do not "fix" `tokens.test.ts` if it fails.** It fails on purpose when the palette or the type scale moves. Read §5 and §7 of `docs/superpowers/specs/2026-09-04-mobile-light-redesign-design.md` first.
- **`/join` and `/t/[code]/join` never gain an `/app` prefix.** If a grep or a sed in Task 1 rewrites them, revert that hunk — those are the links already in people's messages.
- **The landing page must not import `Landing`, `Create`, `Share`, `Group` or any other screen from `Radar.tsx`.** Only `C`, `FONT`, `STATUS`, `Glyph`, `Mark`, and `LiveScope` from its own file.
- **There are deliberately no scroll-triggered section entrances.** The spec floated reusing `.gt-rise` on an IntersectionObserver; that would make the whole static half of the page a client component in order to fade in headings. The motion budget is spent on the two things that carry meaning — the sweep and the running verdict — and `Sections.tsx` stays a server component. Spec §8 records the same decision.
