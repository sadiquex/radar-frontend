# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Caravan — temporary location sharing for groups moving together (no accounts, no install, trips expire in 8h). The product spec is `docs/PRD.md`; the phased plan is `docs/superpowers/plans/`.

**Current state: the frontend flow is fully functional on a local (localStorage) data layer — no backend yet.** Trips, joining, live member sync, real geolocation, the status engine, the map, and notifications all work in the browser. The backend (Supabase) is deliberately deferred; the data layer is designed to be swapped for it without touching screens.

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
- **Status is derived, never stored.** `computeStatuses` (`lib/status.ts`) runs client-side on every render of the group view. `Participant.status` exists in the data model but the local store always writes `null` — don't read it, compute it. Precedence: arrived > stopped > with > ahead/behind, with thresholds as module constants (100m arrive/cluster, 150m ahead-behind margin, 5min stopped). "With group" means *near a majority of members*, which stays robust to outliers. **With no destination there is no ahead/behind** — members are only `stopped`, `with`, or `behind`.
- **`lastMovedAt` is the data layer's job, not the engine's.** `updatePosition` only bumps it when the position moved ≥20m (`MOVED_THRESHOLD_M`), which is what makes "stopped" detectable from a stream of jittery GPS fixes.
- **`GroupTrack.tsx` is a prop-driven screen library** (no mock data, no dev panel): exports each screen (`Landing`/`Create`/`Share`/`Join`/`Group`/`MemberView`/`MapView`/`Ended`/`Toast`) plus tokens `C`/`FONT`, the `Member` view-model, and `memberFromParticipant`. **Styling is inline `style={{...}}` referencing `C`/`FONT`**, not Tailwind utilities (Tailwind only maps the font CSS vars + utilities like `tnum`, `gt-rise`). `Member.located` is false until a position exists — screens then show a "sharing location soon" pre-tracking state instead of fake status.
- **Geolocation:** `app/hooks/useGeolocation.ts` wraps `watchPosition`, manages permission states, and writes throttled positions via `data.updatePosition`. Enabled once you're in the group view.
- **Map:** `app/components/LiveMap.tsx` — MapLibre GL with OSM raster tiles, **dynamically imported inside an effect** (keeps it out of SSR and the initial bundle). Used for both the live map and the tap-to-set destination picker in Create. There is no geocoding; destination coordinates come from the picker only.
- **Demo mode:** `lib/demo.ts` (`startDemoConvoy`) injects three scripted members that move toward the destination, so one person can see the whole experience solo. Offered only when you're the sole member. It writes through the real `data` layer with fixed `demo-*` ids, and its cleanup only stops the interval — the demo participants stay in that trip's localStorage.

## Testing constraints

Vitest runs in the **`node` environment** with `include: ["**/*.test.ts"]` (`vitest.config.ts`). Two consequences: there is no DOM, so browser globals must be stubbed (`vi.stubGlobal` + `vi.resetModules()` — see `lib/__tests__/clientId.test.ts`); and a `.test.tsx` file is silently **not collected**. Component tests need a config change (jsdom + the `tsx` glob) first. For time-dependent store behavior (expiry, staleness) use the `__withClock` seam on `createLocalData` rather than faking timers.

## Naming drift (ask before "fixing")

The project was renamed to Caravan in the README only. The code still says GroupTrack everywhere: `package.json` name, `metadata.title` in `app/layout.tsx`, the notification title, `GroupTrack.tsx`, the storage-key prefixes, and the docs. A rename is a real change with the storage-key consequences noted above, not a cleanup.

## Docs are partly stale

`docs/superpowers/plans/2026-06-14-grouptrack-roadmap.md` still describes the codebase as "mock data and a client-side state machine" and orders Supabase first. What actually happened: Phases 2–6 shipped frontend-only on the local data layer, and **Phase 1 (Supabase) is the outstanding work** — `docs/superpowers/plans/2026-06-14-phase-1-supabase-foundation.md`, plus the 8h expiry job, RLS, and the PWA manifest. Trust the code over the roadmap's status line.
