# Home and the trip screen — Design

*9 Sep 2026. A redesign, and the API change it turned out to need.*

## 1. What this is

Two screens are wrong in ways that share a cause, and fixing them properly needs one new
piece of data.

**Home wastes its best space.** `HomeDashboard` centres its scroller — `justifyContent: "safe
center"` at `Account.tsx:934` — so with three live trips the whole block floats in the middle of
the viewport under a large void. The live cards are three identical slabs with no ranking
between them: the trip where two riders have stopped looks exactly like the one running fine.
And the radar scope, the one drawing on this product that carries its idea, appears **only** when
there is nothing to show. `Scope` is used at exactly one call site (`Account.tsx:970`).

**The trip screen has no way out.** `/t/[code]` sits outside the `(tabs)` route group, so the
signed-in shell's navigation vanishes the moment you open a trip. `TabBar`'s own doc comment
argues for this — "the group view is a full-bleed instrument with its own bottom action bar" —
and that was a reasonable call when the bottom bar was the only navigation. It is being reversed
deliberately.

**Non-goals.** No change to the map view itself, to `MemberView`, to the trip options sheet, to
Repairs, or to `/trips`. No visual redesign of the horizon strip — it is the signature of the
group screen and it works. No split of `Radar.tsx`, beyond not making it worse.

## 2. Decisions taken before designing

- **Home is a live status board**, not a launchpad. What is running is the screen; Start and Join
  demote to a row beneath it and promote back to primary only when nothing is running.
- **The scope becomes real instrumentation** rather than decoration, and rather than an empty
  state that disappears the moment it would have something to say.
- **The map control floats above the tab bar** rather than sitting in a segmented control at the
  top of the screen. This is a product used one-handed on a bike; the bottom right is reachable
  and the top of a tall phone is not.
- **The tab bar stays gated on `[data-signed-in="1"]`.** Somebody who joined by link and never
  signed in gets no tabs on the trip screen, exactly as they get none anywhere else. Three of the
  four tabs are account surfaces that would bounce them to sign-in.

## 3. What the data actually supports

Verified against the running code, not assumed — and one finding changed the scope of this work.

**Home cannot see status.** `LiveTripEntry` (`frontend/lib/data/history.ts:24`) carries
`tripId`, `shareCode`, `name`, `destinationName`, `memberCount`, `startedAt`, `expiresAt`,
`wasCreator`. No positions, no statuses, no distance. `GET /v1/me/trips/live`
(`backend/src/http/me.routes.ts:55`) maps `listLiveUserTrips`, whose query
(`backend/src/db/userTrips.ts:237`) selects trip columns and a member count and nothing else —
it explicitly passes `destination_lat: null, destination_lng: null` into the wire mapper.

So "two riders stopped", ranking by attention, and placing a contact by how far along a trip is
are **not** frontend work. They need the API to answer a question it has never been asked.

**The status engine is frontend-only.** `frontend/lib/status.ts` computes status from
participants, a destination and a clock, with four thresholds: `ARRIVE_RADIUS_M` (100),
`CLUSTER_RADIUS_M` (100), `AHEAD_BEHIND_MARGIN_M` (150), `STOPPED_MS` (5 min).

**Only one of those four is in the shared contract.** `backend/contract.json` — which must be
byte-identical in both repos, with a test each side asserting its own constants against it —
carries `arriveRadiusM`, and not the other three. A second implementation of this engine could
therefore drift on precisely the thresholds that decide whether somebody counts as stopped, and
nothing would fail.

**Reduced motion is already handled.** `app/globals.css:248` is a blanket
`prefers-reduced-motion` rule over `*`, so the sweep stops dead without new work. The comment at
`globals.css:195` claiming the sweep "only ever runs on an idle Home screen" stops being true and
needs correcting.

**The Group button does nothing.** In `Radar.tsx`'s bottom bar it renders with
`aria-current="page"` and no `onClick`. It is a button that cannot be pressed.

## 4. The endpoint

```
GET /v1/me/trips/live      account required, as today
  -> { trips: LiveTripEntry[], serverNow }
```

`LiveTripEntry` gains one field:

```ts
/**
 * How this trip is going, for a dashboard that is not inside it.
 *
 * Null when no member has reported a position yet — which is a real and common
 * state in the first minute of a trip, and must not be rendered as zeroes.
 */
pulse: TripPulse | null;

export interface TripPulse {
  stopped: number;
  moving: number;
  arrived: number;
  /** The status most deserving of attention, by §6's order. Null when nobody is located. */
  worst: StatusKey | null;
  /** The furthest any member still has to go, in km. Null with no destination. */
  kmLeftMax: number | null;
}
```

**Counts and one distance — never coordinates.** The caller is already a member of every trip
this covers, so a pulse discloses nothing new about them. Returning positions would be different
in kind: it would widen `/v1/me` from "your trips" to "where everyone in them is right now", for
a screen that has no use for it. Rule 1 of this API — a trip's positions are visible only to that
trip's members, through that trip — stays intact.

## 5. Keeping two status engines honest

`backend/src/domain/status.ts` is a port of `frontend/lib/status.ts`: same precedence, same
thresholds, same handling of the no-destination case. Two implementations of one rule is a
liability, and this repo already owns the tool for it.

**The four thresholds move into `contract.json`**, alongside the `arriveRadiusM` already there,
and both repos' existing contract tests assert their own constants against it. **Plus shared
status goldens**: fixed participant sets with a destination, a clock, and the expected status per
member, committed once and asserted by both suites.

This is the same argument `contract.json`'s own `$comment` makes about share codes and
`haversineMeters` — "drift fails CI instead of silently breaking 'stopped' detection". Porting
the engine without extending that mechanism would leave the two free to disagree, and the failure
would be invisible: Home would quietly report a different status from the one the trip screen
shows for the same riders.

The backend query joins each live trip's participants and their last positions. `destination_lat`
and `destination_lng`, currently discarded, are needed for real.

## 6. Attention order

One order, used by Home's cards, Home's contacts and the trip screen's member list:

```
stopped > behind > ahead > with > arrived
```

Stopped is first because it is the only status that means somebody may need help. Arrived is last
because it needs nothing. Ties break by soonest expiry.

`worst` on the pulse is this order applied across a trip's members.

## 7. The scope, as an instrument

`LiveScope` replaces `Scope` at Home's one call site. Today's `Scope` becomes its empty state:
same two range rings, same crosshairs, same sweep, same dashed outlined slot. **Nothing about the
empty state changes** — it is the drawing this redesign was asked to keep.

One contact per live trip:

| Channel | Encodes | From |
|---|---|---|
| Radius | Distance remaining — outer ring furthest, centre arrived | `pulse.kmLeftMax`, normalised against the largest `kmLeftMax` on screen |
| Angle | Nothing | A stable hash of `tripId` |
| Colour | Worst status | `pulse.worst` through the existing `STATUS` map |
| Size | Member count | `memberCount` |

**Angle deliberately encodes nothing.** There is no second dimension worth showing and inventing
one would be a lie; what it must be is *stable*, because `useLiveTrips` polls every four seconds
and a contact that jumps on every refresh reads as movement that did not happen.

**A trip with `pulse: null` renders the dashed outlined slot**, not a filled contact. That
treatment already exists in `Scope` and already means exactly this: something belongs here and
nobody is confirmed on it yet.

**The scope is `aria-hidden`.** It restates the cards, and the cards are the accessible source of
truth. Status reaches a screen reader as a word, never as a colour or a position.

## 8. Home

Top to bottom: header (unchanged) · `LiveScope` · the running line · ranked cards · Start and
Join · Recent · the retention promise.

`justifyContent: "safe center"` goes. Content starts at the top, which is what removes the void.

Each card carries the pulse in words — "2 stopped", "everyone with the group", "nobody located
yet" — with the status glyph beside it. The `STATUS` map in `Radar.tsx` already pairs a glyph
with every colour, on the argument that five statuses tuned to pass AA on one ground collide in
greyscale and for colourblind users. That argument applies here unchanged.

**Empty state:** the scope with no contacts, "Nothing running", the existing copy, and Start and
Join back at primary weight. One component, two states.

## 9. The trip screen

`/t/[code]` moves into the `(tabs)` route group. Route groups do not affect URLs, so the path is
unchanged and every share link keeps working. The page drops its own `PhoneFrame`, which
`(tabs)/layout.tsx` already mounts — mounting it twice is the one thing that would actually break.

The tab bar hides through the **existing** `useHideTabBar()` seam when `view.kind` is `"map"` or
`"glance"`. Glance is a bar-mount mode meant to be stared at from a handlebar; a nav strip belongs
there even less than on the map. `TabBar` gains a no-active-tab state, because inside a trip none
of the four sections is current.

The bottom bar is replaced by a floating **Map** pill, bottom right, above the tab bar. **Group is
deleted rather than moved** — see §3; it is a button that does nothing, and the group is the
screen you are already on.

The body tightens: the verdict block and horizon strip stay as they are, the member list adopts
§6's order, and the dead space between "Invite more" and the bottom goes.

New component `app/components/GroupScreen.tsx`. `Radar.tsx` is 2,040 lines holding fifteen
exports; this work does not go inside it. The file needs a proper split and this design does not
attempt one.

## 10. Degradation

- `pulse: null` — the dashed slot and "nobody located yet". Never zeroes.
- The whole `pulse` field absent, because the API is older than the client — every trip reads as
  `null`, the scope shows dashed slots, cards fall back to expiry order. The client must treat a
  missing field as null rather than trusting it exists.
- No destination on a trip — `kmLeftMax` is null; the contact sits on the outer ring and the card
  omits the distance. `status.ts` already has a no-destination branch and it stays authoritative.
- Signed out — no tab bar, per §2. The map pill and the ⋯ menu are unaffected.

## 11. Testing

- **`backend/src/domain/status.ts`** — the ported engine, against the shared goldens plus the
  cases `frontend/lib/__tests__` already covers.
- **Both contract tests** — extended to assert the four thresholds and to run the shared status
  goldens, so the two engines cannot drift. This is the load-bearing test of the whole change.
- **The endpoint** through `app.request()`: a trip with nobody located answers `pulse: null`; a
  trip with a stopped member answers `worst: "stopped"`; a trip with no destination answers
  `kmLeftMax: null`; and no response carries a coordinate.
- **`lib/data/history.ts`** — a live entry with `pulse` absent parses to `null` rather than
  throwing or inventing zeroes.
- **Pure frontend logic extracted and unit-tested**, because this vitest is `environment: "node"`
  and silently does not collect `.test.tsx`: §6's ordering, and the contact placement that turns
  a list of pulses into radius/angle/colour/size. The components themselves are verified in a
  browser.
- **The token guards** pick up `GroupScreen.tsx` and any new component automatically — they read
  the component directory rather than a list.

## 12. Files

| File | Change |
|---|---|
| `backend/contract.json` | four thresholds + shared status goldens |
| `frontend/contract.json` | the same file, byte-identical |
| `backend/src/domain/status.ts` · `.test.ts` | new — the ported engine |
| `backend/src/db/userTrips.ts` | join participants and positions; stop discarding the destination |
| `backend/src/domain/historyWire.ts` | `pulse` on the live wire entry |
| `backend/src/http/me.routes.ts` | compute and return the pulse |
| `backend/tests/api.me.test.ts` | the endpoint cases in §11 |
| `frontend/lib/data/history.ts` | `TripPulse`, and `pulse` parsed defensively |
| `frontend/lib/pulse.ts` · `__tests__` | new — §6's order and contact placement |
| `frontend/lib/__tests__/contract.test.ts` | the thresholds and goldens |
| `frontend/app/components/LiveScope.tsx` | new — the instrument, with `Scope` as its empty state |
| `frontend/app/components/Account.tsx` | `HomeDashboard` rewritten as the status board |
| `frontend/app/components/GroupScreen.tsx` | new — the trip screen body |
| `frontend/app/components/TabBar.tsx` | no-active-tab state; correct the doc comment |
| `frontend/app/(tabs)/t/[code]/page.tsx` | moved here; drops `PhoneFrame`; hides tabs on map/glance |
| `frontend/app/globals.css` | correct the "idle Home screen" comment on the sweep |
| `frontend/README.md`, `backend/README.md` | the pulse, and the tab bar's new reach |

## 13. Risks

**The pulse costs a query per dashboard load.** `/v1/me/trips/live` currently reads one indexed
table join; it will now also read the positions of every member of every live trip the caller is
in. That is bounded — a person is in a handful of live trips at once, each with a handful of
members — but it is polled every four seconds by every open dashboard, and it is the first
endpoint here whose cost scales with other people's data rather than the caller's. Worth watching
before it is worth optimising.

**Two status engines is a liability the goldens contain but do not remove.** The honest long-term
answer is one engine, shared. That is a bigger change than this, and §5 is the containment.

**Moving a route between groups is the riskiest edit in this design.** `/t/[code]` is the URL
every share link and QR code points at. Route groups do not change paths, so this should be
invisible — but "should be" is why §11 keeps the existing join tests green and why this is walked
in a browser from a real share link before it lands.
