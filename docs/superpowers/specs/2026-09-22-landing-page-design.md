# A landing page at the root, and the app one segment down

**Date:** 2026-09-22
**Status:** Approved design, ready for an implementation plan
**Scope:** A new marketing landing page at `/`; the app relocates to `/app`. No API changes, no data-layer changes, no new dependencies.

---

## 1. Why

The domain opens the app. Someone who has never heard of Radar arrives at a screen asking them to start a trip or join with a code, with no answer to *what is this* and no reason to trust it with their location. The app's own landing screen (`Landing` in `Radar.tsx`) does a good job for a 460px phone frame and is the wrong instrument for this job: it is a first-run screen, not an argument.

Radar also has an argument worth making, and it is not the usual one. Almost every location-sharing product sells "everyone on a map." Radar's thesis is the opposite — the group collapses to one sentence and one number, and then the coordinates are deleted. Both halves are true in code (`lib/verdict.ts`; no position-history table, §6 of PROJECT-OVERVIEW) and neither is visible to a stranger.

Secondary: publishing the Google OAuth app out of Testing mode requires an App domain, which a real home page provides. It still requires privacy-policy and terms URLs, which are explicitly **out of scope here** (§3).

## 2. Goals

1. A landing page at `/` that explains Radar to someone who has never seen it, in the product's own visual language.
2. Demonstrate the verdict engine by **running it**, not by describing it.
3. Move the app to `/app` without breaking a single share link.
4. No new dependencies, no new palette, no new fonts.
5. The four-green bar stays green: `npx tsc --noEmit`, `npm test`, `npm run lint`, `npm run build`.

## 3. Non-goals

- **No privacy or terms pages.** Decided explicitly. They remain the outstanding work for the OAuth publish.
- No blog, changelog, about page, or reusable marketing shell. One page.
- No CMS, no MDX, no animation library, no analytics.
- No change to `lib/data/`, the API, or any component in `Radar.tsx`. The landing page is a consumer of `lib/`, never an editor of it.
- No redirect from `/` into the app for returning users — a redirect makes the page unshareable.

---

## 4. Routing

### 4.1 The move

The app must move because `/` can hold only one page. Route groups cannot resolve the collision — `(tabs)` and a marketing group would both claim `/`.

| From | To |
|---|---|
| `app/(tabs)/layout.tsx` | `app/app/(tabs)/layout.tsx` |
| `app/(tabs)/page.tsx` | `app/app/(tabs)/page.tsx` |
| `app/(tabs)/trips/page.tsx` | `app/app/(tabs)/trips/page.tsx` |
| `app/(tabs)/you/page.tsx` | `app/app/(tabs)/you/page.tsx` |
| `app/(tabs)/repairs/page.tsx` | `app/app/(tabs)/repairs/page.tsx` |
| `app/(tabs)/t/[code]/page.tsx` | `app/app/(tabs)/t/[code]/page.tsx` |
| `app/trips/[tripId]/page.tsx` | `app/app/trips/[tripId]/page.tsx` |

**Unmoved, deliberately:** `app/join/page.tsx` and `app/t/[code]/join/page.tsx`. These are the two deep links that exist in the wild — a share link is `${origin}/t/${code}/join` — and moving them would break every code already shared. `app/layout.tsx`, `app/globals.css`, `app/icon.svg`, `app/apple-icon.png`, `app/components/`, `app/hooks/` all stay where they are.

Resulting surface:

```
/                       landing                      (new)
/app                    dashboard, or landing screen when signed out
/app/trips              /app/you   /app/repairs
/app/t/[code]           the live group view
/app/trips/[tripId]     one past trip
/join                   unchanged
/t/CODE/join            unchanged
```

`(tabs)` is a real directory, so every moved file gains one `../` on its relative imports (`"../components/Radar"` becomes `"../../components/Radar"`; `repairs/page.tsx` goes from `"../../components/Repairs"` to `"../../../components/Repairs"`). `@/lib/...` alias imports are unaffected.

### 4.2 Link updates

Every site below is a literal string in a `router.push`/`router.replace` or an href table.

| File | Change |
|---|---|
| `app/app/(tabs)/page.tsx` | `/trips` → `/app/trips`; `/trips/${id}` → `/app/trips/${id}`; `` `/t/${code}` `` → `` `/app/t/${code}` `` (2 sites). `/join` unchanged (2 sites) |
| `app/app/(tabs)/trips/page.tsx` | `replace("/")` → `"/app"`; `/trips/${id}` → `/app/trips/${id}`; `` `/t/${code}` `` → `` `/app/t/${code}` ``; `push("/")` → `"/app"` |
| `app/app/(tabs)/you/page.tsx` | `replace("/")` and `push("/")` → `"/app"` |
| `app/app/(tabs)/t/[code]/page.tsx` | `push("/")` → `"/app"` (2 sites). **`` replace(`/t/${code}/join`) `` stays** — the join route did not move |
| `app/app/trips/[tripId]/page.tsx` | `replace("/")` → `"/app"`; `` replace(`/t/${code}`) `` → `` `/app/t/${code}` ``; `replace("/trips")` → `"/app/trips"` (2 sites) |
| `app/components/JoinFlow.tsx` | `` push(`/t/${code}`) `` → `` `/app/t/${code}` ``; `push("/")` → `"/app"` (2 sites) |
| `app/components/TabBar.tsx` | `TABS` hrefs: `/` → `/app`, `/trips` → `/app/trips`, `/repairs` → `/app/repairs`, `/you` → `/app/you` |
| `public/manifest.json` | `"start_url": "/"` → `"/app"` |

The two share-URL builders produce `${window.location.origin}/t/${trip.shareCode}/join` and are **correct unchanged**. Verify, do not edit.

### 4.3 The installed-PWA wrinkle

A PWA installed before this change cached `start_url: "/"`, so those users will open onto the marketing page. There is no way to reach back into an installed manifest, and a redirect is ruled out by §3.

Mitigation: the landing reads the existing pre-paint signed-in flag (`SIGNED_IN_BOOTSTRAP` / `lib/accountFlag.ts`, which already stamps `data-signed-in="1"` on `<html>` before first paint) and swaps its **primary CTA label and target** for anyone who has used Radar before:

- no flag → **Start a trip** → `/app`
- flag set → **Open Radar** → `/app`

Both go to the same place; only the label changes. **Both labels are always in the markup**, inside one anchor, and CSS on `[data-signed-in="1"]` decides which is visible — so the server and the client render identical trees and there is no hydration mismatch and no flash. This is exactly the mechanism `.gt-tabbar` already uses in `globals.css`, and `lib/accountFlag.ts` documents why the obvious conditional-render approach does not work: React discards the whole server document on a mismatch and throws away whatever `THEME_BOOTSTRAP` had just set.

---

## 5. The demonstration engine

### 5.1 Principle

The landing page's verdict text is **not copy**. It is `computeVerdict()`'s return value, computed in the browser from coordinates, through the same `computeStatuses` the app runs. If `AHEAD_BEHIND_MARGIN_M` or `ARRIVE_RADIUS_M` changes, the landing page changes with it, and if the engine ever returned something incoherent the landing page would say so in public.

This is why the page couples to `lib/` (pure, TDD'd, stable) and **not** to `Radar.tsx`. `Radar.tsx` is a screen library inline-styled for a 460px frame — 13px labels, 44px hit targets, `PAD_T`/`PAD_B` safe-area composites — and `CLAUDE.md` records that its exports were kept in place specifically to avoid a disruptive move. The landing page imports from it only what is scale-free: the `STATUS` table, `C`, `FONT`, and `Mark`.

`LiveScope` is imported and used **as-is**. It takes a `size` prop and draws in a 200-unit viewBox, so it is the one existing component that genuinely scales to a hero.

### 5.2 `lib/landing/convoy.ts`

Pure, deterministic, no React, no clock of its own.

```ts
/** A four-person ride to Akosombo, scripted so the verdict earns each state. */
export const CONVOY_DESTINATION: { name: string; lat: number; lng: number };
export const CONVOY_TICKS: number;          // length of the script
export const VIEWER_ID: string;             // deliberately NOT one of the riders — see below

/** The convoy's positions at `tick`, clamped into range. */
export function convoyAt(tick: number, now: number): Participant[];
```

Four riders — **Ama, Kofi, Yaw, Esi** — interpolated along a polyline of hardcoded coordinate pairs in the module itself. No network, no geocoding, no map: the demo needs distances that behave, not a route that exists.

**`VIEWER_ID` is not one of the four, deliberately.** `computeVerdict` picks its metric anchor from whether the viewer is located: `useGroupReference = !selfLocated || ...`, and with a located self it measures the subject against *you* and labels the metric `KM BEHIND YOU`. A page visitor is not in this convoy, so an unlisted viewer id is both the honest framing and the one that produces `1.4 / KM BEHIND THE GROUP` — the reading the launch video and §6 use. It also keeps a fictional "You" row out of the roster, and means `isSelf` is never true, so no branch can emit "You have fallen behind" at a stranger. Ghanaian names and a Ghanaian destination, consistent with the launch video (`Ama is 1.4 km back`) and the repairs fixtures (Osu); a landing page demoing a convoy through San Francisco would be a lie about who this is for.

The script is written so the engine passes through, in order:

1. `HEADS UP` / *Ama is 1.4 km back* — Ama drifts past the 150 m margin
2. `ALL GOOD` / *All together* — she closes up, everyone inside the cluster radius, metric `KM TO AKOSOMBO`
3. `ARRIVED` / *Kofi has arrived* — Kofi crosses the 100 m arrival radius

The consumer owns the clock: a component holds `tick` in state and advances it, and passes `now` in. `convoyAt` never reads `Date.now()` itself, which is what makes it testable and what keeps the render deterministic.

Everything under `lib/` imports **relatively** (`../geo`, `../../status`), never through the `@/` alias: `vitest.config.ts` declares no alias, so an `@/` import in a module a test pulls in resolves under Next and fails under the test runner. Components under `app/` may keep `@/lib/...` — they are `.tsx` and are never collected.

`lastMovedAt` is set per rider per tick so `stopped` never fires accidentally mid-script; `now` is passed into `computeStatuses`/`computeVerdict` from the same component, so every value on one paint agrees — the convention `HomeDashboard` already follows.

### 5.3 Tests — `lib/landing/__tests__/convoy.test.ts`

The script is a claim about the engine, so it is asserted rather than eyeballed:

- Running `convoyAt` across every tick through `computeStatuses` + `computeVerdict` yields all three beats above, in order.
- No tick produces a `waiting` verdict or an empty headline — the page must never display a blank card.
- Every rider has a position at every tick (`computeStatuses` omits unlocated members, and an omitted member is an empty roster row).
- The script is deterministic: two calls at the same tick are deeply equal.

---

## 6. The page

Two acts, as approved: a dark instrument field, then the cream ground the app actually uses. The crossing is the argument — *drawn to be read in sunlight*.

### Act I — the scope (dark)

Full height, `.gt-night` (§7.1).

- **Nav** — `Mark` + "Radar" left; one text link right (label per §4.3).
- **Eyebrow**, DM Mono, tracked: `TEMPORARY LOCATION SHARING`
- **H1** — the line already settled across the app's landing screen, the launch video and the share copy. Changing it here would make three surfaces disagree.
  > Know where everyone is.
  > *Without the calls.*   ← second line in `muted`
- **Sub** — "For groups moving together — a cycling group, a convoy, a hiking party. Join from a link in seconds, with nothing to install. Every trip expires in 8 hours."
- **CTAs** — primary per §4.3 → `/app`; secondary "Join with a code" → `/join`.
- **Micro-line** — "Nothing to install. An account is optional." **Not** "no account needed": accounts exist, `signInAvailable` is true whenever the API and a Google client id are configured, and claiming otherwise misrepresents the product. §3a below carries the full story.
- **The scope** — `LiveScope` at ~420px, sweeping, contacts arriving on the ring one at a time over the first few seconds. The page performs its own join sequence.
- **Closing line**, set large, on the hairline that ends the act:
  > A map full of pins answers nothing.

The crossing to cream is a clean cut on a 1px `--c-arrived` rule — a horizon line, not a gradient. Gradients between two theme-dependent tokens cannot be expressed given `C` holds `var()` references and colour arithmetic in JS is impossible (`CLAUDE.md`).

### Act II — cream

**§1 The verdict.** The centrepiece; §5 running.

- Eyebrow `THE WHOLE GROUP, IN ONE LINE`
- H2 "A map shows you dots. Radar tells you what they mean."
- Body: "Everyone's position reduced to one sentence and one number, because a rider at effort reads one field, not eight. This is the engine running, not a recording — four riders on the road to Akosombo: one falls back and catches up, then another reaches the destination." The two clauses name two different riders on purpose. Ama is the only rider who falls behind and rejoins, Kofi the only one who arrives, and he always arrives alone; a single parallel list ("falling back, catching up, and arriving") would describe one rider doing all three, which no tick in the script produces.
- The card: verdict block at marketing scale (eyebrow · headline · metric + metric label), the horizon strip beneath it (`START ──●──●────● AKOSOMBO`), then four roster rows — avatar, name, glyph, status word, distance. No "You" row; the viewer is watching the group, not in it (§5.2).

**§2 The five statuses.** Read from `STATUS[]` so the labels and colours cannot drift from the app.

| Glyph | Label | Rule |
|---|---|---|
| `✓` | Arrived | Within 100 m of the destination |
| `››` | Ahead | More than 150 m closer than the group's median |
| `‹‹` | Behind | More than 150 m further than the median |
| `∴` | With group | Near a majority of the others |
| `‖` | Stopped | Hasn't moved 20 m in five minutes |

Closing note: "Status is carried by a glyph, never by colour alone — so it survives sunlight, greyscale and colour blindness."

**§3 Then it forgets.** The privacy beat and the loudest typographic moment on the page.

- H2 "Then it forgets."
- Body: "Eight hours after a trip starts, every coordinate is deleted. Not archived. Not anonymised. Deleted."
- A receipt of what a finished trip leaves behind — and only if somebody in it was signed in and therefore asked for one:

  ```
  Trip name             kept
  When it ran           kept
  Where it was headed   kept
  Who finished          kept
  ─────────────────────────────────
  Every coordinate      deleted
  The route taken       never recorded
  ```

- Kicker: "There is no position-history table to keep them in. Coordinates are overwritten in place, never appended."

**§3a Optional accounts.** The page cannot claim "no account needed" and also be true: Google sign-in exists. It is genuinely optional, and saying so properly *strengthens* the privacy argument rather than weakening it.

- Eyebrow `OPTIONAL ACCOUNTS`
- H2 "Signed in or not, it works the same."
- Body: "Radar needs no account. Starting a trip, joining one, the verdict, the map — all of it works with nobody signed in."
- What it buys: "Signing in with Google adds three things — a history of the trips you took, a name that follows you instead of being typed into every trip, and settings that follow you between devices."
- The kicker, which is the point: "It takes two fields from Google: an account identifier and a display name. Not your email. Not your picture. There is no email column in the database to put one in."

Verified against the code, not the docs: `lib/data/account.ts`'s `AccountProfile` is `{ displayName: string }` and nothing else; the `users` table is keyed on `google_sub` with a display name and has **no email column**; `signInAvailable = BACKEND === "http" && googleClientId.length > 0`.

Sign-in is described, **not** offered as a call to action — the same posture the in-app landing screen takes, where it sits below the two things people came to do. That also keeps the page honest if the OAuth app is still in Testing mode (PROJECT-OVERVIEW §14 open item 2), where an outside visitor pressing a sign-in button would meet "Access blocked".

**§4 How it works.** Three steps.

1. **Start a trip** — "Name it if you like, and set where you're headed — search for the place, or drop a pin on the map. Both optional." Destination search shipped (`app/components/DestinationSearch.tsx`, `GET /v1/geocode` proxying Photon); "drop a pin" alone understates it.
2. **Share the code** — "Six characters, a link, or a QR code. No `0`/`O` or `1`/`I`, so nobody mishears it." Shown on a real share-code card.
3. **Ride** — "Everyone sees the same one-line verdict. Nobody installs anything."

**§5 Built to be read at speed.** Four one-liners of craft.

- *Light by default* — "A dark screen loses to reflected sunlight, so the light theme is the tuned one."
- *Signage type* — "Archivo and Signika, drawn for wayfinding rather than for web apps. They hold at 13px in glare."
- *The screen stays awake* — "Geolocation stops being delivered when the screen sleeps, which is exactly when the group needs it. Radar holds the screen on for the length of a trip, wherever the browser allows it." The trailing caveat is load-bearing: the app itself only claims this when `'wakeLock' in navigator`, and the landing page must not claim more than the product does.
- *Writes speed up as you do* — "Every 20 seconds at rest, every 5 at 30 km/h. A cyclist covers 30 m in under four seconds."

**§6 Close.** "Start a trip." · "It takes about ten seconds, and it expires by itself." · the same two CTAs.

**Footer.** `Mark` + Radar, the one-line description, links to `/app` and `/join`. No legal links (§3).

### 6.1 Files

```
app/page.tsx                            the landing (server component; metadata + section assembly)
app/components/landing/Hero.tsx         act I, incl. the arriving contacts
app/components/landing/VerdictDemo.tsx  act II §1, the running engine
app/components/landing/Sections.tsx     act II §2–§6 + footer (presentational, no state)
lib/landing/convoy.ts                   the script
lib/landing/__tests__/convoy.test.ts
public/og.jpg                           copied from brag-output/brag.jpg
```

Three components, not nine. §2–§6 are static presentation with no state between them and splitting them buys nothing today.

---

## 7. Visual system

No new tokens, no new fonts. Everything resolves through `C`/`FONT` and `app/globals.css`.

### 7.1 `.gt-night` — dark tokens inside a light page

The hero must be dark regardless of the visitor's theme. `:root[data-theme="dark"]` matches only `<html>`, so it cannot be scoped to a section, and a second block repeating thirty values would drift from the first.

Instead, `.gt-night` joins the existing explicit-dark block as a second selector, **written above it**:

```css
/* The night ground, for a section that must stay dark inside a light page —
   the landing hero. A second selector rather than a copy: two copies of thirty
   values drift, and `tokens.test.ts` only guards one of them.
   `.gt-night` is written FIRST so the literal `:root[data-theme="dark"] {`
   that test searches for is still present verbatim. */
.gt-night,
:root[data-theme="dark"] {
  color-scheme: dark;
  --c-ground: #0E1116;
  /* …unchanged… */
}
```

Custom properties resolve from the nearest declaring ancestor, so a `.gt-night` section wins over `:root` in either theme, and in dark mode it declares identical values and changes nothing. The section sets its own `background: var(--c-ground)` because `html, body` no longer covers it.

**This requires no test change**, verified by running the test's own parser over the patched stylesheet: the selector is still found, all 35 tokens parse with identical values, the "two dark blocks identical" assertion still holds, and all three hygiene `toContain` checks still pass. `tokens.test.ts` finds its block by `css.indexOf(':root[data-theme="dark"] {')`, which the patched file still matches exactly because `.gt-night` is written on the line above. `color-scheme: dark` on a section affects form controls and scrollbars within it, and the hero has none.

### 7.2 Type scale

Marketing scale, clamped, never below the 12px floor `tokens.test.ts` enforces.

| Role | Face | Size | Tracking |
|---|---|---|---|
| H1 | Archivo 500 | `clamp(2.75rem, 7vw, 6rem)` / lh 0.98 | −0.04em |
| H2 | Archivo 500 | `clamp(2rem, 4vw, 3.25rem)` / lh 1.05 | −0.03em |
| Eyebrow | DM Mono 500 | 12px, uppercase | 0.14em |
| Body | Signika | `clamp(1rem, 1.2vw, 1.1875rem)` / lh 1.55 | — |
| Micro | Signika | 13px, `muted` | — |

DM Mono stops at 500; nothing may ask it for a heavier weight or the browser synthesises a smeared faux-bold.

Content column 1200px, full-bleed bands to 1440px, 24px gutters. Single column below 900px, with the scope moving under the hero copy rather than beside it.

---

## 8. Motion

Everything is transform/opacity only, and the global `prefers-reduced-motion` block in `globals.css` already reduces every duration to 0.001ms.

- The sweep is the existing `.gt-sweep` (5s linear, compositor-only).
- Hero contacts arrive on a stagger.
- **No scroll-triggered section entrances.** The motion budget is spent on the two things that carry meaning — the sweep and the running verdict — and headings fading in as you scroll is decoration this page does not need.

  *Correction, found during implementation:* the original reason given here was that an `IntersectionObserver` would force the static half of the page to become a client component. That reason is void — `Sections.tsx` is a client component regardless, because it consumes `C`/`FONT`/`STATUS` from `Radar.tsx`, which carries `"use client"`, and the build fails without the directive. The decision stands on the motion-budget argument alone; the cost argument was wrong and is recorded here rather than quietly dropped.
- **The convoy pauses when off-screen.** A `setInterval` ticking a demo nobody is looking at is a battery cost on a phone, and this page is mostly read on phones.
- **Under reduced motion the convoy freezes on a representative frame** rather than inheriting the global 0.001ms override, which would otherwise flicker the whole script past in an instant. This is an explicit `matchMedia` check, not a CSS consequence.
- Nothing scroll-scrubbed, nothing parallax, no scroll hijacking.

---

## 9. Accessibility

- One `h1`; every act II section opens on an `h2`. Nav and footer are `<nav>`/`<footer>`.
- CTAs are `next/link` anchors, not buttons: openable in a new tab, and crawlable.
- `LiveScope` is already `aria-hidden` and everything it draws must be restated in text, which the hero copy does.
- **The verdict demo is `aria-hidden` and carries no live region.** A headline rewriting itself every few seconds would be announced repeatedly and would make the page hostile to a screen reader. Adjacent to it, a single static sentence states what the demo shows.
- The dark hero uses the audited dark palette, so its contrast is already proven by `tokens.test.ts`.
- Focus-visible rings come from the existing `:focus-visible` rule.

---

## 10. Testing

The page is presentational and Vitest here runs in the `node` environment with `include: ["**/*.test.ts"]`, so a `.test.tsx` would be silently uncollected. Testing therefore targets the logic and the guards.

1. **`lib/landing/__tests__/convoy.test.ts`** — §5.3.
2. **`tokens.test.ts`: make the component scan recursive.** It currently does `readdirSync(join(root,"app","components")).filter(f => f.endsWith(".tsx"))` — non-recursive, so everything in `app/components/landing/` would go unscanned for the 12px floor. This is exactly the failure the test's own history records: the hand-written list it replaced "silently stopped covering every screen added after it was written." Walk the tree instead. The assertions are unchanged; only enumeration changes.
3. **Four green** — `npx tsc --noEmit`, `npm test`, `npm run lint`, `npm run build`. Do not run the build while a dev server is up (`CLAUDE.md`).
4. **Manual, after the move:** `/t/CODE/join` resolves; joining lands on `/app/t/CODE`; the tab bar navigates to all four `/app/*` routes; `/app/trips/<id>` opens a past trip; the installed-PWA CTA swap shows "Open Radar" with `data-signed-in="1"` on `<html>`.

---

## 11. Metadata

`app/page.tsx` exports its own `metadata`, overriding the root layout's:

- `title` — "Radar — Know where everyone is. Without the calls."
- `description` — the existing one-liner.
- `openGraph` / `twitter` — same, with `/og.jpg` (copied from `brag-output/brag.jpg`, 1920×1080, already on-message).
- `metadataBase` must be set in `app/layout.tsx` or the OG image URL resolves relative and Next warns at build.

---

## 12. Risks

| Risk | Mitigation |
|---|---|
| Installed PWAs open on the landing page | §4.3 CTA swap. Accepted: it is one tap, and the alternative breaks shareability |
| A missed link leaves a dead `/trips` route | §4.2 is the complete list, produced by grepping every `router.push`/`replace` and `href`; the manual pass in §10.4 walks all of them |
| The convoy script drifts from the engine and starts showing a blank or `waiting` verdict | §5.3 asserts the whole script through the real engine, so it fails in CI rather than in public |
| The dark hero duplicates the palette and drifts | §7.1 shares one declaration block |
| New landing components escape the 12px floor guard | §10.2 makes the scan recursive |

## 13. Still outstanding after this

Publishing the Google OAuth app out of Testing mode needs an App domain (this provides it) **plus** privacy-policy and terms-of-service URLs, which §3 puts out of scope. That work is unchanged and unblocked by this.
