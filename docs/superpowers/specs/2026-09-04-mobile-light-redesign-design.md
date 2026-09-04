# Mobile-first redesign with a sunlight-grade light theme

**Date:** 2026-09-04
**Status:** Approved design, ready for an implementation plan
**Scope:** All eight screens, the shell, the map, plus four behavioural additions for athletes in motion

---

## 1. Why

Caravan is used outdoors, on a phone, by people moving — running, riding, driving in convoy. The current build is a dark-only, desktop-framed prototype with three specific classes of defect:

**It is mis-measured for sunlight.** The theme is dark-only on `#0E1116`. In direct sun, the screen's emitted light is swamped by ambient light reflecting off the glass, which compresses every contrast ratio toward the reflectance of the cover glass. High ratios survive as low ones; low ratios vanish entirely. A dark theme is the worst possible starting point, and the palette cannot simply be inverted — measured on white, **every status colour fails WCAG AA**: ahead 2.34, behind 2.64, with-group 1.86, stopped 1.59, arrived 1.92. Separately, the existing dark `faint` token (`#5A5F68`) already fails on its own ground at 2.95 — and it is what the 9–10px labels use.

**It leaks off the edges of a phone.** `PhoneFrame.tsx` uses `100vh`/`h-screen` in three places, so on iOS Safari and Android Chrome the dynamic toolbar makes the container taller than the visible viewport and `Group`'s `absolute bottom-0` action bar sits below the fold until scrolled. There is no `env(safe-area-inset-*)` anywhere, no `viewport-fit=cover`, no `themeColor`, and no `interactiveWidget` handling — so the header sits under the notch, the action bar under the home indicator, and the soft keyboard pushes `mt-auto` CTAs off-screen on Create and Join.

**It asks too much of someone at effort.** The Group screen renders roughly 72 discrete elements for a four-person trip. Head-unit design practice is unambiguous that a rider at threshold reads two or three numbers, and the largest field is what gets read. There are 28 type declarations below 13px, including `fontSize: 9` for the horizon's per-member distances — the single most glanceable datum on the screen.

## 2. Goals

1. A light theme good enough to read in direct sun, as the default, with a genuine dark theme for night and a manual override.
2. Every screen correct on a notched phone with a dynamic toolbar and a soft keyboard.
3. The Group screen readable at a glance while moving: one verdict, then detail.
4. Four behavioural changes so the app survives an actual activity: wake lock, glance mode, haptics, speed-aware position cadence.
5. No regression to the data layer's swappability — `lib/data/`'s interface is untouched.

## 3. Non-goals

- No backend. The Supabase work in `docs/superpowers/plans/2026-06-14-phase-1-supabase-foundation.md` stays deferred and this redesign must not make it harder.
- No routing changes. The four routes stay as they are.
- No new state library. `useState` plus the data-layer subscription remains sufficient.
- No PWA manifest or service worker. Wake lock addresses the immediate "screen sleeps and geolocation pauses" problem; installability is separate.
- No geocoding. Destinations still come from the map picker.

---

## 4. Architecture: a token layer under the existing inline styles

The codebase deliberately styles with inline `style={{...}}` referencing an exported `C` object — 188 references, 181 of them inside `GroupTrack.tsx`. Only 10 sites do colour arithmetic and only ~11 hardcoded hexes escaped the object. That shape makes one approach clearly correct.

**`C` keeps its exact shape and becomes a map of CSS custom property references.**

```ts
export const C = {
  ground: "var(--c-ground)",
  text: "var(--c-text)",
  // …
};
```

All 188 call sites keep working unchanged, the documented inline-style convention survives, and theme switching becomes one attribute on `<html>` with no React re-render and no flash. It is also the only approach that reaches `LiveMap`'s imperative pin DOM (`el.style.cssText`, `LiveMap.tsx:31-46`) and lets a CSS filter theme the MapLibre canvas.

The two rejected alternatives, for the record: a React context + `useTheme()` hook would rewrite all 188 sites, re-render the tree on switch, carry hydration-flash risk, and still need values threaded by hand into the imperative map pins. Converting to Tailwind utilities with `dark:` variants would rewrite 987 lines against a convention chosen on purpose, and per-status dynamic colours don't map onto static utilities without safelisting — or CSS variables anyway.

### 4.1 Token declaration

Tokens live in `app/globals.css`. Light is the base on bare `:root`; dark is declared twice so that both the system preference and an explicit choice win in the right order.

```css
:root { color-scheme: light; --c-ground: #F5F3EE; /* … */ }

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { color-scheme: dark; --c-ground: #0E1116; /* … */ }
}

:root[data-theme="dark"] { color-scheme: dark; --c-ground: #0E1116; /* … */ }
```

No colour may have its only definition inside a media or attribute block.

### 4.2 The alpha problem

Ten sites build translucent tints by string-concatenating hex alpha — `${C.ahead}14`, `${C.surface}ee`, `${STATUS[s].color}18`. `var(--x)14` is not a colour. Two fixes, both explicit rather than computed:

- Status tints become declared tokens per theme: `--c-stopped-soft`, etc., set to a 10% blend of the status colour over that theme's ground. The `STATUS` map at `GroupTrack.tsx:76-82` gains a `soft` field alongside `color`, so `STATUS[s].soft` replaces `${STATUS[s].color}18`.
- The two `${C.surface}ee` scrim cases become `--c-scrim`, declared per theme.

Pills use a **10%** tint, not 14%: at 14% the light `behind` pill measures 4.32 against its own tint (AA-large only); at 10% it measures 5.11 and passes AA outright.

### 4.3 Icons

`lucide-react` defaults `color` to `currentColor`. Every `color={C.muted}` prop is dropped and the parent element sets `color` instead. This avoids relying on `var()` resolving inside an SVG presentation attribute, which is not worth betting on.

### 4.4 Theme resolution

- `lib/theme.ts` — pure, unit-tested: `resolveTheme(stored: ThemeChoice | null, prefersDark: boolean): "light" | "dark"` where `ThemeChoice = "light" | "dark" | "system"`. Anything unrecognised resolves as `"system"`.
- Persisted under `gt:theme`, matching the existing `gt:` prefix convention. This is a new key, not a rename, so no migration and no risk to existing trips.
- A tiny IIFE in `<head>` (`app/layout.tsx`, via `dangerouslySetInnerHTML`) reads the key and stamps `data-theme` on `<html>` **before first paint**, so there is no flash of the wrong theme. It must be wrapped in try/catch — private-mode `localStorage` access throws in some browsers.
- Two `<meta name="theme-color">` tags with `media="(prefers-color-scheme: …)"` so the browser chrome matches.
- The three-way control (System / Light / Dark) lives in the Group screen's `⋯` sheet.

---

## 5. The palette

Every value below is measured, not chosen by eye. "on ground" is the WCAG contrast ratio against that theme's `ground`.

### Light — the default

| token | value | on ground | note |
|---|---|---|---|
| `ground` | `#F5F3EE` | — | warm paper, not pure white, to cut glare |
| `raised` | `#FFFFFF` | 1.12 | used sparingly; see 5.1 |
| `sunken` | `#E7E3DA` | 1.25 | input wells, pressed states |
| `line` | `#CFCAC0` | 1.47 | **decorative only** — carries no information |
| `lineStrong` | `#6E6A61` | 4.86 | functional edges: input underlines, secondary button borders |
| `text` | `#15171B` | 16.18 | AAA |
| `muted` | `#54595F` | 6.37 | AA |
| `faint` | `#767B83` | 3.84 | **non-text only** — see 5.2 |
| `arrived` | `#0B6B3A` | 5.96 | |
| `withg` | `#3E4752` | 8.50 | a **neutral**, not a hue |
| `ahead` | `#1B4FA8` | 6.94 | |
| `behind` | `#9C4208` | 5.92 | |
| `stopped` | `#A11B1B` | 7.05 | |

### Dark — for night

| token | value | on ground | note |
|---|---|---|---|
| `ground` | `#0E1116` | — | unchanged |
| `raised` | `#1C2129` | | cards keep their fill here |
| `sunken` | `#0A0C10` | | |
| `line` | `#2C333F` | 1.49 | decorative |
| `lineStrong` | `#5C6472` | 3.17 | functional |
| `text` | `#ECEAE4` | 15.72 | unchanged |
| `muted` | `#A8ADB6` | 8.39 | raised from `#8B8F97` |
| `faint` | `#868C96` | 5.59 | **fixes the existing 2.95 failure**; still non-text per 5.2 |
| `arrived` | `#5BD18A` | 9.84 | unchanged |
| `withg` | `#8A93A1` | 6.10 | deliberately the quietest status |
| `ahead` | `#7FADFF` | 8.40 | |
| `behind` | `#F5904C` | 8.08 | |
| `stopped` | `#FF6B6B` | 6.81 | |

### 5.1 The light theme is flat; the dark theme is card-led

This is the design's central non-obvious decision. White cards on the warm ground measure **1.12:1**. In sunlight, ratios in the 1.1–1.5 band collapse to nothing, so a card-led light theme has no structure at all outdoors. Therefore:

- **Light** carries structure with type, whitespace, and hairline dividers, with `raised` reserved for things that genuinely float above the page (the toast, the `⋯` sheet, map overlays) where a shadow also helps. Member rows are dividers, not boxes.
- **Dark** keeps the existing card treatment, because night has no glare to fight and fills read fine.

The two themes are tuned to their conditions rather than being mirror images. A reviewer expecting symmetry should read this section first.

### 5.2 `faint` is not a text colour

Light `faint` measures 3.84, which is below AA for body text. WCAG's large-text exemption needs ≥24px, or ≥18.66px bold — a 12px tracked uppercase label does not qualify however legible it looks, so "AA-large for small caps" would be self-deception.

The rule, applied to both themes so there is one thing to remember: **`faint` is for non-text only** — chevrons, horizon tick marks, dividers. At 3.84 it clears the 3:1 that WCAG 1.4.11 asks of non-text UI. **Every label, eyebrow and caption uses `muted`** (6.37 light / 8.39 dark), which passes AA outright at 12px.

This supersedes the current build, where `faint` is the colour of nearly every 9–10px label.

### 5.3 Avatar palette

The current `AVATAR_PALETTE` (`GroupTrack.tsx:22-24`) is eight pastels with dark text — correct on `#0E1116`, invisible on `#F5F3EE`. It becomes theme-aware: the existing pastels for dark, and a darker set with white text for light (`#8A6A2F`, `#2E7D6B`, `#7B4B9E`, `#A8801A`, `#2F5F9E`, `#1F7A5C`, `#A03D5C`, `#B5651D`). `colorForId` keeps its hashing so a person's colour is stable within a theme; the two palettes are index-aligned so identity survives a theme switch.

Because the palette must be selected at render time rather than baked into a CSS variable, `colorForId(id)` returns a **CSS variable reference** (`var(--c-av-3)`) and the eight slots are declared per theme. This keeps avatars inside the same no-re-render switching model as everything else.

The initial inside the avatar flips with the fill — dark ink on the light theme's pastels would be unreadable, and so would white ink on them. Each slot therefore ships as a **pair**, `--c-av-N` and `--c-av-N-ink`, declared together per theme, so `Avatar` reads both from the same index and never has to know which theme is active. In dark, ink is `#0E1116` on the pastels; in light, it is `#FFFFFF` on the darker set.

---

## 6. Status: the glyph carries the meaning

Five statuses that all pass AA against a single ground are mathematically forced into a narrow luminance band. Measured, the light ramp spans only `#464646`–`#656565` in greyscale; the closest pair sits at 1.02. **No palette fixes this** — it is a consequence of the contrast requirement. So colour cannot be the channel that distinguishes status.

Each status gains a glyph, rendered alongside the label in `StatusPill`, as a badge on horizon avatars, and in the toast:

| status | glyph | tone | meaning |
|---|---|---|---|
| Arrived | `✓` | calm | at the destination |
| With group | `∴` | calm | near a majority of members |
| Ahead | `››` | info | closer to the destination |
| Behind | `‹‹` | attention | trailing the group |
| Stopped | `‖` | alarm | no movement for 5+ min |

Colour is reinforcement. This also serves colourblind users, for whom the current build offers no fallback cue on the bare `StatusDot` in the horizon.

### 6.1 Hue now maps to urgency

Today `ahead` is orange and `behind` is blue, which is inverted relative to what the group needs to act on. The new mapping: blue = ahead (informational), orange = behind (attention), red = stopped (act now), green = arrived (resolved), and **neutral grey = with group**.

The consequence is that a well-grouped trip renders with **no colour at all**, so colour appearing is itself the signal. This changes learned associations for a returning user; the glyphs mitigate it, since `‹‹ Behind` reads correctly regardless of hue.

`StatusKey` values, the `computeStatuses` engine, and all its thresholds are **unchanged**. This is purely a presentation remap.

---

## 7. Type

A real scale, with a hard floor of **12px**. There is no 9px, 10px or 11px type in the redesign.

| role | family | size |
|---|---|---|
| Verdict headline | display | 34 |
| Glance metric | mono | 88 |
| Glance name | display | 44 |
| Screen title | display | 24–28 |
| Verdict metric | mono | 30 |
| Member name | body | 17 |
| Body | body | 15 |
| Secondary / captions | body | 13 |
| Data, distances, eyebrows | mono | 12 |

Text inputs stay at **≥16px** — below that, iOS Safari zooms the viewport on focus. The Create and Join inputs already satisfy this and must not regress.

`tnum` (tabular numbers) applies to every changing figure so digits don't jitter as distances update.

---

## 8. Viewport, safe areas, keyboard

`app/layout.tsx` gains a Next `viewport` export:

```ts
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5F3EE" },
    { media: "(prefers-color-scheme: dark)", color: "#0E1116" },
  ],
};
```

`viewportFit: "cover"` is what makes `env(safe-area-inset-*)` non-zero. `interactiveWidget: "resizes-content"` is what stops the soft keyboard from pushing bottom-anchored CTAs off Create and Join. Zoom is **not** disabled — no `maximumScale`, no `userScalable: false`.

`PhoneFrame.tsx` changes:

- All three `100vh`/`h-screen` values become `100dvh`.
- It exposes safe-area padding to its children as CSS variables so each screen can decide where the inset applies (a full-bleed map wants it on its floating controls, not on the map itself).
- The desktop device frame is retained — it costs nothing and is useful for development — but mobile is the tuned case, not the fallback.

---

## 9. New pure logic

Both modules are pure, live in `lib/`, and are TDD'd before any UI consumes them, per the repo's existing convention.

### 9.1 `lib/verdict.ts` — the one thing to read

```ts
export interface Verdict {
  tone: "alarm" | "attention" | "info" | "calm" | "waiting";
  eyebrow: string;            // "NEEDS YOU"
  headline: string;           // "Yaw stopped"
  metric: string | null;      // "2.1"
  metricLabel: string | null; // "KM BEHIND YOU · 3 MIN"
  status: StatusKey | null;   // drives colour and glyph
  subjectId: string | null;   // who it concerns, for tap-through
}

export function computeVerdict(input: {
  participants: Participant[];
  statuses: Record<string, MemberStatus>; // from computeStatuses
  selfId: string;
  destinationName: string | null;
  now: number;
}): Verdict;
```

Precedence, highest first:

1. **No located members** → `waiting`, "Waiting for locations".
2. **Only you located** → `waiting`, "Just you so far".
3. **Everyone arrived** (≥2 located, all `arrived`) → `calm`, "Everyone's here".
4. **Any stopped** → `alarm`. One: "{Name} stopped". More than one: "{n} riders stopped".
5. **Any behind** → `attention`. One: "{Name} is {d} km back". More: "{n} riders behind".
6. **Any arrived** (partial) → `info`, "{Name} has arrived" / "{n} have arrived".
7. **Any ahead** → `info`. One: "{Name} is {d} km ahead". More: "{n} riders ahead".
8. **Otherwise** → `calm`, "All together", metric = distance to destination.

Rules that the tests must pin:

- Where several members share the worst status, the subject is the one with the **largest gap** to the viewer.
- Distance is `|subject.kmLeft − self.kmLeft|`, phrased "BEHIND YOU" / "AHEAD OF YOU". When the viewer has no position it falls back to the median of located members and the phrasing becomes "BEHIND THE GROUP".
- The stopped duration comes from `now − participant.lastMovedAt`, floored at 1 minute, omitted when `lastMovedAt` is null.
- With no destination, `kmLeft` is 0 for everyone (`status.ts` already does this), so case 8's metric is null and the headline stands alone. Distance phrasing in cases 5 and 7 is also omitted rather than printing "0.0 km".
- The viewer's own outlier status is described in second person: "You're 2.1 km back", not "Ibrahim is 2.1 km back".

### 9.2 Speed-aware cadence in `lib/geo.ts`

`shouldWritePosition` currently takes a fixed 20s / 30m policy. A cyclist at 30 km/h covers 30m in 3.6s, so the group sees a stale position for most of the interval.

```ts
export function estimateSpeedMps(prev: LatLng | null, next: LatLng, elapsedMs: number): number;

export function writePolicyFor(speedMps: number): { minIntervalMs: number; minDistanceM: number };
```

| speed | interval | distance | case |
|---|---|---|---|
| `speed < 2` | 20 s | 30 m | walking, stationary |
| `2 ≤ speed < 6` | 10 s | 25 m | running, easy riding |
| `speed ≥ 6` | 5 s | 20 m | riding, driving |

Bounds are half-open and stated as code deliberately: exactly 2 m/s takes the middle row, exactly 6 m/s takes the last. A negative or `NaN` speed — `coords.speed` can be either — is treated as 0.

`shouldWritePosition` gains an optional `speedMps`; when omitted it keeps today's behaviour, so existing tests stay meaningful. `useGeolocation` prefers `position.coords.speed` when the browser supplies it and falls back to `estimateSpeedMps` when it is null — which is common on desktop and on some Android builds.

**Note for the backend work:** 5s is a floor chosen for a `localStorage` write. When Supabase lands, this table is the single place to retune write pressure, and `writePolicyFor` being pure means it can be changed without touching the hook.

---

## 10. Behavioural additions

### 10.1 Wake lock — `app/hooks/useWakeLock.ts`

The Create screen currently *warns* "Browsers pause location when the screen is off". The Screen Wake Lock API fixes it instead.

- Acquired while the group view is mounted, the trip is live, and `document.visibilityState === "visible"`.
- The lock is released automatically by the browser when the page hides, so the hook must re-acquire on `visibilitychange`.
- Released explicitly on leave, end, and unmount.
- Returns `{ active, supported }` so the UI can tell the truth rather than promise something it isn't doing.
- Unsupported is a silent no-op — not an error. iOS Safari has it from 16.4; older iOS and some Android browsers do not.
- Toggleable from the `⋯` sheet, default on, because holding the screen awake costs battery and that should be the user's call.

The Create screen's copy changes from a warning to a statement of what the app does, with the honest caveat retained for unsupported browsers.

### 10.2 Glance mode

A fourth `view` kind in the existing union in `app/t/[code]/page.tsx` (`{ kind: "glance" }`) — no new route, no new state machinery.

- Four elements: status glyph, subject name (display 44), the metric (mono 88), the unit label.
- A row of small avatar dots at the bottom for group-at-a-glance.
- Colour comes from the verdict's tone, so an all-good ride is monochrome.
- Tap anywhere exits; the exit target is the whole screen, and the hint is stated on screen.
- Entered from the `⋯` sheet. Forces the wake lock on regardless of the toggle.
- Content is the verdict, so glance mode needs no logic of its own — it is a second rendering of `computeVerdict`.

### 10.3 Haptics — `lib/haptics.ts`

Fires on the same transitions that already produce a toast, driven by the existing `diffStatuses` output.

- `alarm` → `[60, 40, 60]`, `attention` → `[40]`, everything else silent.
- Gated behind the existing alerts toggle, so one control governs notifications and haptics together.
- Wrapped in a capability check and a try/catch; a no-op where absent.
- **Honest limitation to state in the UI, not just the code:** `navigator.vibrate` is not implemented in iOS Safari at all. Haptics are effectively Android-only. The alerts toggle must not imply otherwise on iPhone.

---

## 11. Screen-by-screen

Shared rules: minimum **44×44** touch targets (icon buttons become 44px boxes with a centred glyph); primary CTAs 56px tall; safe-area insets respected top and bottom; no type below 12px; `:focus-visible` rings from `lineStrong`.

**Landing.** Light-first. Display headline retained. Both CTAs move into the thumb zone at 56px. The **dead "How it works" button is removed** — it has no `onClick` today; the three facts it would explain are already in the body copy. The `v0.1 · GROUPTRACK` footer goes to 12px.

**Create.** 44px back target. Inputs stay ≥16px. The map picker grows to 280px and loses its inset. The "keep this tab open" card becomes a wake-lock statement. The CTA moves out of the scroll flow into a safe-area-padded bottom bar so the keyboard can't push it away.

**Share.** The code becomes the hero: large mono, tap-to-copy with a haptic and a visible confirmation. Copy and Share become 56px. The joiners list stays live. **`FakeQR` is removed** — see §13.

**Join.** 44px back. Code input gains `autoCapitalize="characters"`, `autoComplete="off"`, `spellCheck={false}`, `maxLength={6}`, and input filtered to `SHARE_CODE_ALPHABET`. The error message moves from `C.ahead` to the alarm token. The staged reveal is kept; the CTA is bottom-anchored and keyboard-safe.

**Group.** The redesign's centre, dropping from ~72 elements to ~31 in an alert state and ~14 when calm:

- Compact header: live dot, trip name at 17px muted, and two 44px controls (alerts, `⋯`).
- **The verdict** — eyebrow, 34px headline, 30px metric — top of screen, largest type, from `computeVerdict`.
- The horizon survives, with 32px avatars, glyph badges, and 12px distance labels.
- **Outliers only** in the list, at 42px avatars and 17px names. An outlier is anyone whose status is ahead, behind, stopped or arrived — **or who has no position yet.** A member who joined but isn't sharing location is exactly the kind of thing the group needs to see, so they get a row reading "sharing location soon"; they are not folded into the disclosure. Only located members whose status is `with` collapse, into one line with a "show all N" disclosure. When nobody is an outlier the list is a single sentence.
- The status chip row is **removed** — the verdict replaces it.
- Bottom: two 56px buttons, Group and Map.
- **End / Leave moves into the `⋯` sheet behind a confirmation.** It currently sits 5px from the Map button, where a mis-tap while moving ends the trip for everyone.
- `⋯` holds: Invite, Alerts, Theme (System/Light/Dark), Keep screen awake, Glance mode, and End/Leave last.
- The demo-convoy button moves into `⋯` as well; it is a showcase, not a live-activity control.

**Member.** 44px back, 88px avatar, the two stats at 17px with 12px labels, activity list retained.

**Map.** Edge-to-edge — the `mx-4 rounded-2xl` inset is dropped, recovering ~32px of width. Back becomes a floating 44px control inset from the top safe area. The destination bar becomes a bottom sheet above the bottom safe area. The redundant "Back to group" button at the foot is removed in favour of the floating control.

**Ended.** Retuned to the new tokens and type scale; structure unchanged.

**Toast.** Positioned below the top safe area rather than at `top-4`. Gains the status glyph and takes its colour from the verdict tone.

---

## 12. Map theming

OSM raster tiles are a light photographic surface. In the current dark theme the map is a glaring white rectangle — actively harmful at night, which is exactly when dark mode is used.

In dark mode a filter is applied **to `.maplibregl-canvas` only**, not the map container, so custom marker DOM (which are sibling elements, not canvas content) is not inverted:

```css
:root[data-theme="dark"] .maplibregl-canvas { filter: invert(1) hue-rotate(180deg) brightness(.85) saturate(.75); }
```

Attribution must remain legible after filtering; if it isn't, it gets its own explicit colour. `LiveMap`'s three hardcoded hexes (`#0E1116` pin text, `#ECEAE4` ring, `#5BD18A` flag) become token references, which resolve correctly inside imperative `cssText` because they are real CSS variables in the document.

The filter is a mitigation, not a solution — a keyed dark vector tile provider is the real answer and is already noted as pre-production work in the README.

---

## 13. Two removals worth calling out

**`FakeQR` (`GroupTrack.tsx:128-152`) is deleted.** It renders a deterministic-looking grid with QR finder patterns that is **not a scannable code**. It looks exactly like something you should point a camera at, and nothing happens when you do. That is worse than absent, and it occupies 200px of the Share screen that the code and the share actions want. A real QR would be genuinely valuable for a group standing together at a trailhead, but it needs a dependency (~20KB) and that is a separate call — noted in §16.

**The "How it works" button on Landing is deleted.** It has no handler.

---

## 14. Accessibility contract

- Body text meets AA on its ground in both themes; `faint` is restricted to ≥18px or uppercase tracked labels, where AA-large applies.
- Status is never conveyed by colour alone — glyph and text label always accompany it.
- Touch targets ≥44×44.
- Zoom is not disabled.
- `:focus-visible` rings use `lineStrong`, which is ≥3:1 in both themes; the current hardcoded `#F5904C` ring in `globals.css:18` becomes a token.
- The existing `prefers-reduced-motion` guard is retained and extended to the new entrance animations.
- `aria-pressed` on the alerts and wake-lock toggles; the `⋯` sheet is a real dialog with focus trapping and Escape to close.
- The verdict is the screen's live region: `aria-live="polite"` so a screen reader announces changes without the user hunting for them. **The live region contains the headline only, not the metric.** The Group screen re-ticks `now` every 15s and distances drift constantly, so putting the metric in the region would make a screen reader read the verdict aloud every few seconds. The announcement fires when the sentence changes, not when a number does.

## 15. Testing

**Unit (Vitest, pure logic, TDD):**
- `lib/__tests__/verdict.test.ts` — every precedence branch in §9.1, plus the tie-break, the no-self-position fallback, second-person phrasing, and the no-destination case.
- `lib/__tests__/theme.test.ts` — `resolveTheme` across stored × system, and unrecognised input.
- `lib/__tests__/geo.test.ts` — extended for `estimateSpeedMps` and `writePolicyFor` boundaries (exactly 2 and 6 m/s), and that `shouldWritePosition` without `speedMps` is unchanged.
- `lib/__tests__/haptics.test.ts` — pattern selection by tone, and no-op when `navigator.vibrate` is absent.
- A **type-scale guard**: a test that reads `GroupTrack.tsx` and asserts no `fontSize:` below 12. Cheap, and it stops the regression this redesign exists to fix.
- A **contrast guard**: the ratio calculation from §5 as a test over the token table, asserting each pair meets its stated threshold. The palette is then provably correct rather than correct-when-written.

Note the runner constraint from `CLAUDE.md`: Vitest runs `environment: "node"` with `include: ["**/*.test.ts"]`. A `.test.tsx` file is silently not collected, so component tests would need a config change — out of scope here. DOM globals get stubbed with `vi.stubGlobal`.

**Manual, on real hardware** — the parts that cannot be unit tested:
- Both themes on a phone **outdoors in direct sun**. This is the acceptance test for §5 and no amount of computed contrast substitutes for it.
- Notched iPhone: header clear of the notch, action bar clear of the home indicator, no content under either.
- Soft keyboard open on Create and Join: CTA still reachable.
- Wake lock: screen stays awake during a live trip, re-acquires after backgrounding.
- Theme switch: no flash on load, correct on first paint in both system settings.
- Glance mode legible at arm's length on a bar mount.

**The existing bar holds:** `npx tsc --noEmit`, `npm test`, `npm run lint`, `npm run build` all clean. All four pass today.

## 16. Risks

| risk | mitigation |
|---|---|
| Sunlight legibility can't be proven from contrast maths alone | Outdoor device test is a required acceptance criterion, not a nice-to-have |
| `color-mix()` support if used for tints | Avoided — tints are declared tokens per theme, not computed |
| Theme flash on first paint | Pre-paint IIFE in `<head>`, wrapped in try/catch for private-mode `localStorage` |
| The canvas filter also inverting map markers | Filter targets `.maplibregl-canvas`, not the container; verified by eye in dark mode |
| Verdict copy combinatorics | Precedence is a single ordered list in one pure function with a test per branch |
| Outliers-only hiding information users wanted | "Show all N" disclosure is always present; revisit if it proves wrong in use |
| 5s write cadence increasing backend cost later | `writePolicyFor` is pure and is the single tuning point |
| Haptics silently absent on iOS | Stated in the UI, not just the code |

## 17. Sequencing constraints

Not a schedule — just what genuinely blocks what, so the implementation plan can be ordered correctly:

1. **Tokens and theme resolution come first.** Every screen change depends on `C` already pointing at CSS variables; doing screens first would mean touching them twice.
2. **The shell (viewport, `dvh`, safe areas) comes second.** Layout work on screens is untestable while the container itself is the wrong height.
3. **`computeVerdict` before the Group screen.** The screen is a rendering of it, and glance mode is a second rendering — building either first means designing against an imagined shape.
4. **Screens can then proceed independently**, since they share only tokens and the shell.
5. **Behavioural additions are independent of all of the above** except glance mode, which needs the verdict. Wake lock, haptics and the cadence change touch a hook, a new module, and a pure function respectively, and can land in any order.

## 18. Open question for review

**User-visible naming.** The README was renamed to Caravan (commit `ba3686c`) but that commit changed one line and nothing else: `package.json`, `metadata.title`, the notification title, the Landing wordmark and the `gt:` storage prefixes all still say GroupTrack. Since this redesign rewrites the Landing wordmark and the metadata anyway, my assumption is: **user-visible copy becomes "Caravan"; storage keys, the `GroupTrack.tsx` filename and the package name are left alone** (per `CLAUDE.md`, the `gt:` prefixes are load-bearing — `subscribe` string-matches them, so renaming orphans live trips). Say if you'd rather it stayed GroupTrack throughout, or went all the way.

## 19. Follow-ups, explicitly not in this work

- A real, scannable QR code on Share (needs a dependency).
- Dark vector map tiles from a keyed provider, replacing the raster filter.
- PWA manifest and install prompt.
- The Supabase swap, the 8h expiry job, and RLS — unchanged and unblocked by any of the above.
