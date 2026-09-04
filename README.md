# Radar

Temporary location sharing for groups moving together. No accounts, no app install, expires in 8 hours.

Next.js 14 (App Router) + TypeScript + Tailwind + MapLibre. **The frontend flow is fully functional** — create a trip, share a link, join, share live location, and watch who's ahead / behind / with the group / stopped / arrived. It runs entirely in the browser today on a local data layer; the backend (Supabase) is deferred and slots in without changing the UI.

Built mobile-first for people moving outdoors, with a sunlight-grade light theme as the default and a real dark theme for night. The design and the reasoning behind every value are in `docs/superpowers/specs/2026-09-04-mobile-light-redesign-design.md`.

## Getting started

Requires Node 18.17+ (Node 20 LTS recommended).

```bash
npm install
npm run dev
```

Open http://localhost:3000

### Try the whole experience solo

1. **Create a trip** (optionally pin a destination on the map).
2. On the group screen, allow location when prompted, then tap **"Preview with a demo convoy"** — scripted members move toward the destination so you can see statuses, the horizon, the map, and notifications come alive.
3. To test real multi-device sync, open the **join link** in a second tab/incognito window — members appear live across tabs.

## Commands

```bash
npm run dev          # dev server
npm run build        # production build
npm run start        # serve the build
npm run lint         # eslint
npm test             # vitest unit tests (pure logic)
npm run test:watch   # vitest watch
```

## Project structure

```
app/
  layout.tsx                Root layout, loads Bricolage Grotesque + Inter + JetBrains Mono
  globals.css               Tailwind base, keyframes, focus ring, tabular-nums, reduced-motion
  page.tsx                  Landing → create → share flow
  join/page.tsx             Join by typed code
  t/[code]/page.tsx         Live group view (geolocation, statuses, notifications, map/member sub-views)
  t/[code]/join/page.tsx    Join by link (code prefilled)
  components/
    Radar.tsx               Prop-driven screen library + design tokens (C / FONT) + Member view-model,
                            plus MenuSheet (trip options) and GlanceView (bar-mount mode)
    PhoneFrame.tsx          Phone-shaped shell (full screen on mobile, device frame on desktop)
    JoinFlow.tsx            Shared join logic for both join routes
    LiveMap.tsx             MapLibre GL map (OSM tiles) — live pins + destination picker
  hooks/
    useGeolocation.ts       watchPosition wrapper → speed-aware writes to the data layer
    useWakeLock.ts          Holds the screen awake while a trip is live
lib/
  data/                     Swappable data layer: local.ts (localStorage store) + index.ts (singleton + cross-tab sync)
  clientId.ts               Per-browser identity (no accounts)
  brand.ts                  PRODUCT_NAME — the single source for every user-visible mention
  shareCode.ts  geo.ts  status.ts  notify.ts  demo.ts
  verdict.ts  theme.ts  haptics.ts              (pure logic; unit-tested in lib/__tests__/)
docs/
  PRD.md                    Product spec
  superpowers/plans/        Phased roadmap + per-phase plans
```

## How the data layer works (the key design decision)

The entire app talks to one interface: the `data` singleton (`lib/data/index.ts`). Today it's backed by `localStorage` (`lib/data/local.ts`), with cross-tab "realtime" via the browser `storage` event. When the backend lands, we replace `lib/data/index.ts` with a Supabase implementation of the **same** interface (`createTrip`, `getTripByCode`, `joinTrip`, `updatePosition`, `listParticipants`, `leaveTrip`, `endTrip`, `subscribe`) — screens and routes don't change.

## What's real vs deferred

| Piece | Status |
|---|---|
| All screens, real routes & navigation | Real |
| Trip create / share code / join by link or code | Real (local data layer) |
| Live member sync | Real — cross-tab today via storage events; Supabase Realtime later |
| Geolocation | Real `navigator.geolocation.watchPosition`, speed-aware cadence (20s/30m walking → 5s/20m riding) |
| Status engine (ahead/behind/with/stopped/arrived) | Real, pure + unit-tested |
| Map | Real — MapLibre GL + OpenStreetMap tiles, live pins, destination picker |
| Notifications | Real — opt-in browser notifications + in-app toasts on status changes |
| Haptics | Real on Android; `navigator.vibrate` does not exist in iOS Safari |
| Screen wake lock | Real where supported (iOS 16.4+, most Android); a silent no-op elsewhere |
| Light / dark themes | Real — light default, follows the system preference, manual override in ⋯ |
| Persistence / multi-device across the internet | Deferred — needs Supabase (currently per-browser localStorage) |
| Geocoding (destination name → coordinates) | Deferred — set the destination via the map picker for now |
| Trip expiry job, RLS, PWA install | Deferred — see the roadmap |

## Design system

`C` in `app/components/Radar.tsx` maps token names to CSS custom properties; the values live in `app/globals.css`, declared for light on `:root` and for dark under both `prefers-color-scheme` and `[data-theme="dark"]`. **You cannot do colour arithmetic in JS** — use the declared `--c-*-soft` tokens.

- **Light is the default and is deliberately flat.** White cards on the light ground measure 1.12:1, a band direct sunlight erases, so structure comes from type, space and hairlines. Dark keeps its card fills — the two themes are tuned to their conditions, not mirrored.
- **Status carries a glyph** (`✓ ∴ ›› ‹‹ ‖`), not just a colour: five statuses that all pass AA on one ground collide in greyscale, so colour is reinforcement only. Hue maps to urgency and "with group" is neutral — a well-grouped trip renders with no colour at all.
- **Display**: Bricolage Grotesque (headings, large numbers, the trip code)
- **Body**: Inter
- **Data**: JetBrains Mono (distances, timestamps, eyebrow labels)

Two things carry the group view: the **verdict** (`lib/verdict.ts`) reduces everyone to one sentence and one number, because a rider at effort reads one field rather than eight; and the **group horizon** answers "where is everyone?" without a map.

## Remaining work (backend integration)

See `docs/superpowers/plans/2026-06-14-grouptrack-roadmap.md`. In short: stand up Supabase (`trips` + `participants` + Realtime), swap the data layer implementation, add the 8h expiry/cleanup job and RLS, then the PWA manifest.

## Tech choices, briefly

- **Next.js App Router** — real routes per screen; API routes available later for non-Supabase work.
- **MapLibre GL + OSM raster tiles** — no API key for the prototype; move to a keyed vector provider before production traffic.
- **lucide-react** for icons.
- **No state library** — `useState` + the data-layer subscription is enough at this scope.
- **No shadcn yet** — every piece is custom-styled to the design direction; add primitives when you need accessible behavior, not for visual defaults.
