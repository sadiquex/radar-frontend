# The user dashboard — Design

*8 Sep 2026. The rider-facing half. The data model, the purge changes and the
endpoints are `backend/docs/superpowers/specs/2026-09-08-trip-history-api-design.md`,
and this document assumes them.*

## 1. What this is

Signing in today buys one thing: the join form stops asking for your name. The
landing screen says as much — *"Optional — it just saves typing your name each
trip."*

This gives an account somewhere to live. A signed-in person gets a tab shell:
**Home** (resume what's running, start something new), **Trips** (everything
you've been in, and one trip in detail), and **You** (your name, your
preferences, your devices).

Signed out, the app is exactly what it is today. Same landing screen, same two
buttons, no tab bar, nothing slower.

## 2. Navigation

A route group, so the three tabs share one `PhoneFrame` and switching tabs does
not remount it:

```
app/(tabs)/layout.tsx        PhoneFrame + TabBar + the TabBarVisibility context
app/(tabs)/page.tsx          Home    — today's app/page.tsx, moved. URL unchanged.
app/(tabs)/trips/page.tsx    Trips
app/(tabs)/you/page.tsx      You
app/trips/[tripId]/page.tsx  Detail  — a leaf, outside the shell, with its own Back
```

`/t/[code]`, `/join` and `/t/[code]/join` stay outside the group. The group view
has its own bottom action bar and is a full-bleed instrument; a second nav layer
across the bottom of it would be both crowded and wrong.

Three things this has to get right.

**Home's Create and Share steps must not show tabs.** `app/page.tsx` is a
three-step state machine and the last two are full-screen: a form with a bottom
CTA, and a share code. The layout cannot see page state, so it exposes
`useHideTabBar()` and Home calls it for those two steps.

The cleaner fix is to extract Create and Share to real routes — it would also
fix Back from Share leaving the site rather than returning to Create — but that
is a refactor of a working flow and outside this work. Recorded as a follow-up.

**The tab bar renders before hydration or every cold load shifts.**
`useAccount` starts at `"loading"` and settles only after `/v1/auth/me`
resolves, so a tab bar gated on `state === "signedIn"` appears a round trip
late and pushes the page up under the reader. The shell reads a
`gt:signedIn` localStorage flag written on sign-in and cleared on sign-out, and
renders optimistically from it; `useAccount` corrects it when the real answer
lands. Same approach as `THEME_BOOTSTRAP`, and the same reason.

The new key is safe next to the load-bearing ones. `subscribe` in
`lib/data/index.ts` matches the literal prefixes `gt:trip:`, `gt:code:` and
`gt:participants:`, so `gt:signedIn` triggers no cross-tab fan-out — exactly as
`gt:theme` already does not. It is a cache of one boolean, never a source of
truth: a stale `true` shows a tab bar for the half-second before `/auth/me`
says otherwise, which is the failure this is willing to have.

**No tab bar when `signInAvailable` is false.** With `NEXT_PUBLIC_API_URL` or
`NEXT_PUBLIC_GOOGLE_CLIENT_ID` unset there are no accounts, so there is nothing
to navigate. The app must stay exactly as it was, as it does for every other
account-shaped feature.

## 3. Screens

### Home

For a signed-out visitor: the landing screen unchanged, minus the copy fixes in
§6.

For a signed-in one, in this order:

1. **Live trips.** The thing you actually came back for. A card per running
   trip: name, member count, time left, → the group view. This is the feature
   that fixes closing the tab and losing the trip, and it should be first.
2. **Start a trip** / **Join with a code**, unchanged.
3. **A three-row peek at recent trips**, with "All trips →".

### Trips

Live section, then history grouped by month, newest first, keyset-paginated
through `nextCursor`.

A row is: name (or "Untitled trip"), the outcome glyph, member count, date.
Reuse `STATUS.arrived.glyph` — the status glyphs are the app's existing
vocabulary and inventing a second set for history would be a regression in a
system that deliberately carries meaning in glyphs rather than colour.

Empty state carries the actual rule, because it is reassuring rather than
apologetic: *"Trips you take while signed in show up here. Nothing is kept for
trips taken signed out."*

### Detail (`/trips/[tripId]`)

Name, dates, duration, how it finished, and:

- **The destination on a static map with one pin**, when the trip had one.
- **The roster**, each with `✓ arrived`, `· didn't`, or `—` when the trip had no
  destination and arrival was never a question.
- **Your own line**, from `user_trips`: whether you created it, and whether you
  left early.
- **Remove from my history**, with a confirm.

There is no route line, because no route was ever stored. The screen says so in
a sentence rather than leaving an empty map looking broken — this is the
product's central claim, and the one screen where a person is most likely to go
looking for it.

For a live trip, this route redirects to `/t/[code]`. For a finished but
not-yet-purged trip — the API's `kind: "finishing"` — there is no roster yet,
and the screen says "wrapping up" rather than rendering an empty list as though
nobody had been there.

### You

- **Display name**, editable, 1–24 after trim — the same rule the join form
  enforces, for the reason `PROJECT-OVERVIEW.md` §4 already gives: a longer name
  produces a join that fails validation for reasons the user can neither see nor
  fix. Saving says *"Applies to trips from now on"*, because it does not rewrite
  the name in trips you have already taken.
- **Preferences** — theme, notifications, haptics. Haptics keeps its existing
  Android-only note.
- **Your devices** — "This device" plus the others, each with when it was last
  seen and a **Sign out** action. The copy must be exact: signing a device out
  unlinks it from your account. It keeps working, and **it stays in any trip it
  has joined.** What stops is its future trips joining your history.
- **What we keep**, in plain words: a Google account id, a display name, and the
  trips you were in. No email. No location once a trip is over.

## 4. Data layer

`DataClient` and its conformance suite are **untouched**. History and profile
are not trip operations and putting them behind that interface would force a
localStorage implementation of a feature that cannot exist without an account.

New `lib/data/history.ts`, following `lib/data/account.ts` exactly — a
`createHistoryClient({ baseUrl, session, fetchFn })` factory plus an
`offlineHistory` that returns empty lists. Wired into `lib/data/index.ts`
alongside `account`, from the same two branches.

Profile writes (display name, devices, preferences) extend `AccountClient`
rather than starting a third client: they are the same resource, the same
`/v1/auth/me` shape, and the same "degrade to no account" rule.

`app/hooks/useHistory.ts` mirrors `useAccount`: loads on mount, never throws,
settles to empty when there is no account.

### Preferences, and which side wins

The rule, in order:

1. **localStorage stays the pre-paint source of truth.** `THEME_BOOTSTRAP` runs
   before first paint and cannot wait on a network call. Changing that would
   reintroduce the white flash it exists to prevent.
2. **On sign-in, the account's preferences are adopted** and written to
   localStorage. That is the entire point on a new device.
3. **After that, local changes push up.** A change writes localStorage first and
   `PUT /v1/me/preferences` second, and a failed write is not surfaced — the
   setting already applied, and a toast about a sync failure is noise.

Consequence worth stating: a preference changed on device A while device B is
open does not reach B until B reloads. Live-syncing settings across devices
would mean a second realtime channel for something nobody is watching.

## 5. Components

`Radar.tsx` is 2026 lines and four screens would take it past 3000. The obvious
move is to extract the shared primitives to `app/components/ui.tsx`.

**Not doing that, for a specific reason.** The destination-search work
(`docs/superpowers/specs/2026-09-08-destination-search-design.md`, designed the
same day) edits the Create screen inside `Radar.tsx`. Moving several hundred
lines out from under it buys tidiness now and a bad merge later.

Instead: `C`, `FONT` and `Mark` are already exported; add `export` to
`PrimaryButton`, `SecondaryButton`, `IconButton`, `Field`, `Eyebrow`, `Avatar`,
`AvatarWithStatus`, `Glyph`, `StatusPill`, `Row`, `Switch` and `Stat`. New
screens live in `app/components/Account.tsx` and import from `./Radar`. Nothing
moves, `Radar.tsx` does not grow, and the extraction stays available once
destination search has landed.

`app/components/TabBar.tsx` is new and standalone.

## 6. Copy

The old promise was *"No accounts."* It cannot stay. But what it was really
saying — **we hold almost nothing about you** — is still true and should be said
directly, because what an account holds is a Google `sub`, a display name and a
list of trips. No email. That sentence is worth more than the absence it
replaces.

| Where | Now | Becomes |
|---|---|---|
| `Radar.tsx:602` landing body | "Temporary location sharing for groups moving together. No account needed. No app to install. Expires in 8 hours." | "Temporary location sharing for groups moving together. Join in seconds — no app to install. Every trip expires in 8 hours." |
| `Radar.tsx` sign-in caption | "Optional — it just saves typing your name each trip." | "Optional. Keeps your trip history, your name and your settings across devices." |
| `app/layout.tsx:43` metadata | "Temporary location sharing for groups moving together. No accounts, no downloads." | "Temporary location sharing for groups moving together. Join in seconds, no install. Trips expire in 8 hours." |
| `public/manifest.json` | — | matched to the metadata line |
| `README.md:3` | "No accounts, no app install, expires in 8 hours." | "Join in seconds, no app install, trips expire in 8 hours." |
| `lib/clientId.ts:3` | "No accounts: this is how we recognise you" | corrected — accounts exist and sit on top of this |
| `Ended` screen | "Locations have stopped updating. Trip data is no longer shared." | adds, when signed in: "Saved to your trips." |
| `CLAUDE.md` project line | "no accounts" | corrected, and the dashboard added to the architecture notes |

Two more outside this repo:

| Where | Why |
|---|---|
| `admin-frontend/app/users/page.tsx:84` | "Radar has no accounts — a user is a device that has joined at least one trip." Flatly wrong since migration 003. Rewritten to describe real accounts and what they hold. |
| `admin-frontend/lib/users.ts:53` | Same claim in a comment. |
| `PROJECT-OVERVIEW.md` §1 | Lists "no trip history" as a deliberate non-goal. It is not one any more, and §4 needs the dashboard. |

`frontend/docs/PRD.md` predates accounts and already contradicts the code. It is
not in scope here beyond not making it worse.

## 7. Testing

Vitest runs in the **node** environment with `include: ["**/*.test.ts"]`, so
`.test.tsx` files are silently not collected. Component tests would need a
jsdom config change first, and that is not this work. What gets tested:

- `lib/data/__tests__/history.test.ts` — the client against a stubbed `fetch`,
  in the shape of the existing `account.test.ts`: happy path, an unreachable
  server degrading to empty, pagination following `nextCursor`.
- `lib/__tests__/contract.test.ts` — `arriveRadiusM` asserted against
  `contract.json`, matching the new backend case.
- Pure view-model helpers (grouping history by month, formatting a duration,
  choosing an outcome glyph) live in `lib/` and are unit-tested there rather
  than inside a component.

**Two guard tests need widening before any new screen file is written**, or they
will pass while guarding nothing:

`lib/__tests__/tokens.test.ts` hard-codes
`SCREENS = ["Radar.tsx", "PhoneFrame.tsx", "JoinFlow.tsx"]` for the 12px floor,
and scans **only `Radar.tsx`** for `<input>` font sizes. The display-name field
in `Account.tsx` is a text input, and at 14px it would zoom the viewport on
every iOS focus with nothing failing. Both change to a directory scan over
`app/components/*.tsx`, so a new screen file is guarded the moment it exists
rather than the moment somebody remembers to list it.

The bar stays four green: `npx tsc --noEmit`, `npm test`, `npm run lint`,
`npm run build`. And per `CLAUDE.md`: never build while dev is running, and
never two dev servers on this repo.

## 8. Order of work

The backend spec's §4–§8 land first; the dashboard has nothing to read
otherwise. Then, in this repo:

1. Widen the two guard tests in `tokens.test.ts`. First, so everything after is
   actually guarded.
2. `arriveRadiusM` into `contract.json` and its assertion.
3. `lib/data/history.ts` + profile additions to `account.ts`, with tests.
4. The route group, `TabBar`, and the pre-hydration flag — with Home unchanged
   inside it, so the shell is proven before any new screen exists.
5. Home's signed-in additions.
6. Trips, then Detail.
7. You.
8. Copy, across all three repos.

## 9. What this does not do

- No account deletion, by the user's decision. Per-trip removal and clear-all
  are in.
- No history for signed-out devices.
- No route replay, no distance, no pace. None of it was ever stored, and
  inferring it from a destination and two timestamps would be inventing data.
- No live sync of preferences between devices.
- No offline history. Without an API there are no accounts, so `offlineHistory`
  returns empty — the same answer `offlineAccount` gives, for the same reason.
