# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Radar — temporary location sharing for groups moving together (no accounts, no install, trips expire in 8h). The product spec is `docs/PRD.md`; the phased plan is `docs/superpowers/plans/`.

**Current state: the frontend flow is fully functional on a local (localStorage) data layer — no backend yet.** Trips, joining, live member sync, real geolocation, the status engine, the map, and notifications all work in the browser. The backend (Supabase) is deliberately deferred; the data layer is designed to be swapped for it without touching screens.

The UI was rebuilt mobile-first in Sept 2026 with a sunlight-grade light theme as the default. The approved design — palette with measured contrast, the glyph-based status system, the verdict engine, and the four behavioural additions — is `docs/superpowers/specs/2026-09-04-mobile-light-redesign-design.md`. Read it before changing colours, type sizes or the Group screen; most of the values are load-bearing and several are enforced by tests.

## Repo layout

The app is **not** at the directory root — everything (`package.json`, the git repo, this file) lives in `frontend/`. Run every command below from `frontend/`, and expect a bare parent directory above it.

## Commands

- `npm run dev` — dev server at http://localhost:3000 (Node 18.17+, Node 20 LTS recommended)
- `npm run build` — production build
- `npm run start` — serve production build
- `npm run lint` — ESLint (`next/core-web-vitals`)
- `npm test` / `npm run test:watch` — Vitest
- One file: `npx vitest run lib/__tests__/status.test.ts` · one case: `npx vitest run -t "with group"`

After any change the bar is all four green: `npx tsc --noEmit`, `npm test`, `npm run lint`, `npm run build`. They all pass today — keep it that way.

## Architecture

Next.js 14 App Router + TypeScript + Tailwind + MapLibre GL. Navigation is **real routes**, not a state machine:

- `app/page.tsx` — landing → create → share (local step state)
- `app/join/page.tsx` — join by typed code; `app/t/[code]/join/page.tsx` — join by link (both render `app/components/JoinFlow.tsx`)
- `app/t/[code]/page.tsx` — the live group view (the orchestrator: geolocation, status computation, notifications, member/map sub-views)

Key facts that span files / aren't obvious from skimming:

- **Swappable data layer (`lib/data/`).** The single most important abstraction. `lib/data/local.ts` is a dependency-injected (`storage`/`genId`/`genCode`/`now`) localStorage store — fully unit-tested. `lib/data/index.ts` is the browser singleton `data` with cross-tab "realtime": same-tab writes fan out through an `EventTarget`, cross-tab ones through the `storage` event. The whole app talks only to `data`'s interface (`createTrip/getTripByCode/getTripById/joinTrip/updatePosition/listParticipants/leaveTrip/endTrip/subscribe`). To add the backend, replace `lib/data/index.ts` with a Supabase implementation of that same interface — **screens and routes don't change.**
- **Storage keys are load-bearing.** `gt:trip:<id>`, `gt:code:<CODE>`, `gt:participants:<tripId>` (`lib/data/local.ts`) and `grouptrack:clientId` (`lib/clientId.ts`). `subscribe` in `lib/data/index.ts` matches on those exact key strings, so renaming a prefix breaks cross-tab sync *and* orphans every trip already in a user's browser.
- **Identity:** `lib/clientId.ts` — a per-browser UUID in localStorage (no accounts). `getClientId()` touches `localStorage`, so only call it on the client (in effects/handlers), never at SSR render time. Everyone, creator included, must be a participant to see the group view — `app/t/[code]/page.tsx` redirects non-members to the join step.
- **Pure logic lives in `lib/` and is TDD'd** (tests in `lib/__tests__/` and `lib/data/__tests__/`): `shareCode.ts` (ambiguity-free alphabet, no `0/O/1/I`), `geo.ts` (`haversineMeters`, `shouldWritePosition` throttle: ≥30m moved *or* ≥20s elapsed), `status.ts`, `notify.ts` (`diffStatuses` → transition messages; only members present in the previous snapshot, so new joiners don't spam).
- **The verdict is the Group screen.** `lib/verdict.ts` (`computeVerdict`) reduces the whole group to one sentence plus one number, because a rider at effort reads one field, not eight. `GlanceView` is a second rendering of the same value — if you need new glance content, change the verdict, not the view. Precedence is a single ordered list with a test per branch.
- **Status is derived, never stored.** `computeStatuses` (`lib/status.ts`) runs client-side on every render of the group view. `Participant.status` exists in the data model but the local store always writes `null` — don't read it, compute it. Precedence: arrived > stopped > with > ahead/behind, with thresholds as module constants (100m arrive/cluster, 150m ahead-behind margin, 5min stopped). "With group" means *near a majority of members*, which stays robust to outliers. **With no destination there is no ahead/behind** — members are only `stopped`, `with`, or `behind`.
- **`lastMovedAt` is the data layer's job, not the engine's.** `updatePosition` only bumps it when the position moved ≥20m (`MOVED_THRESHOLD_M`), which is what makes "stopped" detectable from a stream of jittery GPS fixes.
- **`Radar.tsx` is a prop-driven screen library** (no mock data, no dev panel): exports each screen (`Landing`/`Create`/`Share`/`Join`/`Group`/`MemberView`/`MapView`/`Ended`/`Toast`/`MenuSheet`/`GlanceView`) plus tokens `C`/`FONT`, the `Member` view-model, and `memberFromParticipant`. **Styling is inline `style={{...}}` referencing `C`/`FONT`**, not Tailwind utilities (Tailwind only maps the font CSS vars + utilities like `tnum`, `gt-rise`). `Member.located` is false until a position exists — screens then show a "sharing location soon" pre-tracking state instead of fake status.
- **`C` is CSS custom property references, not hex.** `C.ground` is the literal string `"var(--c-ground)"`; the values live in `app/globals.css`, declared for light on bare `:root` and for dark under both `prefers-color-scheme` and `[data-theme="dark"]`. Consequences: **you cannot do colour arithmetic in JS** (the old `${C.ahead}33` hex-alpha trick is gone — use the declared `--c-*-soft` tokens, or `STATUS[s].soft`), and theme switching is one attribute on `<html>` with no React re-render. Never give a colour its only definition inside a media or `[data-theme]` block.
- **Light is the default theme and is deliberately flat; dark is card-led.** They are not mirror images. White cards on the light ground measure 1.12:1, a band that direct sunlight erases, so light carries structure with type, space and hairlines while dark keeps fills. `faint` is **not a text colour** in either theme — labels use `muted`.
- **Status is carried by a glyph, not colour.** Five statuses that all pass AA on one ground are forced into a narrow luminance band, so they collide in greyscale and for colourblind users. `STATUS[key].glyph` (`✓ ∴ ›› ‹‹ ‖`) is the channel; colour reinforces. Hue maps to urgency, and `with` is a neutral, so a well-grouped trip renders with no colour at all.
- **Avatar colours come from theme-paired tokens** (`--c-av-N` / `--c-av-N-ink`), and the slot is the member's **index in the participant list**, not a hash of the id — hashing collided often enough at 8 slots that two riders shared a colour. The list order is identical on every device because it is the stored array.
- **Geolocation:** `app/hooks/useGeolocation.ts` wraps `watchPosition`, manages permission states, and writes positions via `data.updatePosition` at a **speed-aware** cadence — `writePolicyFor` in `lib/geo.ts` scales 20s/30m down to 5s/20m as speed rises, because a cyclist at 30km/h covers 30m in under four seconds. It prefers `coords.speed` and falls back to `estimateSpeedMps`. That table is the single place to retune write pressure when Supabase lands.
- **`app/hooks/useWakeLock.ts` holds the screen awake while a trip is live** — geolocation stops being delivered when the screen sleeps, which is exactly when the group needs it. The browser releases the lock whenever the page hides, so it **must** be re-acquired on `visibilitychange`; acquiring once is not enough.
- **Haptics (`lib/haptics.ts`) are Android-only.** `navigator.vibrate` is not implemented in iOS Safari at all, so the UI says so rather than quietly doing nothing.
- **Map:** `app/components/LiveMap.tsx` — MapLibre GL with OSM raster tiles, **dynamically imported inside an effect** (keeps it out of SSR and the initial bundle). Used for both the live map and the tap-to-set destination picker in Create. There is no geocoding; destination coordinates come from the picker only.
- **The icon set is generated, not drawn by hand.** `npm run icons` (`scripts/gen-icons.mjs`) is the only source of the mark: it writes `app/icon.svg`, `public/mark.svg`, and rasterises `app/apple-icon.png` (180), `public/icon-192.png`, `public/icon-512.png`, `public/icon-maskable-512.png` and `public/icon-badge.png` through **headless Chrome**, because this machine has no rsvg/ImageMagick/sharp (`CHROME_PATH` overrides the binary). Edit the geometry there and re-run; never edit a PNG. `lib/__tests__/icons.test.ts` guards the output the way `tokens.test.ts` guards the palette — it reads real PNG dimensions out of the IHDR chunk, so a mislabelled "512" fails the build rather than silently breaking Chrome's install prompt.
- **There are two drawings, and that is deliberate.** The full mark (two range rings, two contacts) turns to mush below ~40px, so everything small gets the reduced glyph: one ring, you, one contact. That single contact is what keeps 16px reading as Radar instead of a generic bullseye — of three candidate reductions tested at 16px it was the only survivor. `Mark` in `Radar.tsx` is the reduced glyph and uses `C`, so it follows the theme for free; **`app/icon.svg` cannot** — a favicon inherits no colour, so it hard-codes both palettes behind `prefers-color-scheme` and a test forbids `currentColor` in it.
- **The app tile is cream (`#F5F3EE`), not the dark ground.** Measured at 60px against three wallpapers: the dark tile disappears completely on a dark wallpaper, leaving rings floating with no tile. Cream also equals the manifest's `background_color`, so the icon flows into the splash screen. The tile is fixed, not theme-aware — it sits on whatever wallpaper the phone has.
- **Demo mode:** `lib/demo.ts` (`startDemoConvoy`) injects three scripted members that move toward the destination, so one person can see the whole experience solo. Offered only when you're the sole member. It writes through the real `data` layer with fixed `demo-*` ids, and its cleanup only stops the interval — the demo participants stay in that trip's localStorage.

## Things that will bite you

- **Never run two dev servers for this repo at once.** They share one `.next`, and the second one wedges the first: compiled routes (`/`, `app/icon.svg`, `app/apple-icon.png`) hang forever with no error while `public/` files keep serving fine, which makes it look like a routing bug rather than an environment one. `pgrep -f next-server` and check each one's cwd before debugging anything else.
- **Never run `npm run build` while `npm run dev` is running.** The build overwrites `.next` underneath the dev server and every dynamic route starts 404ing with `PageNotFoundError`. Stop dev, build, `rm -rf .next`, restart.
- **A `flex-1` scroll container needs `min-h-0`** or it refuses to shrink below its content and pushes the bottom action bar out of the frame. Every scroller in `Radar.tsx` has it.
- **Heights are `100dvh`, never `100vh`** — the mobile dynamic toolbar makes `100vh` taller than the visible viewport.
- **Safe areas only work because `app/layout.tsx` sets `viewportFit: "cover"`.** Remove it and every `env(safe-area-inset-*)` silently becomes 0. `interactiveWidget: "resizes-content"` is likewise what keeps the soft keyboard from pushing bottom CTAs off Create and Join.
- **Text inputs must stay ≥16px** or iOS Safari zooms the viewport on focus. A test enforces this.
- The theme is stamped on `<html>` pre-paint by `THEME_BOOTSTRAP` in `lib/theme.ts`, inlined into `<head>`. Any client effect that writes `data-theme` must handle **every** choice, not just `"system"` — an early version returned early for explicit choices and left the bootstrap's value clobbered.

## Testing constraints

Vitest runs in the **`node` environment** with `include: ["**/*.test.ts"]` (`vitest.config.ts`). Two consequences: there is no DOM, so browser globals must be stubbed (`vi.stubGlobal` + `vi.resetModules()` — see `lib/__tests__/clientId.test.ts`); and a `.test.tsx` file is silently **not collected**. Component tests need a config change (jsdom + the `tsx` glob) first. For time-dependent store behavior (expiry, staleness) use the `__withClock` seam on `createLocalData` rather than faking timers.

Two tests in `lib/__tests__/tokens.test.ts` are **regression guards over source files**, not unit tests: one recomputes WCAG contrast for every token pair in `app/globals.css` and asserts the thresholds the spec claims, the other asserts no `fontSize` below 12 in the screen components and no `<input>` below 16. If you change the palette or the type scale, these fail on purpose — read §5 and §7 of the spec before "fixing" them.

## Naming

The product is **Radar** (settled Sept 2026; previously GroupTrack, briefly Caravan). Every user-visible mention reads from `PRODUCT_NAME` in `lib/brand.ts`, so a future rename is one line.

Two things deliberately still say the old name, and **must not be "cleaned up"**:

- `gt:trip:` / `gt:code:` / `gt:participants:` / `gt:theme` and `grouptrack:clientId` — `data.subscribe` string-matches these keys, so renaming a prefix breaks cross-tab sync *and* orphans every trip already live in someone's browser. There is no migration and no reason to want one.
- The `gtpulse` / `gtrise` / `gt-rise` / `gt-sheet` CSS animation names, which are internal and invisible.

## Docs are partly stale

`docs/superpowers/plans/2026-06-14-grouptrack-roadmap.md` still describes the codebase as "mock data and a client-side state machine" and orders Supabase first. What actually happened: Phases 2–6 shipped frontend-only on the local data layer, and **Phase 1 (Supabase) is the outstanding work** — `docs/superpowers/plans/2026-06-14-phase-1-supabase-foundation.md`, plus the 8h expiry job, RLS, and the PWA manifest. Trust the code over the roadmap's status line.
