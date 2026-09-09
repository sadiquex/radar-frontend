# Home and Trip Screen Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Home into a live status board whose radar scope is real instrumentation, and give the trip screen the app's tab bar everywhere except the map and glance views.

**Architecture:** `GET /v1/me/trips/live` gains a counts-only `pulse` per trip, which requires porting the status engine to the backend and pinning both copies to shared goldens in `contract.json`. On the client, `lib/pulse.ts` turns pulses into an attention order and contact placements, `LiveScope` draws them, `HomeDashboard` becomes the status board, and `/t/[code]` moves into the `(tabs)` route group.

**Tech Stack:** Backend — TypeScript strict ESM, Hono 4, Vitest against real Postgres. Frontend — Next.js 14 App Router, TypeScript strict, Vitest in `node` environment (no DOM), inline styles referencing `C`/`FONT`.

**Spec:** `docs/superpowers/specs/2026-09-09-home-and-trip-redesign-design.md` — read it; this plan argues from it.

## Global Constraints

- **Baselines: backend 633 tests passing, `npx tsc --noEmit` clean. Frontend 795 passing (72 skipped), and its bar is four green — `npx tsc --noEmit`, `npm test`, `npm run lint`, `npm run build`.**
- **TDD throughout.** Failing test first, watch it fail for the right reason, minimal implementation, watch it pass.
- **`contract.json` MUST stay byte-identical in `backend/` and `frontend/`.** Both repos have a conformance suite asserting their own constants against it. Copy the file, never retype it.
- **Two repos.** `backend/` and `frontend/` are separate git repositories. Never stage across both in one commit. Tasks 1a/2/3/4 are backend, 1b/5–10 frontend, 11 both.
- **`npm run dev` in the backend is broken** — its scripts run `tsx` with nothing loading `.env`. Use `npx tsx --env-file=.env src/server.ts`.
- **A dev server for `frontend/` is usually running on :3000.** Never run `npm run build` while it is up — it overwrites `.next` and every dynamic route starts 404ing. Check with `lsof -ti:3000` first.
- **Frontend vitest is `environment: "node"` with `include: ["**/*.test.ts"]`.** No DOM, browser globals need `vi.stubGlobal` + `vi.resetModules()`, and a `.test.tsx` file is **silently not collected** — never write one. Logic worth testing gets extracted to `lib/`.
- **Frontend styling is inline `style={{...}}` referencing `C` and `FONT`**, not Tailwind utilities. `C.x` is the string `var(--c-x)`, so no colour arithmetic in JS — use the declared `--c-*-soft` tokens.
- **Text inputs must be ≥16px**; no `fontSize` below 12 in `app/components/*.tsx`. `lib/__tests__/tokens.test.ts` scans the component directory and picks up new files automatically.
- **Status must never be carried by colour alone.** The `STATUS` map in `Radar.tsx` pairs every colour with a glyph and a label; use it.
- **Attention order is `stopped > behind > ahead > with > arrived`**, ties broken by soonest expiry. One order, used by Home's cards, Home's contacts and the trip screen's member list.
- Commit with `git add` naming files explicitly. Never `git add -A`.

## File Structure

| File | Responsibility |
|---|---|
| `backend/contract.json` · `frontend/contract.json` | **modify** — three new thresholds and the status goldens. Byte-identical. |
| `backend/src/domain/status.ts` · `.test.ts` | **new** — the ported engine. Pure, no I/O. |
| `backend/src/domain/pulse.ts` · `.test.ts` | **new** — statuses → `TripPulse`. Pure. Separate from the engine because summarising is not classifying. |
| `backend/src/db/userTrips.ts` | **modify** — a second query returning members' positions for a set of live trips. |
| `backend/src/domain/historyWire.ts` | **modify** — `pulse` on the live wire entry. |
| `backend/src/http/me.routes.ts` | **modify** — compose query + engine + pulse. |
| `backend/tests/api.me.test.ts` | **modify** — endpoint cases. |
| `frontend/lib/data/history.ts` | **modify** — `TripPulse` type, parsed defensively. |
| `frontend/lib/pulse.ts` · `lib/__tests__/pulse.test.ts` | **new** — attention order and contact placement. The frontend's whole testable share of this redesign. |
| `frontend/lib/__tests__/contract.test.ts` | **modify** — thresholds and goldens. |
| `frontend/app/components/LiveScope.tsx` | **new** — the instrument. Today's `Scope` becomes its empty state. |
| `frontend/app/components/Account.tsx` | **modify** — `HomeDashboard` rewritten; `Scope` moves out to `LiveScope.tsx`. |
| `frontend/app/components/GroupScreen.tsx` | **new** — the trip screen body and the floating Map pill. |
| `frontend/app/components/TabBar.tsx` | **modify** — no-active-tab state; correct the doc comment. |
| `frontend/app/(tabs)/t/[code]/page.tsx` | **moved** from `app/t/[code]/page.tsx`; drops `PhoneFrame`; hides tabs on map/glance. |

`status.ts` classifies; `pulse.ts` summarises; the route composes. Each is testable alone.

**Refinement to the spec:** §12 folds the summary into `status.ts`. It gets its own
`backend/src/domain/pulse.ts` here, because classifying a member and summarising a trip take
different inputs and only the summary shapes the wire — and because the engine port has to be
verifiable against the goldens with no summary in the way. Same reasoning, one more file.

---

## Task 1a: The shared contract (backend half)

**Files:**
- Modify: `backend/contract.json`
- Test: `backend/tests/contract.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `contract.clusterRadiusM` (100), `contract.aheadBehindMarginM` (150), `contract.stoppedMs` (300000), `contract.statusGoldens` (3 fixtures).

**Context you need:** `contract.json` already carries `arriveRadiusM: 100` at the top level, asserted by `backend/src/domain/geo.test.ts:36` and behaviourally by the frontend. Add the three new thresholds as **siblings** of it — do not nest the four into an object, which would break both existing assertions.

- [ ] **Step 1: Add the thresholds and goldens to `backend/contract.json`**

Insert after the existing `"arriveRadiusM": 100,` line:

```json
  "clusterRadiusM": 100,
  "aheadBehindMarginM": 150,
  "stoppedMs": 300000,
  "statusGoldens": [
    {
      "name": "stopped beats with-group, and a straggler reads as behind",
      "now": 1000000,
      "destination": { "lat": 5.6037, "lng": -0.187 },
      "members": [
        { "id": "a", "lat": 5.6216864, "lng": -0.187, "lastMovedAt": 600000 },
        { "id": "b", "lat": 5.6216864, "lng": -0.187, "lastMovedAt": 1000000 },
        { "id": "c", "lat": 5.6486661, "lng": -0.187, "lastMovedAt": 1000000 }
      ],
      "expected": { "a": "stopped", "b": "with", "c": "behind" }
    },
    {
      "name": "arrival outranks stopped",
      "now": 1000000,
      "destination": { "lat": 5.6037, "lng": -0.187 },
      "members": [
        { "id": "a", "lat": 5.6041496, "lng": -0.187, "lastMovedAt": 600000 }
      ],
      "expected": { "a": "arrived" }
    },
    {
      "name": "with no destination, separation is the only verdict",
      "now": 1000000,
      "destination": null,
      "members": [
        { "id": "a", "lat": 5.6037, "lng": -0.187, "lastMovedAt": 1000000 },
        { "id": "b", "lat": 5.6037, "lng": -0.187, "lastMovedAt": 1000000 },
        { "id": "c", "lat": 5.6486661, "lng": -0.187, "lastMovedAt": 1000000 }
      ],
      "expected": { "a": "with", "b": "with", "c": "behind" }
    }
  ],
```

The goldens assert **statuses**, which are discrete, and never distances, which are floating point. `haversineGoldens` already covers the arithmetic.

- [ ] **Step 2: Assert the thresholds in `backend/tests/contract.test.ts`**

The engine does not exist yet, so this task pins only the numbers. Add inside `describe("contract.json conformance", ...)`:

```ts
  it("carries the status thresholds the ported engine needs", () => {
    // These exist twice from Task 2 onward — once in each repo. Three of the
    // four were frontend-only until this change, which is exactly how a second
    // implementation would have drifted on "stopped" without failing anything.
    expect(contract.clusterRadiusM).toBe(100);
    expect(contract.aheadBehindMarginM).toBe(150);
    expect(contract.stoppedMs).toBe(300000);
  });

  it("carries status goldens for both engines to answer", () => {
    // A golden set that is empty passes every assertion that loops over it.
    expect(contract.statusGoldens.length).toBeGreaterThanOrEqual(3);
    for (const g of contract.statusGoldens) {
      expect(Object.keys(g.expected).length).toBe(g.members.length);
    }
  });
```

- [ ] **Step 3: Run and watch it pass**

Run: `cd backend && npx vitest run tests/contract.test.ts && npx tsc --noEmit`
Expected: all passing, typecheck clean. (`resolveJsonModule` is already on — the file is imported today.)

- [ ] **Step 4: Commit**

```bash
cd backend
git add contract.json tests/contract.test.ts
git commit -m "feat: put the status thresholds in the shared contract

Three of the four thresholds the status engine depends on lived only in the
frontend. A second implementation could therefore disagree about who counts as
stopped and nothing would fail, which is the exact failure contract.json exists
to prevent — it already does this job for share codes and haversine.

The goldens assert statuses rather than distances. Statuses are discrete and
are the thing that would drift; the arithmetic is already covered by
haversineGoldens."
```

---

## Task 1b: The shared contract (frontend half)

**Files:**
- Modify: `frontend/contract.json`
- Test: `frontend/lib/__tests__/contract.test.ts`

**Interfaces:**
- Consumes: `backend/contract.json` from Task 1a — copied, not retyped.
- Produces: proof the existing `computeStatuses` answers the goldens.

- [ ] **Step 1: Copy the file, byte for byte**

```bash
cd /path/to/repo-root
cp backend/contract.json frontend/contract.json
diff backend/contract.json frontend/contract.json && echo identical
```

Expected: `identical`. Never hand-edit the second copy.

- [ ] **Step 2: Write the failing test**

Add to `frontend/lib/__tests__/contract.test.ts`, inside the existing describe:

```ts
  it.each(contract.statusGoldens)("answers the shared golden: $name", (golden) => {
    // This is the frontend's half of the two-engine agreement. The backend
    // runs the identical fixtures against its own port, so a rule that changes
    // on one side fails on the other rather than silently disagreeing on a
    // dashboard.
    const participants = golden.members.map((m) => ({
      id: m.id,
      tripId: "t1",
      displayName: m.id,
      latitude: m.lat,
      longitude: m.lng,
      status: null as StatusKey | null,
      lastMovedAt: m.lastMovedAt,
      lastSeenAt: golden.now,
    }));

    const got = computeStatuses(participants, golden.destination, golden.now);

    for (const [id, expected] of Object.entries(golden.expected)) {
      expect(got[id]?.status, `member ${id} in "${golden.name}"`).toBe(expected);
    }
  });
```

- [ ] **Step 3: Run it**

Run: `cd frontend && npx vitest run lib/__tests__/contract.test.ts`
Expected: **PASS** — `computeStatuses` is the engine the goldens were derived from, so this passes immediately. That is the point: it pins today's behaviour before a second copy exists.

**If any golden fails, stop and report it.** It means the fixtures in Task 1a are wrong, not the engine — recompute them rather than adjusting the expectation.

- [ ] **Step 4: Typecheck and commit**

Run: `cd frontend && npx tsc --noEmit && npm test`

```bash
cd frontend
git add contract.json lib/__tests__/contract.test.ts
git commit -m "test: answer the shared status goldens

The frontend's half of the agreement. computeStatuses is the engine these
fixtures were derived from, so this passes on arrival — which is the point: it
pins today's behaviour before a second copy of the rule exists to disagree
with it."
```

---

## Task 2: The ported status engine

**Files:**
- Create: `backend/src/domain/status.ts`
- Test: `backend/src/domain/status.test.ts`

**Interfaces:**
- Consumes: `haversineMeters`, `LatLng` from `./geo.ts`; `StatusKey` from `./alerts.ts`.
- Produces:
  ```ts
  export interface Located { id: string; lat: number; lng: number; lastMovedAt: number | null }
  export interface MemberStatus { status: StatusKey; kmLeft: number }
  export function computeStatuses(
    members: Located[], destination: LatLng | null, now: number
  ): Record<string, MemberStatus>;
  ```

**Context you need:** `StatusKey` already exists in this repo at `src/domain/alerts.ts:5` — import it, do not redeclare it. `haversineMeters` is at `src/domain/geo.ts`. The frontend original is `frontend/lib/status.ts`; the port takes the same precedence and the same no-destination branch, but takes a flat `Located[]` rather than the frontend's `Participant[]` because the backend's row shape is different and the engine should not know about either.

- [ ] **Step 1: Write the failing test**

Create `backend/src/domain/status.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import contract from "../../contract.json" with { type: "json" };
import { computeStatuses, type Located } from "./status.ts";

const ACCRA = { lat: 5.6037, lng: -0.187 };
const north = (metres: number) => ({ lat: 5.6037 + metres / 111_195, lng: -0.187 });

describe("computeStatuses", () => {
  it.each(contract.statusGoldens)("answers the shared golden: $name", (golden) => {
    // The other half of the two-engine agreement. The frontend runs these
    // identical fixtures against lib/status.ts.
    const members: Located[] = golden.members.map((m) => ({
      id: m.id, lat: m.lat, lng: m.lng, lastMovedAt: m.lastMovedAt,
    }));

    const got = computeStatuses(members, golden.destination, golden.now);

    for (const [id, expected] of Object.entries(golden.expected)) {
      expect(got[id]?.status, `member ${id} in "${golden.name}"`).toBe(expected);
    }
  });

  it("omits members with no position rather than guessing at one", () => {
    const got = computeStatuses([], ACCRA, 0);
    expect(got).toEqual({});
  });

  it("reports the distance left, in km", () => {
    const got = computeStatuses(
      [{ id: "a", ...north(2000), lastMovedAt: 0 }],
      ACCRA,
      0
    );
    expect(got.a!.kmLeft).toBeCloseTo(2, 2);
  });

  it("reports no distance when there is no destination", () => {
    const got = computeStatuses(
      [{ id: "a", ...north(2000), lastMovedAt: 0 }],
      null,
      0
    );
    expect(got.a!.kmLeft).toBe(0);
  });

  it("uses the shared arrival radius", () => {
    const inside = computeStatuses(
      [{ id: "a", ...north(contract.arriveRadiusM - 1), lastMovedAt: 0 }], ACCRA, 0
    );
    expect(inside.a!.status).toBe("arrived");
    const outside = computeStatuses(
      [{ id: "a", ...north(contract.arriveRadiusM + 1), lastMovedAt: 0 }], ACCRA, 0
    );
    expect(outside.a!.status).not.toBe("arrived");
  });

  it("uses the shared stopped threshold", () => {
    const at = (sinceMoved: number) =>
      computeStatuses(
        [{ id: "a", ...north(2000), lastMovedAt: 1_000_000 - sinceMoved }],
        ACCRA,
        1_000_000
      );
    expect(at(contract.stoppedMs - 1).a!.status).not.toBe("stopped");
    expect(at(contract.stoppedMs).a!.status).toBe("stopped");
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd backend && npx vitest run src/domain/status.test.ts`
Expected: FAIL — cannot resolve `./status.ts`.

- [ ] **Step 3: Write the implementation**

Create `backend/src/domain/status.ts`:

```ts
import { haversineMeters, type LatLng } from "./geo.ts";
import type { StatusKey } from "./alerts.ts";
import contract from "../../contract.json" with { type: "json" };

/**
 * Where each member stands, relative to the group and the destination.
 *
 * A port of `frontend/lib/status.ts`, and the duplication is deliberate but
 * not comfortable: the dashboard needs a verdict for trips the caller is not
 * currently inside, and the only engine that could give one lived in the
 * browser. `contract.json` carries both the thresholds and a set of goldens
 * that both copies answer, which is what stops the two drifting silently — see
 * §5 of the design.
 *
 * The input is a flat `Located`, not a database row and not the frontend's
 * `Participant`. The engine has no business knowing either shape.
 */

const ARRIVE_RADIUS_M = contract.arriveRadiusM;
const CLUSTER_RADIUS_M = contract.clusterRadiusM;
const AHEAD_BEHIND_MARGIN_M = contract.aheadBehindMarginM;
const STOPPED_MS = contract.stoppedMs;

export interface Located {
  id: string;
  lat: number;
  lng: number;
  lastMovedAt: number | null;
}

export interface MemberStatus {
  status: StatusKey;
  /** Zero when the trip has no destination — there is nothing to be left of. */
  kmLeft: number;
}

interface Fixed extends Located {
  pos: LatLng;
}

/**
 * "With group" is counted as neighbours rather than distance to a centroid.
 * A mean centre is dragged around by a single straggler, which would report
 * the whole group as separated because one person stopped for fuel.
 */
function nearMajority(m: Fixed, all: Fixed[]): boolean {
  const near = all.filter((o) => haversineMeters(m.pos, o.pos) <= CLUSTER_RADIUS_M).length;
  return near > all.length / 2;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const isStopped = (m: Fixed, now: number): boolean =>
  m.lastMovedAt !== null && now - m.lastMovedAt >= STOPPED_MS;

/** Precedence: arrived > stopped > with group > ahead / behind. */
export function computeStatuses(
  members: Located[],
  destination: LatLng | null,
  now: number
): Record<string, MemberStatus> {
  const located: Fixed[] = members.map((m) => ({ ...m, pos: { lat: m.lat, lng: m.lng } }));
  if (located.length === 0) return {};

  const result: Record<string, MemberStatus> = {};

  if (destination !== null) {
    const distances = new Map(located.map((m) => [m.id, haversineMeters(m.pos, destination)]));
    const med = median([...distances.values()]);

    for (const m of located) {
      const distToDest = distances.get(m.id)!;
      let status: StatusKey;

      if (distToDest <= ARRIVE_RADIUS_M) status = "arrived";
      else if (isStopped(m, now)) status = "stopped";
      else if (nearMajority(m, located)) status = "with";
      else if (distToDest < med - AHEAD_BEHIND_MARGIN_M) status = "ahead";
      else if (distToDest > med + AHEAD_BEHIND_MARGIN_M) status = "behind";
      else status = "with";

      result[m.id] = { status, kmLeft: distToDest / 1000 };
    }
    return result;
  }

  // No destination: "ahead" and "behind" have no reference direction, so the
  // only question left is whether you are travelling with the pack.
  for (const m of located) {
    let status: StatusKey;
    if (isStopped(m, now)) status = "stopped";
    else if (nearMajority(m, located)) status = "with";
    else status = "behind";
    result[m.id] = { status, kmLeft: 0 };
  }
  return result;
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cd backend && npx vitest run src/domain/status.test.ts && npx tsc --noEmit`
Expected: 7 passing (3 goldens + 4 others), typecheck clean.

- [ ] **Step 5: Commit**

```bash
cd backend
git add src/domain/status.ts src/domain/status.test.ts
git commit -m "feat: port the status engine, pinned to shared goldens

The dashboard needs a verdict for trips the caller is not inside, and the only
engine that could give one lived in the browser. So there are two now.

The duplication is contained rather than removed: both copies read their
thresholds from contract.json and both answer the same goldens, so a rule that
changes on one side fails on the other instead of quietly disagreeing about who
has stopped. The honest long-term answer is one shared engine; that is a bigger
change than this.

Takes a flat Located rather than a database row or the frontend's Participant.
The engine has no business knowing either shape."
```

---

## Task 3: Summarising a trip into a pulse

**Files:**
- Create: `backend/src/domain/pulse.ts`
- Test: `backend/src/domain/pulse.test.ts`

**Interfaces:**
- Consumes: `MemberStatus` from `./status.ts`; `StatusKey` from `./alerts.ts`.
- Produces:
  ```ts
  export interface TripPulse {
    stopped: number; moving: number; arrived: number;
    worst: StatusKey | null; kmLeftMax: number | null;
  }
  export const ATTENTION_ORDER: readonly StatusKey[];
  export function summarize(
    statuses: MemberStatus[], hasDestination: boolean
  ): TripPulse | null;
  ```

**Why this is its own module:** classifying a member and summarising a trip are different jobs with different inputs, and the summary is the only part the wire shape depends on. Keeping them apart means the engine port can be verified against goldens without a summary in the way.

- [ ] **Step 1: Write the failing test**

Create `backend/src/domain/pulse.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { summarize, ATTENTION_ORDER } from "./pulse.ts";
import type { MemberStatus } from "./status.ts";

const m = (status: MemberStatus["status"], kmLeft = 1): MemberStatus => ({ status, kmLeft });

describe("summarize", () => {
  it("answers null when nobody is located", () => {
    // A real and common state in the first minute of a trip. The dashboard
    // renders it as "nobody located yet", never as three zeroes, so the
    // absence has to survive the wire as an absence.
    expect(summarize([], true)).toBeNull();
  });

  it("counts each bucket, folding ahead/behind/with into moving", () => {
    const got = summarize(
      [m("stopped"), m("ahead"), m("behind"), m("with"), m("arrived")],
      true
    );
    expect(got).toMatchObject({ stopped: 1, moving: 3, arrived: 1 });
  });

  it("reports the status most deserving of attention", () => {
    expect(summarize([m("arrived"), m("with"), m("stopped")], true)!.worst).toBe("stopped");
    expect(summarize([m("arrived"), m("with"), m("behind")], true)!.worst).toBe("behind");
    expect(summarize([m("arrived"), m("with")], true)!.worst).toBe("with");
    expect(summarize([m("arrived")], true)!.worst).toBe("arrived");
  });

  it("ranks stopped first, because it is the only status that may need help", () => {
    expect(ATTENTION_ORDER).toEqual(["stopped", "behind", "ahead", "with", "arrived"]);
  });

  it("reports the furthest member still to go", () => {
    expect(summarize([m("with", 2.5), m("with", 9.1), m("with", 0.4)], true)!.kmLeftMax)
      .toBeCloseTo(9.1, 3);
  });

  it("reports no distance when the trip has no destination", () => {
    // kmLeft is zero for every member in that case, and reporting 0 km would
    // read as "everybody has arrived".
    expect(summarize([m("with", 0), m("behind", 0)], false)!.kmLeftMax).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd backend && npx vitest run src/domain/pulse.test.ts`
Expected: FAIL — cannot resolve `./pulse.ts`.

- [ ] **Step 3: Write the implementation**

Create `backend/src/domain/pulse.ts`:

```ts
import type { StatusKey } from "./alerts.ts";
import type { MemberStatus } from "./status.ts";

/**
 * How a trip is going, for a dashboard that is not inside it.
 *
 * Counts and one distance — never coordinates. The caller is already a member
 * of every trip this covers, so a pulse discloses nothing new about them;
 * returning positions would widen /v1/me from "your trips" to "where everyone
 * in them is right now", for a screen with no use for it. See §4 of the design.
 */

/**
 * Stopped is first because it is the only status that means somebody may need
 * help. Arrived is last because it needs nothing.
 */
export const ATTENTION_ORDER: readonly StatusKey[] = [
  "stopped", "behind", "ahead", "with", "arrived",
];

export interface TripPulse {
  stopped: number;
  /** ahead + behind + with: under way, whatever their relation to the group. */
  moving: number;
  arrived: number;
  worst: StatusKey | null;
  /** Null when the trip has no destination. */
  kmLeftMax: number | null;
}

/** Null when nobody is located — an absence the client must not read as zero. */
export function summarize(
  statuses: MemberStatus[],
  hasDestination: boolean
): TripPulse | null {
  if (statuses.length === 0) return null;

  let stopped = 0;
  let arrived = 0;
  let moving = 0;
  for (const s of statuses) {
    if (s.status === "stopped") stopped += 1;
    else if (s.status === "arrived") arrived += 1;
    else moving += 1;
  }

  const worst =
    ATTENTION_ORDER.find((k) => statuses.some((s) => s.status === k)) ?? null;

  // Without a destination every kmLeft is zero, and reporting 0 km would read
  // as "everybody has arrived".
  const kmLeftMax = hasDestination
    ? Math.max(...statuses.map((s) => s.kmLeft))
    : null;

  return { stopped, moving, arrived, worst, kmLeftMax };
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cd backend && npx vitest run src/domain/pulse.test.ts && npx tsc --noEmit`
Expected: 6 passing, typecheck clean.

- [ ] **Step 5: Commit**

```bash
cd backend
git add src/domain/pulse.ts src/domain/pulse.test.ts
git commit -m "feat: summarise a trip's members into a pulse

Counts and one distance, never coordinates. The caller is already a member of
every trip this covers so the pulse discloses nothing new, but returning
positions would widen /v1/me from 'your trips' to 'where everyone in them is',
for a screen with no use for it.

Null when nobody is located, rather than three zeroes. That is a real state in
the first minute of a trip and the dashboard says 'nobody located yet' — so the
absence has to survive the wire as an absence."
```

---

## Task 4: The pulse on the wire

**Files:**
- Modify: `backend/src/db/userTrips.ts`, `backend/src/domain/historyWire.ts`, `backend/src/http/me.routes.ts:55-77`
- Test: `backend/tests/api.me.test.ts`

**Interfaces:**
- Consumes: `computeStatuses` (Task 2), `summarize` / `TripPulse` (Task 3).
- Produces:
  ```ts
  // db/userTrips.ts
  export interface LiveMemberRow {
    trip_id: string; device_id: string;
    latitude: number | null; longitude: number | null; last_moved_at: Date | null;
  }
  export function listLiveMembers(db: Queryable, tripIds: string[]): Promise<LiveMemberRow[]>;
  // LiveUserTripRow gains: destination_lat: number | null; destination_lng: number | null;
  // historyWire.ts
  toWireLiveEntry(trip, entry, memberCount, pulse: TripPulse | null): WireLiveEntry
  ```

**Context you need:** `listLiveUserTrips` (`src/db/userTrips.ts:237`) currently selects no destination coordinates, and `me.routes.ts:55` passes `destination_lat: null, destination_lng: null` into the mapper. Both must change — the engine needs a real destination. The participants table (`migrations/001_init.sql:37`) has `latitude`, `longitude`, `last_moved_at`, keyed `(trip_id, device_id)`.

- [ ] **Step 1: Write the failing test**

`backend/tests/api.me.test.ts` already has everything needed — use these, do not add a second set:

| Helper | What it does |
|---|---|
| `signedIn(app, idToken)` | an account + device, returns `{ token, ... }` |
| `ride(app, token, { name?, destination?, as? })` | creates a trip and joins it; `destination: true` (the default) uses `KUMASI` |
| `place(tripId, { lat, lng })` | sets every participant's position in that trip |
| `call(app, method, path, { token, body? })` | returns `{ status, body }` |
| `KUMASI` = `{ lat: 6.6885, lng: -1.6244 }` | the destination `ride` uses |

`place` does **not** touch `last_moved_at`, so add this one helper beside it — the stopped rule is a clock rule and no existing helper can express it:

```ts
const stoppedSince = (tripId: string, ms: number) =>
  testPool().query(
    "update participants set last_moved_at = now() - ($1 || ' milliseconds')::interval where trip_id = $2",
    [String(ms), tripId]
  );
```

Then add to the `describe("GET /v1/me/trips/live", ...)` block at `tests/api.me.test.ts:271`:

```ts
    it("answers a null pulse when nobody has reported a position", async () => {
      // A real state in the first minute of a trip: joined, no fix yet.
      const app = makeApp();
      const me = await signedIn(app, "token-ibrahim");
      await ride(app, me.token);

      const res = await call(app, "GET", "/v1/me/trips/live", { token: me.token });
      expect(res.status).toBe(200);
      expect(res.body.trips[0].pulse).toBeNull();
    });

    it("reports a stopped member as the worst status", async () => {
      const app = makeApp();
      const me = await signedIn(app, "token-ibrahim");
      const trip = await ride(app, me.token);
      // 2km short of KUMASI, and not moved for well over the threshold.
      await place(trip.id, { lat: KUMASI.lat + 2000 / 111_195, lng: KUMASI.lng });
      await stoppedSince(trip.id, 20 * 60_000);

      const res = await call(app, "GET", "/v1/me/trips/live", { token: me.token });
      const pulse = res.body.trips[0].pulse;
      expect(pulse.worst).toBe("stopped");
      expect(pulse.stopped).toBe(1);
      expect(pulse.kmLeftMax).toBeCloseTo(2, 1);
    });

    it("reports no distance for a trip with no destination", async () => {
      const app = makeApp();
      const me = await signedIn(app, "token-ibrahim");
      const trip = await ride(app, me.token, { destination: false });
      await place(trip.id, NEAR_KUMASI);

      const res = await call(app, "GET", "/v1/me/trips/live", { token: me.token });
      expect(res.body.trips[0].pulse.kmLeftMax).toBeNull();
    });

    it("never puts a coordinate on the wire", async () => {
      // Rule 1: a trip's positions are visible only to that trip's members,
      // through that trip. A dashboard is not that, and has no use for them.
      const app = makeApp();
      const me = await signedIn(app, "token-ibrahim");
      const trip = await ride(app, me.token);
      await place(trip.id, NEAR_KUMASI);

      const res = await call(app, "GET", "/v1/me/trips/live", { token: me.token });
      const wire = JSON.stringify(res.body);
      expect(wire).not.toContain("latitude");
      expect(wire).not.toContain("longitude");
      expect(wire).not.toContain(String(NEAR_KUMASI.lat));
    });
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd backend && npx vitest run tests/api.me.test.ts`
Expected: FAIL — `pulse` is undefined on the wire entry.

- [ ] **Step 3: Select the destination in the live query**

In `backend/src/db/userTrips.ts`, add to the `LiveUserTripRow` interface:

```ts
  destination_lat: number | null;
  destination_lng: number | null;
```

and to the select list in `listLiveUserTrips`, after `t.destination_name,`:

```sql
            t.destination_lat, t.destination_lng,
```

- [ ] **Step 4: Add the members query**

Append to `backend/src/db/userTrips.ts`:

```ts
/**
 * Every member of the given live trips, with their last known position.
 *
 * One query for the whole dashboard rather than one per trip: a person is in a
 * handful of live trips at once and this is polled every few seconds, so the
 * round trips are the cost worth avoiding.
 *
 * Returns members with no position too. The caller needs to tell "nobody has
 * reported yet" from "there is nobody here", and both look like an empty list
 * if they are filtered out in SQL.
 */
export interface LiveMemberRow {
  trip_id: string;
  device_id: string;
  latitude: number | null;
  longitude: number | null;
  last_moved_at: Date | null;
}

export async function listLiveMembers(
  db: Queryable,
  tripIds: string[]
): Promise<LiveMemberRow[]> {
  if (tripIds.length === 0) return [];
  const { rows } = await db.query<LiveMemberRow>(
    `select trip_id, device_id, latitude, longitude, last_moved_at
       from participants
      where trip_id = any($1::uuid[])`,
    [tripIds]
  );
  return rows;
}
```

- [ ] **Step 5: Put the pulse on the wire entry**

In `backend/src/domain/historyWire.ts`, add `pulse` to the `WireLiveEntry` type (beside `wasCreator`), and change the mapper:

```ts
export function toWireLiveEntry(
  trip: TripRow,
  entry: UserTripRow,
  memberCount: number,
  pulse: TripPulse | null
): WireLiveEntry {
  return {
    kind: "live",
    tripId: trip.id,
    shareCode: trip.share_code,
    name: trip.name,
    destinationName: trip.destination_name,
    memberCount,
    startedAt: ms(trip.created_at),
    expiresAt: ms(trip.expires_at),
    wasCreator: entry.was_creator,
    pulse,
  };
}
```

Import `TripPulse` from `./pulse.ts`.

- [ ] **Step 6: Compose it in the route**

Replace the handler body at `backend/src/http/me.routes.ts:55`:

```ts
  r.get("/trips/live", async (c) => {
    const rows = await listLiveUserTrips(pool, c.get("userId"));
    const members = await listLiveMembers(pool, rows.map((r) => r.trip_id));
    const now = Date.now();

    // Grouped once rather than filtered per trip: this runs on every poll.
    const byTrip = new Map<string, LiveMemberRow[]>();
    for (const m of members) {
      const list = byTrip.get(m.trip_id);
      if (list === undefined) byTrip.set(m.trip_id, [m]);
      else list.push(m);
    }

    return ok(c, {
      trips: rows.map((row) => {
        const destination =
          row.destination_lat === null || row.destination_lng === null
            ? null
            : { lat: row.destination_lat, lng: row.destination_lng };

        const located = (byTrip.get(row.trip_id) ?? [])
          .filter((m) => m.latitude !== null && m.longitude !== null)
          .map((m) => ({
            id: m.device_id,
            lat: m.latitude as number,
            lng: m.longitude as number,
            lastMovedAt: m.last_moved_at === null ? null : m.last_moved_at.getTime(),
          }));

        const statuses = Object.values(computeStatuses(located, destination, now));

        return toWireLiveEntry(
          {
            id: row.trip_id,
            share_code: row.share_code,
            name: row.trip_name,
            destination_name: row.destination_name,
            destination_lat: row.destination_lat,
            destination_lng: row.destination_lng,
            creator_id: "",
            ended_at: null,
            expires_at: row.expires_at,
            purged_at: null,
            created_at: row.trip_created_at,
          },
          row,
          row.member_count,
          summarize(statuses, destination !== null)
        );
      }),
    });
  });
```

Add the imports: `listLiveMembers`, `type LiveMemberRow` from `../db/userTrips.ts`; `computeStatuses` from `../domain/status.ts`; `summarize` from `../domain/pulse.ts`.

- [ ] **Step 7: Run the tests and watch them pass**

Run: `cd backend && npx vitest run tests/api.me.test.ts && npm test && npx tsc --noEmit`
Expected: the four new cases passing, the whole backend suite green, typecheck clean. **Read the count rather than checking it against a number here** — earlier tasks added tests too.

- [ ] **Step 8: Commit**

```bash
cd backend
git add src/db/userTrips.ts src/domain/historyWire.ts src/http/me.routes.ts tests/api.me.test.ts
git commit -m "feat: tell the dashboard how each live trip is going

/v1/me/trips/live answered a member count and an expiry, so Home could not
rank three trips by which one needed attention — it could not tell the trip
where two riders had stopped from the two running fine.

It now carries a pulse: counts, the worst status, and the furthest member's
distance. Never coordinates. Rule 1 stands — a trip's positions are visible
only to that trip's members, through that trip — and a dashboard has no use
for them.

One members query for the whole page rather than one per trip, because this is
polled every few seconds. Members with no position are returned rather than
filtered in SQL: the route needs to tell 'nobody has reported yet' from 'there
is nobody here', and both look like an empty list otherwise."
```

---

## Task 5: The pulse on the client

**Files:**
- Modify: `frontend/lib/data/history.ts:24-34`
- Test: `frontend/lib/data/__tests__/history.test.ts` (create if absent)

**Interfaces:**
- Consumes: the endpoint from Task 4.
- Produces:
  ```ts
  export interface TripPulse {
    stopped: number; moving: number; arrived: number;
    worst: StatusKey | null; kmLeftMax: number | null;
  }
  // LiveTripEntry gains: pulse: TripPulse | null;
  ```

- [ ] **Step 1: Write the failing test**

Create or extend `frontend/lib/data/__tests__/history.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createHistoryClient } from "../history";

const session = { get: async () => ({ deviceId: "d1", token: "tok-1" }) } as never;

const reply = (body: unknown): Response =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

const entry = (over: Record<string, unknown> = {}) => ({
  kind: "live", tripId: "t1", shareCode: "ABC123", name: null, destinationName: null,
  memberCount: 2, startedAt: 1, expiresAt: 2, wasCreator: true, ...over,
});

const clientWith = (body: unknown) =>
  createHistoryClient({
    baseUrl: "http://api.test", session,
    fetchFn: (async () => reply(body)) as unknown as typeof fetch,
  });

describe("history.live", () => {
  it("keeps a pulse the server sent", async () => {
    const pulse = { stopped: 1, moving: 2, arrived: 0, worst: "stopped", kmLeftMax: 9.1 };
    const [got] = await clientWith({ trips: [entry({ pulse })] }).live();
    expect(got!.pulse).toEqual(pulse);
  });

  it("reads a missing pulse as null, not as zeroes", async () => {
    // An API older than this client sends no pulse at all. Defaulting to
    // {0,0,0} would render as "everyone accounted for, nobody moving", which
    // is a confident lie; null renders as "nobody located yet".
    const [got] = await clientWith({ trips: [entry()] }).live();
    expect(got!.pulse).toBeNull();
  });

  it("reads an explicit null pulse as null", async () => {
    const [got] = await clientWith({ trips: [entry({ pulse: null })] }).live();
    expect(got!.pulse).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd frontend && npx vitest run lib/data/__tests__/history.test.ts`
Expected: FAIL — `pulse` is not a property of the parsed entry.

- [ ] **Step 3: Write the implementation**

In `frontend/lib/data/history.ts`, add above `LiveTripEntry`:

```ts
/**
 * How a live trip is going, from the API.
 *
 * Null when no member has reported a position yet — a real state in the first
 * minute of a trip, and one the UI renders as "nobody located yet". Treat a
 * missing field as null too: an API older than this client sends none, and
 * defaulting to zeroes would render as "everyone accounted for, nobody
 * moving", which is a confident lie.
 */
export interface TripPulse {
  stopped: number;
  moving: number;
  arrived: number;
  worst: StatusKey | null;
  kmLeftMax: number | null;
}
```

Add `pulse: TripPulse | null;` to `LiveTripEntry`, import `StatusKey` from `../types`, and normalise in the `live()` parser:

```ts
        const body = (await res.json()) as { trips?: (LiveTripEntry & { pulse?: unknown })[] };
        return (body.trips ?? []).map((t) => ({ ...t, pulse: asPulse(t.pulse) }));
```

with, at module scope:

```ts
function asPulse(raw: unknown): TripPulse | null {
  if (raw === null || typeof raw !== "object") return null;
  const p = raw as Partial<TripPulse>;
  if (typeof p.stopped !== "number" || typeof p.moving !== "number") return null;
  return {
    stopped: p.stopped,
    moving: p.moving,
    arrived: typeof p.arrived === "number" ? p.arrived : 0,
    worst: (p.worst ?? null) as StatusKey | null,
    kmLeftMax: typeof p.kmLeftMax === "number" ? p.kmLeftMax : null,
  };
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cd frontend && npx vitest run lib/data/__tests__/history.test.ts && npx tsc --noEmit`
Expected: 3 passing, typecheck clean.

**`lib/__tests__/history.test.ts` already exists and tests the pure history helpers — do not confuse the two files.** If adding `pulse` to `LiveTripEntry` breaks its fixtures, add `pulse: null` to them.

- [ ] **Step 5: Commit**

```bash
cd frontend
git add lib/data/history.ts lib/data/__tests__/history.test.ts lib/__tests__/history.test.ts
git commit -m "feat: read a live trip's pulse

Parsed defensively rather than trusted. An API older than this client sends no
pulse at all, and defaulting to zeroes would render as 'everyone accounted for,
nobody moving' — a confident lie about people whose position nobody knows.
Missing and null both mean null, which the UI says out loud."
```

---

## Task 6: Attention order and contact placement

**Files:**
- Create: `frontend/lib/pulse.ts`
- Test: `frontend/lib/__tests__/pulse.test.ts`

**Interfaces:**
- Consumes: `LiveTripEntry`, `TripPulse` (Task 5); `StatusKey` from `../types`.
- Produces:
  ```ts
  export const ATTENTION_ORDER: readonly StatusKey[];
  export function rankTrips(trips: LiveTripEntry[]): LiveTripEntry[];
  export interface Contact {
    tripId: string; radius: number; angle: number;
    status: StatusKey | null; memberCount: number; located: boolean;
  }
  export function contactsFor(trips: LiveTripEntry[]): Contact[];
  export function pulseWords(pulse: TripPulse | null): string;
  ```

**Why this is a separate module:** this vitest is `environment: "node"` and silently does not collect `.test.tsx`, so logic inside a component is logic with no test. Everything in this redesign worth asserting lives here; the components only draw it.

- [ ] **Step 1: Write the failing test**

Create `frontend/lib/__tests__/pulse.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ATTENTION_ORDER, rankTrips, contactsFor, pulseWords } from "../pulse";
import type { LiveTripEntry, TripPulse } from "../data/history";
import type { StatusKey } from "../types";

const pulse = (over: Partial<TripPulse> = {}): TripPulse => ({
  stopped: 0, moving: 1, arrived: 0, worst: "with", kmLeftMax: 5, ...over,
});

const trip = (id: string, over: Partial<LiveTripEntry> = {}): LiveTripEntry => ({
  kind: "live", tripId: id, shareCode: id.toUpperCase(), name: id,
  destinationName: "Kotoka", memberCount: 2, startedAt: 0, expiresAt: 1000,
  wasCreator: true, pulse: pulse(), ...over,
});

describe("ATTENTION_ORDER", () => {
  it("puts stopped first and arrived last", () => {
    // Stopped is the only status that means somebody may need help; arrived
    // needs nothing.
    expect(ATTENTION_ORDER).toEqual(["stopped", "behind", "ahead", "with", "arrived"]);
  });
});

describe("rankTrips", () => {
  it("puts the trip that needs attention first", () => {
    const got = rankTrips([
      trip("calm", { pulse: pulse({ worst: "with" }) }),
      trip("done", { pulse: pulse({ worst: "arrived" }) }),
      trip("hurt", { pulse: pulse({ worst: "stopped" }) }),
    ]);
    expect(got.map((t) => t.tripId)).toEqual(["hurt", "calm", "done"]);
  });

  it("breaks ties by soonest expiry", () => {
    const got = rankTrips([
      trip("later", { expiresAt: 9000 }),
      trip("sooner", { expiresAt: 100 }),
    ]);
    expect(got.map((t) => t.tripId)).toEqual(["sooner", "later"]);
  });

  it("sorts an unlocated trip below every located one", () => {
    // Nothing is known about it, so it cannot out-rank a trip that has told us
    // somebody stopped.
    const got = rankTrips([
      trip("unknown", { pulse: null }),
      trip("calm", { pulse: pulse({ worst: "with" }) }),
    ]);
    expect(got.map((t) => t.tripId)).toEqual(["calm", "unknown"]);
  });

  it("does not mutate its input", () => {
    const input = [trip("a", { expiresAt: 9 }), trip("b", { expiresAt: 1 })];
    rankTrips(input);
    expect(input.map((t) => t.tripId)).toEqual(["a", "b"]);
  });
});

describe("contactsFor", () => {
  it("puts the furthest trip on the outer ring and an arrived one at the centre", () => {
    const got = contactsFor([
      trip("far", { pulse: pulse({ kmLeftMax: 10 }) }),
      trip("here", { pulse: pulse({ kmLeftMax: 0 }) }),
    ]);
    expect(got.find((c) => c.tripId === "far")!.radius).toBe(1);
    expect(got.find((c) => c.tripId === "here")!.radius).toBe(0);
  });

  it("gives a trip the same angle every time, so a poll does not move it", () => {
    // useLiveTrips refetches every four seconds. A contact that jumps on each
    // refresh reads as movement that did not happen.
    const a = contactsFor([trip("stable")])[0]!.angle;
    const b = contactsFor([trip("stable"), trip("other")])[0]!.angle;
    expect(a).toBe(b);
  });

  it("gives different trips different angles", () => {
    const got = contactsFor([trip("one"), trip("two"), trip("three")]);
    expect(new Set(got.map((c) => c.angle)).size).toBe(3);
  });

  it("marks an unlocated trip as such and parks it on the outer ring", () => {
    const [got] = contactsFor([trip("unknown", { pulse: null })]);
    expect(got).toMatchObject({ located: false, radius: 1, status: null });
  });

  it("parks a trip with no destination on the outer ring", () => {
    const [got] = contactsFor([trip("wander", { pulse: pulse({ kmLeftMax: null }) })]);
    expect(got!.radius).toBe(1);
    expect(got!.located).toBe(true);
  });

  it("does not divide by zero when every trip has arrived", () => {
    const got = contactsFor([
      trip("a", { pulse: pulse({ kmLeftMax: 0 }) }),
      trip("b", { pulse: pulse({ kmLeftMax: 0 }) }),
    ]);
    for (const c of got) expect(Number.isFinite(c.radius)).toBe(true);
  });
});

describe("pulseWords", () => {
  it("says what happened, so colour is never the only channel", () => {
    expect(pulseWords(null)).toBe("Nobody located yet");
    expect(pulseWords(pulse({ stopped: 2, worst: "stopped" }))).toBe("2 stopped");
    expect(pulseWords(pulse({ stopped: 1, worst: "stopped" }))).toBe("1 stopped");
    expect(pulseWords(pulse({ moving: 3, arrived: 0, worst: "with" })))
      .toBe("Everyone with the group");
    expect(pulseWords(pulse({ moving: 0, arrived: 3, worst: "arrived" })))
      .toBe("Everyone arrived");
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd frontend && npx vitest run lib/__tests__/pulse.test.ts`
Expected: FAIL — cannot resolve `../pulse`.

- [ ] **Step 3: Write the implementation**

Create `frontend/lib/pulse.ts`:

```ts
import type { LiveTripEntry, TripPulse } from "./data/history";
import type { StatusKey } from "./types";

/**
 * Turning a list of live trips into something a screen can rank and draw.
 *
 * Extracted rather than left in the component because this repo's vitest runs
 * in node with no DOM and silently does not collect `.test.tsx` — logic inside
 * a component is logic with no test.
 */

/**
 * Stopped is first because it is the only status that means somebody may need
 * help. Arrived is last because it needs nothing.
 */
export const ATTENTION_ORDER: readonly StatusKey[] = [
  "stopped", "behind", "ahead", "with", "arrived",
];

/** Unlocated sorts below every known status: nothing is known to rank on. */
const attentionRank = (worst: StatusKey | null): number => {
  const i = worst === null ? -1 : ATTENTION_ORDER.indexOf(worst);
  return i === -1 ? ATTENTION_ORDER.length : i;
};

/** Worst status first, then soonest to expire. Returns a new array. */
export function rankTrips(trips: LiveTripEntry[]): LiveTripEntry[] {
  return [...trips].sort((a, b) => {
    const byAttention =
      attentionRank(a.pulse?.worst ?? null) - attentionRank(b.pulse?.worst ?? null);
    if (byAttention !== 0) return byAttention;
    return a.expiresAt - b.expiresAt;
  });
}

export interface Contact {
  tripId: string;
  /** 0 at the centre (arrived), 1 on the outer ring (furthest out). */
  radius: number;
  /** Radians. Encodes nothing; it only has to be stable. */
  angle: number;
  status: StatusKey | null;
  memberCount: number;
  /** False when nobody has reported a position — drawn as an outlined slot. */
  located: boolean;
}

/**
 * FNV-1a, for a stable angle per trip.
 *
 * `useLiveTrips` refetches every four seconds and the list order changes as
 * statuses do, so an angle derived from an index would move a contact on every
 * poll — movement that did not happen. Derived from the id, it never moves.
 */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

export function contactsFor(trips: LiveTripEntry[]): Contact[] {
  const distances = trips
    .map((t) => t.pulse?.kmLeftMax ?? null)
    .filter((km): km is number => km !== null);
  // Guard the all-arrived case: every distance is 0 and the scale collapses.
  const furthest = Math.max(0, ...distances);

  return trips.map((t) => {
    const km = t.pulse?.kmLeftMax ?? null;
    // No pulse, or no destination to measure against: park it on the rim
    // rather than imply it is nearly done.
    const radius = km === null || furthest === 0 ? (km === 0 ? 0 : 1) : km / furthest;

    return {
      tripId: t.tripId,
      radius,
      angle: (hash(t.tripId) / 0xffffffff) * Math.PI * 2,
      status: t.pulse?.worst ?? null,
      memberCount: t.memberCount,
      located: t.pulse !== null,
    };
  });
}

/**
 * The pulse as a sentence.
 *
 * Every card says this next to its colour. Five statuses tuned to pass AA on
 * one ground sit in a narrow luminance band, so they collide in greyscale and
 * for colourblind users — the same argument the STATUS map in Radar.tsx makes
 * for pairing every colour with a glyph.
 */
export function pulseWords(pulse: TripPulse | null): string {
  if (pulse === null) return "Nobody located yet";
  if (pulse.stopped > 0) return `${pulse.stopped} stopped`;
  if (pulse.moving === 0 && pulse.arrived > 0) return "Everyone arrived";
  if (pulse.worst === "behind") return "Someone behind";
  if (pulse.worst === "ahead") return "Someone ahead";
  return "Everyone with the group";
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cd frontend && npx vitest run lib/__tests__/pulse.test.ts && npx tsc --noEmit`
Expected: 12 passing, typecheck clean.

- [ ] **Step 5: Commit**

```bash
cd frontend
git add lib/pulse.ts lib/__tests__/pulse.test.ts
git commit -m "feat: rank live trips and place them on the scope

Three identical cards told you nothing about which trip needed you. One
attention order — stopped, behind, ahead, with, arrived — now drives the cards,
the contacts and the trip screen's member list.

A contact's angle is a hash of the trip id and encodes nothing, because there
is no second dimension worth showing and inventing one would be a lie. What it
must be is stable: the dashboard refetches every four seconds, and an angle
derived from list position would move a contact on every poll — movement that
did not happen.

Extracted from the component because this vitest has no DOM and silently does
not collect .test.tsx, so logic left in a component is logic with no test."
```

---

## Task 7: The scope becomes an instrument

**Files:**
- Create: `frontend/app/components/LiveScope.tsx`
- Modify: `frontend/app/components/Account.tsx` — remove `Scope` (currently at `:160-224`), import from the new module

**Interfaces:**
- Consumes: `Contact` and `contactsFor` (Task 6); `C` and `STATUS` from `./Radar`.
- Produces: `export function LiveScope({ contacts, size }: { contacts: Contact[]; size?: number | string })`.

**Context you need:** `Scope` is exported from `Account.tsx` and used at exactly one call site (`Account.tsx:970`). Move the whole drawing into `LiveScope.tsx` — same two range rings, same crosshairs, same `gt-sweep`, same `gt-breathe` dashed slot. **The empty state must render byte-for-byte the drawing it renders today**; it is the thing this redesign was asked to keep.

`prefers-reduced-motion` is already handled globally at `globals.css:248` by a blanket `*` rule, so the sweep needs nothing new.

- [ ] **Step 1: Write the component**

Create `frontend/app/components/LiveScope.tsx`:

```tsx
"use client";

import { C, STATUS } from "./Radar";
import type { Contact } from "@/lib/pulse";

/**
 * The scope: Radar's own mark, at the size where it can carry a screen — and
 * now carrying the trips as well.
 *
 * With no contacts this is exactly the drawing that used to be the empty
 * state, and deliberately so: an empty scope is not a placeholder for missing
 * content, it *is* the content — nobody is out there right now. With contacts
 * it is the same instrument saying who is.
 *
 * Geometry is the full mark from `app/icon.svg`: two range rings, you, and
 * contacts on the field. Not a drawing invented for this screen.
 *
 * `aria-hidden`, because it restates the cards beneath it and those carry the
 * status as a word. Nothing here is the only channel for anything.
 */

/** The outer ring, in the 200-unit viewBox. Contacts never sit outside it. */
const R_OUTER = 88;

export function LiveScope({
  contacts = [],
  size = 176,
}: {
  contacts?: Contact[];
  size?: number | string;
}) {
  return (
    <div
      className="relative grid place-items-center shrink-0"
      style={{ width: size, height: size, aspectRatio: "1" }}
      aria-hidden
    >
      {/* The sweep sits under the rings so it reads as passing beneath them. */}
      <svg className="gt-sweep absolute inset-0 w-full h-full" viewBox="0 0 200 200">
        <defs>
          <linearGradient id="scope-sweep" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={C.arrived} stopOpacity="0" />
            <stop offset="100%" stopColor={C.arrived} stopOpacity="0.22" />
          </linearGradient>
        </defs>
        <path d="M100 100 L100 12 A88 88 0 0 1 188 100 Z" fill="url(#scope-sweep)" />
        <line x1="100" y1="100" x2="188" y2="100" stroke={C.arrived} strokeOpacity="0.5" strokeWidth="1.5" />
      </svg>

      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 200 200">
        {/* Two range rings, as the full mark has. */}
        <circle cx="100" cy="100" r="88" fill="none" stroke={C.lineStrong} strokeOpacity="0.55" strokeWidth="1.25" />
        <circle cx="100" cy="100" r="52" fill="none" stroke={C.lineStrong} strokeOpacity="0.35" strokeWidth="1.25" />
        {/* Cross-hairs, clipped to the outer ring, so the field reads as an
            instrument rather than a target. */}
        <line x1="100" y1="12" x2="100" y2="188" stroke={C.line} strokeOpacity="0.6" strokeWidth="1" />
        <line x1="12" y1="100" x2="188" y2="100" stroke={C.line} strokeOpacity="0.6" strokeWidth="1" />

        {/* You. */}
        <circle cx="100" cy="100" r="14" fill={C.arrived} fillOpacity="0.16" />
        <circle cx="100" cy="100" r="6.5" fill={C.arrived} />

        {contacts.length === 0 ? (
          /* An empty slot rather than a contact: nobody is out there, and this
             is where the first person will appear. Outlined, not filled, so it
             does not claim somebody is already on the ring — and present at all
             because a scope with nothing on it is a bullseye. */
          <circle
            className="gt-breathe"
            cx="152" cy="62" r="6.5"
            fill="none" stroke={C.ahead} strokeWidth="1.5" strokeDasharray="3 3"
          />
        ) : (
          contacts.map((c) => {
            const cx = 100 + Math.cos(c.angle) * R_OUTER * c.radius;
            const cy = 100 + Math.sin(c.angle) * R_OUTER * c.radius;
            // 5 at one member, growing slowly: a busy trip should read as
            // bigger without a six-person convoy swamping the field.
            const r = Math.min(11, 5 + c.memberCount);

            // Nobody located: the same outlined treatment as the empty state,
            // which already means "something belongs here and nobody is
            // confirmed on it yet".
            if (!c.located || c.status === null) {
              return (
                <circle
                  key={c.tripId} className="gt-breathe"
                  cx={cx} cy={cy} r={r}
                  fill="none" stroke={C.ahead} strokeWidth="1.5" strokeDasharray="3 3"
                />
              );
            }

            const tone = STATUS[c.status].color;
            return (
              <g key={c.tripId}>
                <circle cx={cx} cy={cy} r={r + 5} fill={tone} fillOpacity="0.15" />
                <circle cx={cx} cy={cy} r={r} fill={tone} />
              </g>
            );
          })
        )}
      </svg>
    </div>
  );
}
```

- [ ] **Step 2: Delete `Scope` from `Account.tsx` and point the call site at the new component**

Remove the `Scope` component and its doc comment from `Account.tsx`. Add at the top:

```ts
import { LiveScope } from "./LiveScope";
```

and change the one call site (`Account.tsx:970`) from `<Scope size="clamp(124px, 25vh, 196px)" />` to:

```tsx
<LiveScope size="clamp(124px, 25vh, 196px)" />
```

With no `contacts` prop it renders the empty state, which is byte-identical to today.

- [ ] **Step 3: Verify nothing else imported `Scope`**

Run: `cd frontend && grep -rn "Scope" app lib --include=*.tsx --include=*.ts | grep -v LiveScope`
Expected: no matches. If there are, update them.

- [ ] **Step 4: Verify**

Run: `cd frontend && npx tsc --noEmit && npm test && npm run lint`
Expected: all green. The token guards pick up `LiveScope.tsx` automatically — the type-scale case count rises by one.

- [ ] **Step 5: Commit**

```bash
cd frontend
git add app/components/LiveScope.tsx app/components/Account.tsx
git commit -m "refactor: the scope moves out, and learns to hold contacts

Same drawing — two range rings, the crosshairs, the sweep, the outlined slot.
With no contacts it renders exactly what the empty state rendered before, which
is deliberate: an empty scope is not a placeholder for missing content, it is
the content.

What is new is that it can now say who is out there instead of only that
nobody is. aria-hidden, because the cards beneath carry the same status as a
word and nothing here is the only channel for anything."
```

---

## Task 8: Home becomes a status board

**Files:**
- Modify: `frontend/app/components/Account.tsx` — `HomeDashboard` at `:892-1030`

**Interfaces:**
- Consumes: `LiveScope` (Task 7); `rankTrips`, `contactsFor`, `pulseWords` (Task 6); `STATUS`, `Glyph` from `./Radar`.
- Produces: no new exports. `HomeDashboard`'s props are unchanged.

**Context you need:** the void is `justifyContent: "safe center"` on the scroller at `Account.tsx:934`. `LiveTripCard` already exists in this file — extend it rather than writing a second card. `STATUS[key]` gives `{ color, soft, glyph, label, hint }`, and `Glyph` renders the glyph in a font that actually has it.

- [ ] **Step 1: Rewrite the running branch**

In `HomeDashboard`:

1. Remove `justifyContent: "safe center"` from the scroller's style at `:934`. Keep `paddingBottom: TAB_BAR_SPACE`.
2. Above the running/empty branch, compute once:

```tsx
  const ranked = rankTrips(live);
  const contacts = contactsFor(live);
```

3. Render the scope in **both** branches, with contacts only when running:

```tsx
        <div className="flex flex-col items-center" style={{ paddingTop: 12 }}>
          <LiveScope contacts={contacts} size="clamp(124px, 22vh, 176px)" />
        </div>
```

4. The running branch's list becomes `ranked.map(...)`, and each `LiveTripCard` gains the pulse line.

- [ ] **Step 2: Give the card its status line**

In `LiveTripCard`, beneath the existing "N people · Nh left" line, add:

```tsx
      <div className="flex items-center gap-1.5" style={{ marginTop: 3 }}>
        {trip.pulse?.worst != null && <Glyph s={trip.pulse.worst} size={11} />}
        <span
          style={{
            fontFamily: FONT.body, fontSize: 13,
            color: trip.pulse?.worst != null ? STATUS[trip.pulse.worst].color : C.muted,
          }}
        >
          {pulseWords(trip.pulse)}
        </span>
        {trip.pulse?.kmLeftMax != null && (
          <span className="tnum" style={{ fontFamily: FONT.body, fontSize: 13, color: C.muted }}>
            · {trip.pulse.kmLeftMax.toFixed(1)} km left
          </span>
        )}
      </div>
```

The glyph and the words carry the status; the colour only reinforces them.

- [ ] **Step 3: Demote the actions when something is running**

Keep `PrimaryButton`/`SecondaryButton` as they are in the empty branch. In the running branch render them as a single row of two secondary-weight buttons, so the cards stay the loudest thing on the screen:

```tsx
        <div className="flex gap-3" style={{ paddingTop: 22 }}>
          <SecondaryButton onClick={onStart}>Start a trip</SecondaryButton>
          <SecondaryButton onClick={onJoin}>Join</SecondaryButton>
        </div>
```

- [ ] **Step 4: Verify in the browser**

Start the API and the app (see Task 11 for the commands), sign in, and confirm:
- With nothing running, Home is exactly as it was — the scope, "Nothing running", the two buttons at full weight.
- With trips running, the scope shows one contact per trip and there is no void under the header.
- A trip with a stopped member sorts to the top and its card reads "N stopped".

- [ ] **Step 5: Verify and commit**

Run: `cd frontend && npx tsc --noEmit && npm test && npm run lint`

```bash
cd frontend
git add app/components/Account.tsx
git commit -m "feat: Home becomes a live status board

The scroller centred itself, so three running trips floated in the middle of
the viewport under a large void. That is gone: content starts at the top.

The cards were three identical slabs — the trip where two riders had stopped
looked exactly like the two running fine. They now rank worst-status-first and
each says what is happening in words, with the glyph beside it. Colour
reinforces; it never carries.

And the scope is on screen whether or not anything is running, holding a
contact per trip. It used to appear only when it had nothing to say."
```

---

## Task 9: The tab bar reaches the trip screen

**Files:**
- Modify: `frontend/app/components/TabBar.tsx`, `frontend/app/(tabs)/layout.tsx`
- Move: `frontend/app/t/[code]/page.tsx` → `frontend/app/(tabs)/t/[code]/page.tsx`

**Interfaces:**
- Consumes: `useHideTabBar` from `./TabBarContext`.
- Produces: `TabBar` accepts `active: TabKey | null`.

**Context you need:** route groups do not affect URLs — `/t/[code]` stays `/t/[code]`. `app/t/[code]/join/page.tsx` is a **different route** and stays where it is. `(tabs)/layout.tsx` already mounts `PhoneFrame`, so the moved page must drop its own or the frame nests. The `View` type in that page is `{kind:"group"} | {kind:"member";id} | {kind:"map"} | {kind:"glance"}`.

- [ ] **Step 1: Let `TabBar` have no active tab**

In `TabBar.tsx`, change the signature and correct the doc comment:

```ts
export function TabBar({ active }: { active: TabKey | null }) {
```

`const on = key === active;` already yields `false` for every tab when `active` is null — no other change is needed inside the map.

Replace the "never on `/t/[code]`" paragraph of the doc comment with:

```
 * Rendered for a signed-in person across the whole shell, including the group
 * view — which is reached often enough mid-trip that losing every other
 * section behind a Back was the worse trade. It stands down for the two views
 * that own the whole viewport: the map and glance mode.
 *
 * `active` is null inside a trip: none of the four sections is where you are.
```

- [ ] **Step 2: Give the layout a null case**

In `(tabs)/layout.tsx`, change `TAB_FOR_PATH` to return `TabKey | null`:

```ts
const TAB_FOR_PATH = (pathname: string): TabKey | null => {
  // A trip is not one of the four sections. Highlighting Home while you are
  // looking at a trip would claim you are somewhere you are not.
  if (pathname.startsWith("/t/")) return null;
  if (pathname.startsWith("/trips")) return "trips";
  if (pathname.startsWith("/repairs")) return "repairs";
  if (pathname.startsWith("/you")) return "you";
  return "home";
};
```

Also update the layout's doc comment, which currently says `/t/[code]` is deliberately outside the group.

- [ ] **Step 3: Move the route**

```bash
cd frontend
mkdir -p "app/(tabs)/t"
git mv "app/t/[code]/page.tsx" "app/(tabs)/t/[code]/page.tsx"
```

`git mv` will need the target directory to exist; create `app/(tabs)/t/[code]/` first if it complains. **Leave `app/t/[code]/join/page.tsx` exactly where it is.**

- [ ] **Step 4: Drop the page's own `PhoneFrame` and stand the bar down for map and glance**

In the moved page, remove the `PhoneFrame` import and unwrap it from the returned tree — the layout mounts it now. Then add:

```ts
import { useHideTabBar } from "../../../components/TabBarContext";
```

(check the relative depth from the new location) and, beside the other effects:

```ts
  // The map and glance own the whole viewport — one is a full-bleed instrument
  // and the other is meant to be stared at from a handlebar. A nav strip
  // across either is both a crowded control and a mis-tap onto a different
  // screen mid-ride.
  const tabBar = useHideTabBar();
  useEffect(() => {
    const full = view.kind === "map" || view.kind === "glance";
    tabBar.setHidden(full);
    return () => tabBar.setHidden(false);
  }, [view.kind, tabBar]);
```

- [ ] **Step 5: Verify in the browser — this is the risky step**

Run the app and check, from a **real share link**:
- `/t/<code>` still loads. Every share link and QR code points here.
- `/t/<code>/join` still loads and still joins.
- The tab bar is present on the group view and gone on the map and in glance mode.
- The frame is not doubled — one phone frame, not two.
- Signed out, there is no tab bar (`.gt-tabbar` is gated on `[data-signed-in="1"]`) and the screen otherwise behaves as before.

- [ ] **Step 6: Verify and commit**

Run: `cd frontend && npx tsc --noEmit && npm test && npm run lint`

```bash
cd frontend
git add app/components/TabBar.tsx "app/(tabs)/layout.tsx" "app/(tabs)/t/[code]/page.tsx" "app/t/[code]/page.tsx"
git commit -m "feat: the tab bar reaches the trip screen

Opening a trip used to cost you every other section until you found the Back.
TabBar's own comment argued for that — the group view is a full-bleed
instrument with its own bottom bar — and this reverses it: the group view is
reached often enough mid-trip that losing the shell was the worse trade.

Done by moving the route into the (tabs) group rather than rendering a second
bar by hand, so the shell stays one thing. Route groups do not affect URLs, so
every share link and QR code still points where it did.

The bar stands down for the map and for glance mode through the seam that
already existed for Home's Create step. No tab is active inside a trip:
highlighting Home would claim you are somewhere you are not."
```

---

## Task 10: The trip screen body

**Files:**
- Create: `frontend/app/components/GroupScreen.tsx`
- Modify: `frontend/app/(tabs)/t/[code]/page.tsx` — render `GroupScreen` instead of `Group`

**Interfaces:**
- Consumes: `Group`'s existing props; `ATTENTION_ORDER` (Task 6); `TAB_BAR_SPACE` from `./TabBar`.
- Produces: `export function GroupScreen(props)` — the same prop shape `Group` takes today, minus nothing.

**Context you need:** `Group` lives at `Radar.tsx:1228`. Its bottom bar (`Radar.tsx:~1415-1460`) holds a "Group" button with `aria-current="page"` and **no `onClick`** — a button that does nothing — and a "Map" button. `Radar.tsx` is 2,040 lines; the new screen goes in its own file. Keep `Group` exported for now; Task 11 removes it if nothing else imports it.

**`Group` depends on three things `Radar.tsx` does not export**, verified by reading it: the components `Horizon` (`:397`) and `VerdictBlock` (`:471`), and the helper `partition`. A new file cannot import any of them, so Step 1 exists before the component can compile. Everything else it uses — `C`, `FONT`, `Avatar`, `AvatarWithStatus`, `StatusPill`, `Glyph`, `Eyebrow`, `IconButton`, `PAD_T`, `PAD_B`, `STATUS`, `Row`, `type Member` — is already exported, and the lucide icons (`Bell`, `BellOff`, `ChevronRight`, `MapPin`, `MoreHorizontal`, `Navigation`, `Plus`, `Users`) are imported straight from `lucide-react`.

- [ ] **Step 1: Export what the new file needs**

In `Radar.tsx`, add `export` to the three declarations — nothing else changes:

```ts
export const Horizon = ({ ... })        // was: const Horizon
export const VerdictBlock = ({ ... })   // was: const VerdictBlock
export function partition(...)          // or `export const partition`, matching its current form
```

Run `npx tsc --noEmit` and commit this on its own — it is a mechanical change and keeping it separate makes the next step's diff readable:

```bash
cd frontend
git add app/components/Radar.tsx
git commit -m "refactor: export the pieces the trip screen is built from

Horizon, VerdictBlock and partition were module-private, which is the only
thing stopping the group view from living outside this 2,040-line file."
```

- [ ] **Step 2: Copy `Group` into `GroupScreen.tsx` and change three things**

Create `app/components/GroupScreen.tsx` with `Group`'s body, importing from `./Radar` the exports listed above. Then:

1. **Delete the bottom bar entirely** — both buttons and their wrapper.
2. **Add the floating Map pill** as the last child of the outer flex column:

```tsx
      {/* Bottom right and above the tab bar: this is used one-handed on a
          bike, and the top of a tall phone is not reachable with a thumb. */}
      <button
        onClick={onOpenMap}
        className="absolute rounded-full flex items-center gap-2 transition-transform active:scale-[0.96]"
        style={{
          right: 20, bottom: `calc(${TAB_BAR_SPACE} + 8px)`, zIndex: 20,
          minHeight: 48, paddingLeft: 18, paddingRight: 20,
          background: C.text, color: C.ground,
          fontFamily: FONT.body, fontSize: 15, fontWeight: 600,
          boxShadow: "0 6px 20px rgba(0,0,0,0.28)",
        }}
      >
        <Navigation size={18} /> Map
      </button>
```

The outer container needs `position: relative` for this to anchor.

3. **Rank the member list** by `ATTENTION_ORDER`, replacing the current `partition` ordering:

```tsx
  const rank = (m: Member) =>
    m.status === null ? ATTENTION_ORDER.length : ATTENTION_ORDER.indexOf(m.status);
  const shown = [...members].sort((a, b) => rank(a) - rank(b));
```

4. Change the scroller's `paddingBottom` to `TAB_BAR_SPACE` so the last row clears the bar, and drop the `<div style={{ height: 12 }} />` spacer that padded the old bottom bar.

- [ ] **Step 3: Point the page at it**

In `app/(tabs)/t/[code]/page.tsx`, import `GroupScreen` from `../../../components/GroupScreen` and render it wherever `<Group ... />` appears, with the same props.

- [ ] **Step 4: Verify in the browser**

- The Map pill sits above the tab bar and opens the map; the tab bar disappears there and comes back on Back.
- There is no "Group" button any more.
- The member list puts stopped riders first.
- Nothing is hidden behind the tab bar at the bottom of a long roster.

- [ ] **Step 5: Verify and commit**

Run: `cd frontend && npx tsc --noEmit && npm test && npm run lint`

```bash
cd frontend
git add app/components/GroupScreen.tsx "app/(tabs)/t/[code]/page.tsx"
git commit -m "feat: rebuild the trip screen around the tab bar

The bottom bar is gone. 'Group' went with it rather than moving: it rendered
with aria-current=page and no onClick, so it was a button that did nothing —
the group is the screen you are already on. Map becomes a floating pill,
bottom right above the tab bar, because this is used one-handed on a bike and
the top of a tall phone is not reachable with a thumb.

The roster now uses the same attention order as Home, so a stopped rider is
first on both screens rather than first on one and alphabetical on the other.

In its own file: Radar.tsx is 2,040 lines holding fifteen exports and it needs
a proper split. This does not attempt one, it just stops making it worse."
```

---

## Task 11: Documentation and the walkthrough

**Files:**
- Modify: `backend/README.md`, `frontend/README.md`, `frontend/CLAUDE.md`, `frontend/app/globals.css:195`

- [ ] **Step 1: Correct the sweep comment**

`globals.css:195` says the sweep "Only ever runs on an idle Home screen, where it is the". That stopped being true in Task 7 — it now runs whenever Home is open. Rewrite it to say so, and keep the note that the `prefers-reduced-motion` block stops it dead.

- [ ] **Step 2: Document the endpoint**

In `backend/README.md`, extend the `/v1/me/trips/live` description with the pulse: what it carries, that it is counts and one distance and never coordinates, that it is null when nobody is located, and that the status engine now exists in both repos pinned to `contract.json` goldens. Add a line to the rate-limit prose if the polling cost is worth naming.

- [ ] **Step 3: Document the screens**

In `frontend/README.md`: Home is a live status board, the scope carries a contact per running trip, cards rank by attention. The tab bar now reaches the trip screen and stands down for map and glance.

In `frontend/CLAUDE.md`, correct what this makes untrue — the file map (two new components), and any claim about `/t/[code]` sitting outside the tabs group.

- [ ] **Step 4: Walk it in a browser**

```bash
docker start caravan-pg
cd backend && npx tsx --env-file=.env src/server.ts        # :8787
# check nothing is on :3000 first — lsof -ti:3000
cd frontend && NEXT_PUBLIC_API_URL=http://localhost:8787 npm run dev
```

**Note `backend/.env` currently points `DATABASE_URL` at Neon, not local Postgres.** Point it at `postgres://caravan:...@localhost:5436/caravan` for the walkthrough, or accept that the walkthrough writes real rows.

Confirm each, and **report what you actually observed, including anything that did not work**:

1. Signed in with nothing running — Home is exactly as before: the scope, "Nothing running", both buttons at full weight.
2. Start two trips — the void under the header is gone, and two contacts appear on the scope.
3. A trip where somebody has stopped sorts above one where nobody has, and its card reads "1 stopped" with the glyph.
4. A trip nobody has reported a position in shows a dashed outlined contact and "Nobody located yet" — not "0 stopped".
5. Contacts do not jump when the 4-second poll fires.
6. Open a trip — the tab bar is there, no tab highlighted, and the Map pill floats above it.
7. Open the map — the tab bar and the pill both disappear. Back — both return.
8. Glance mode — no tab bar.
9. Tap Trips from inside a trip — it navigates, and Back returns to the trip.
10. Signed out, from a share link — the trip screen works and has no tab bar.
11. `/t/<code>/join` still joins.

- [ ] **Step 5: Final verification**

Run, and paste the real output rather than asserting success:

```bash
cd backend && npx tsc --noEmit && npm test
cd frontend && npx tsc --noEmit && npm test && npm run lint && npm run build
```

`npm run build` is safe **only if no dev server is running** — stop it first.

- [ ] **Step 6: Commit**

```bash
cd backend && git add README.md && git commit -m "docs: the live pulse and what it deliberately omits"
cd frontend && git add README.md CLAUDE.md app/globals.css && git commit -m "docs: Home is a status board and the tab bar reaches trips

The sweep comment said it only ever runs on an idle Home screen, which was
true until the scope started carrying contacts."
```

---

## Notes for the executor

- **Two repos.** Never stage across both in one commit. Tasks 1a/2/3/4 are backend, 1b/5–10 frontend, 11 both.
- **`contract.json` is copied, never retyped.** `diff backend/contract.json frontend/contract.json` must print nothing.
- **Task 1 must precede Task 2.** The goldens exist so the ported engine has something to be wrong against.
- **A `.test.tsx` file is silently not collected.** If a task seems to want a component test, it is the wrong task — extract the logic to `lib/` instead.
- **Never `npm run build` while a dev server is up**, and never run two dev servers for one repo. Both have bitten this project.
- **When a step's expectation and reality disagree, stop and say so.** Do not adjust an assertion to match what the code happens to do. The last feature shipped with a documented dedupe defect precisely because the implementer reported it rather than tuning a threshold to hide it.
- **The riskiest edit in this plan is the route move in Task 9.** `/t/[code]` is the URL every share link and QR code points at. If anything about it behaves differently after the move, stop.
- **Do not delete `Group` from `Radar.tsx` in Task 10.** Check for other importers first; removing it is a separate, verifiable step.
