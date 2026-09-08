# Destination Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let someone type a destination on the Create screen, tap a suggestion, and have it set both the name and the map pin — connecting two fields that have never known about each other.

**Architecture:** A thin `GET /v1/geocode` proxy on the API that calls Photon, maps its GeoJSON to a small `Place` shape, ranks Ghana first, collapses duplicates and caches by normalised query. On the client, a `lib/data/geocode.ts` client following the existing `account.ts` pattern, and a `DestinationSearch` combobox that owns the input, debounce and suggestion list.

**Tech Stack:** Backend — TypeScript strict ESM, Hono 4, zod, Vitest against real Postgres. Frontend — Next.js 14 App Router, TypeScript strict, Vitest in `node` environment (no DOM), inline styles referencing `C`/`FONT`.

**Spec:** `docs/superpowers/specs/2026-09-08-destination-search-design.md` — read it; this plan argues from it.

## Global Constraints

- **Backend baseline: 536 tests passing, `npx tsc --noEmit` clean.** Frontend baseline: **326 passing (36 skipped)**, and its bar is four green — `npx tsc --noEmit`, `npm test`, `npm run lint`, `npm run build`.
- **TDD throughout.** Failing test first, watch it fail for the right reason, minimal implementation, watch it pass.
- **`npm run dev` in the backend is broken** — its scripts run `tsx` with nothing loading `.env`, so it exits on `Missing required env var DATABASE_URL`. Use `npx tsx --env-file=.env src/server.ts`.
- **Never run `npm run build` while a dev server is running** in the same repo — it overwrites `.next` and every dynamic route starts 404ing. Never run two dev servers for one repo.
- **Frontend vitest is `environment: "node"` with `include: ["**/*.test.ts"]`.** There is no DOM, browser globals need `vi.stubGlobal` + `vi.resetModules()`, and a `.test.tsx` file is **silently not collected** — never write one.
- **Frontend styling is inline `style={{...}}` referencing `C` and `FONT`**, not Tailwind utilities. `C.x` is the string `var(--c-x)`, so no colour arithmetic in JS — use the declared `--c-*-soft` tokens.
- **Text inputs must be ≥16px** or iOS Safari zooms the viewport on focus. `lib/__tests__/tokens.test.ts` enforces it.
- **A `flex-1` scroll container needs `min-h-0`** or it refuses to shrink and pushes the bottom action bar out of frame.
- **Ghana bbox is `-3.26,4.71,1.20,11.17`** (minLon,minLat,maxLon,maxLat). Never send the rider's own position upstream.
- Commit with `git add` naming files explicitly. Never `git add -A`.
- Two repos: backend work is in `backend/`, frontend in `frontend/`. Commit in the repo you changed; never commit across both in one commit.

## File Structure

| File | Responsibility |
|---|---|
| `backend/src/domain/geocode.ts` | **new** — pure: `normalizeQuery`, `featuresToPlaces`, the `Place` type. No I/O, no cache. The highest-value test surface in the feature. |
| `backend/src/domain/geocode.test.ts` | **new** — with `photon.fixture.json`, a real recorded response. |
| `backend/src/domain/geocode.fixture.json` | **new** — recorded from `photon.komoot.io` on 8 Sep 2026. |
| `backend/src/domain/lru.ts` | **new** — a tiny generic LRU with TTL. Nothing geocoding-specific; testable alone. |
| `backend/src/domain/lru.test.ts` | **new** |
| `backend/src/geo/photon.ts` | **new** — the only place that talks to Photon: URL building, timeout, empty-on-failure. |
| `backend/src/geo/photon.test.ts` | **new** — with a stubbed `fetchFn`. |
| `backend/src/http/geocode.ts` | **new** — the route. Wires cache + upstream + mapping. |
| `backend/src/http/quotas.ts` | a `geocode` quota |
| `backend/src/http/app.ts` | mount the route, apply the quota, thread `photonUrl` |
| `backend/src/config.ts` | `photonUrl`, defaulting to the public instance |
| `backend/tests/api.geocode.test.ts` | **new** — endpoint tests through `app.request()` |
| `frontend/lib/data/geocode.ts` | **new** — `GeocodeClient`, `createGeocodeClient`, `offlineGeocode`. Modelled on `account.ts` exactly. |
| `frontend/lib/data/__tests__/geocode.test.ts` | **new** |
| `frontend/lib/data/index.ts` | wire it beside `account` and `notifications` |
| `frontend/lib/search.ts` | **new** — debounce and the minimum-length rule, extracted so it can be tested without a DOM |
| `frontend/lib/__tests__/search.test.ts` | **new** |
| `frontend/lib/__tests__/tokens.test.ts` | discover the component directory instead of a hardcoded list (Task 7) |
| `frontend/app/components/DestinationSearch.tsx` | **new** — the combobox |
| `frontend/app/components/Radar.tsx` | use it in the Create screen |

`geocode.ts` (pure) knows nothing about HTTP; `photon.ts` knows nothing about caching; `http/geocode.ts` composes them. Each is testable alone.

**Refinement to the spec:** §4 and §12 say `frontend/lib/geocode.ts`. It belongs at **`frontend/lib/data/geocode.ts`**, beside `account.ts` and `notifications.ts`, which are the existing precedent for a non-`DataClient` client wired in `lib/data/index.ts` with an `offlineX` fallback. Same reasoning as the spec gives, better address.

---

## Task 1: The pure mapping

**Files:**
- Create: `backend/src/domain/geocode.ts`, `backend/src/domain/geocode.fixture.json`
- Test: `backend/src/domain/geocode.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export interface Place {
    id: string; label: string; detail: string | null; lat: number; lng: number;
  }
  export function normalizeQuery(raw: string): string;
  export function featuresToPlaces(body: unknown): Place[];
  ```

- [ ] **Step 1: Record the fixture**

Create `backend/src/domain/geocode.fixture.json` with this exact content. It is a real response recorded from `photon.komoot.io` on 8 Sep 2026, trimmed to the three features that matter and with a second duplicate "Accra Mall" feature appended — one place returned as both a node and a way is what the real service does, and two is enough to prove the dedupe.

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [-2.8693525, 5.545259] },
      "properties": {
        "osm_id": 2970754860, "osm_type": "N", "osm_key": "place", "osm_value": "village",
        "name": "Kotoka", "county": "Aboisso", "state": "Comoé",
        "country": "Côte d'Ivoire", "countrycode": "CI", "type": "city"
      }
    },
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [-0.1682694, 5.6038402] },
      "properties": {
        "osm_id": 167081531, "osm_type": "W", "osm_key": "aeroway", "osm_value": "aerodrome",
        "name": "Accra International Airport", "street": "Giffard Road",
        "postcode": "GL-070-5368", "district": "Cantonments",
        "county": "La-Dade-Kotopon Municipal District", "state": "Greater Accra Region",
        "country": "Ghana", "countrycode": "GH", "type": "house",
        "extent": [-0.1771371, 5.6205629, -0.1594466, 5.5872779]
      }
    },
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [-0.9302987, 6.4546731] },
      "properties": {
        "osm_id": 13556420832, "osm_type": "N", "osm_key": "amenity", "osm_value": "fast_food",
        "name": "Kotoka Foods and Services", "city": "Noyem", "locality": "Noyem Nagoroso",
        "county": "Birim North District", "state": "Eastern Region",
        "country": "Ghana", "countrycode": "GH", "type": "house"
      }
    },
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [-0.1738, 5.6212] },
      "properties": {
        "osm_id": 300000001, "osm_type": "N", "osm_key": "shop", "osm_value": "mall",
        "name": "Accra Mall", "district": "Cantonments", "state": "Greater Accra Region",
        "country": "Ghana", "countrycode": "GH", "type": "house"
      }
    },
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [-0.17381, 5.62119] },
      "properties": {
        "osm_id": 300000002, "osm_type": "W", "osm_key": "shop", "osm_value": "mall",
        "name": "Accra Mall", "district": "Cantonments", "state": "Greater Accra Region",
        "country": "Ghana", "countrycode": "GH", "type": "house"
      }
    }
  ]
}
```

- [ ] **Step 2: Write the failing test**

Create `backend/src/domain/geocode.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeQuery, featuresToPlaces } from "./geocode.ts";

const fixture = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "geocode.fixture.json"), "utf8")
);

describe("normalizeQuery", () => {
  it("trims, lowercases and collapses internal whitespace", () => {
    expect(normalizeQuery("  Accra   MALL ")).toBe("accra mall");
  });

  it("is stable for inputs that differ only in spacing or case", () => {
    // This is a cache key: two spellings of one intent must not cost two
    // upstream requests.
    expect(normalizeQuery("Kotoka")).toBe(normalizeQuery("  kotoka  "));
  });
});

describe("featuresToPlaces", () => {
  const places = featuresToPlaces(fixture);

  it("reads coordinates as [lon, lat], not [lat, lng]", () => {
    // Photon speaks GeoJSON, so longitude comes first. Getting this backwards
    // puts every Ghanaian destination in the Indian Ocean.
    const airport = places.find((p) => p.label === "Accra International Airport")!;
    expect(airport.lat).toBeCloseTo(5.6038402, 6);
    expect(airport.lng).toBeCloseTo(-0.1682694, 6);
  });

  it("ranks Ghana above everywhere else without dropping the rest", () => {
    // The upstream returns the Côte d'Ivoire village first even with a Ghana
    // bbox, so ranking cannot be left to it. But a convoy to Abidjan is real,
    // so a foreign result is demoted, never hidden.
    expect(places[0]!.detail).toContain("Ghana");
    expect(places.some((p) => p.detail?.includes("Côte d'Ivoire"))).toBe(true);
  });

  it("composes a detail line from whichever locality fields exist", () => {
    // There is no fixed property set: one feature has county+state, another
    // district+street+postcode, another city+locality.
    const byLabel = (l: string) => places.find((p) => p.label === l)!;
    expect(byLabel("Accra International Airport").detail)
      .toBe("Cantonments · Greater Accra Region · Ghana");
    expect(byLabel("Kotoka Foods and Services").detail)
      .toBe("Noyem · Eastern Region · Ghana");
    expect(byLabel("Kotoka").detail).toBe("Aboisso · Comoé · Côte d'Ivoire");
  });

  it("collapses one place returned as several OSM objects", () => {
    // "Accra Mall" comes back as a node and a way eleven metres apart.
    expect(places.filter((p) => p.label === "Accra Mall")).toHaveLength(1);
  });

  it("gives every place a distinct id", () => {
    const ids = places.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("answers an empty array for anything that is not a feature collection", () => {
    // Upstream failure and upstream nonsense must look the same to a screen.
    for (const junk of [null, undefined, {}, { features: null }, "nope", 7]) {
      expect(featuresToPlaces(junk)).toEqual([]);
    }
  });

  it("drops a feature whose geometry is unusable rather than coercing it", () => {
    const bad = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", geometry: { type: "LineString", coordinates: [[1, 2], [3, 4]] },
          properties: { name: "A road", osm_id: 1, osm_type: "W", countrycode: "GH" } },
        { type: "Feature", geometry: { type: "Point", coordinates: ["x", null] },
          properties: { name: "Nowhere", osm_id: 2, osm_type: "N", countrycode: "GH" } },
        { type: "Feature", geometry: { type: "Point", coordinates: [-0.2, 5.6] },
          properties: { name: "Fine", osm_id: 3, osm_type: "N", countrycode: "GH" } },
      ],
    };
    expect(featuresToPlaces(bad).map((p) => p.label)).toEqual(["Fine"]);
  });

  it("drops a feature with no name, because a row with no label is unusable", () => {
    const nameless = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", geometry: { type: "Point", coordinates: [-0.2, 5.6] },
          properties: { osm_id: 4, osm_type: "N", countrycode: "GH", state: "Greater Accra Region" } },
      ],
    };
    expect(featuresToPlaces(nameless)).toEqual([]);
  });

  it("answers null for a detail line when no locality field is present", () => {
    const bare = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", geometry: { type: "Point", coordinates: [-0.2, 5.6] },
          properties: { name: "Somewhere", osm_id: 5, osm_type: "N" } },
      ],
    };
    expect(featuresToPlaces(bare)[0]!.detail).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test and watch it fail**

Run: `cd backend && npx vitest run src/domain/geocode.test.ts`
Expected: FAIL — cannot resolve `./geocode.ts`.

- [ ] **Step 4: Write the implementation**

Create `backend/src/domain/geocode.ts`:

```ts
/**
 * Turning Photon's GeoJSON into something a screen can render.
 *
 * Pure on purpose: no fetch, no cache, no config. Everything surprising about
 * the upstream is handled here and tested against a recorded real response,
 * so a schema change upstream fails a test rather than a screen.
 *
 * Three things about Photon drove this, all observed rather than read:
 *   - coordinates arrive [lon, lat], because GeoJSON says so;
 *   - there is no fixed property set — one result carries county+state, the
 *     next district+street+postcode, the next city+locality;
 *   - the bounding box is a bias, not a filter, so a Ghana bbox still returns
 *     a Côte d'Ivoire village first and ranking is our job.
 */

export interface Place {
  /** Stable within a response. Photon's osm_type + osm_id. */
  id: string;
  label: string;
  detail: string | null;
  lat: number;
  lng: number;
}

/** The cache key. Two spellings of one intent must not cost two requests. */
export function normalizeQuery(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

interface RawProps {
  name?: unknown; countrycode?: unknown; country?: unknown;
  city?: unknown; district?: unknown; county?: unknown; state?: unknown;
  osm_id?: unknown; osm_type?: unknown;
}

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;

/**
 * `[city || district || county, state, country]`, absent parts dropped.
 * This is what tells three same-named results apart, so it is the difference
 * between a useful list and three identical rows.
 */
function detailOf(p: RawProps): string | null {
  const locality = str(p.city) ?? str(p.district) ?? str(p.county);
  const parts = [locality, str(p.state), str(p.country)].filter(
    (x): x is string => x !== null
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function featuresToPlaces(body: unknown): Place[] {
  const features = (body as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) return [];

  const places: Place[] = [];
  const seen = new Set<string>();

  for (const f of features) {
    const feature = f as { geometry?: unknown; properties?: unknown } | null;
    const geometry = feature?.geometry as
      | { type?: unknown; coordinates?: unknown }
      | undefined;
    if (geometry?.type !== "Point") continue;

    const coords = geometry.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const [lng, lat] = coords as unknown[];
    if (typeof lng !== "number" || typeof lat !== "number") continue;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;

    const p = (feature?.properties ?? {}) as RawProps;
    const label = str(p.name);
    // A row with nothing to read is not a suggestion.
    if (label === null) continue;

    // Same name within ~11m is one place returned as several OSM objects.
    const key = `${label}@${lat.toFixed(4)},${lng.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    places.push({
      id: `${str(p.osm_type) ?? "?"}${String(p.osm_id ?? seen.size)}`,
      label,
      detail: detailOf(p),
      lat,
      lng,
    });
  }

  // Ghana first, upstream order preserved within each group. Demoted, never
  // dropped: a convoy to Lomé is a real trip.
  const gh = places.filter((p) => p.detail?.endsWith("Ghana") ?? false);
  const rest = places.filter((p) => !(p.detail?.endsWith("Ghana") ?? false));
  return [...gh, ...rest];
}
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `cd backend && npx vitest run src/domain/geocode.test.ts && npx tsc --noEmit`
Expected: 11 passing (the test block below has eleven `it()` cases), typecheck clean.

**Note on the Ghana check:** the implementation tests `detail.endsWith("Ghana")` rather than `countrycode`, because `detail` is what the test asserts and what a reader sees. If you prefer keying on `countrycode === "GH"`, that is equally correct — but then a feature with a country code and no other locality field ranks first with a `detail` of `"Ghana"`, which is fine. Pick one and make the test say which.

- [ ] **Step 6: Commit**

```bash
cd backend
git add src/domain/geocode.ts src/domain/geocode.test.ts src/domain/geocode.fixture.json
git commit -m "feat: turn Photon's GeoJSON into something a screen can render

Pure and tested against a recorded real response rather than the docs, because
three things about the upstream are only visible on the wire. Coordinates
arrive [lon, lat], so reading them in the obvious order puts every Ghanaian
destination in the Indian Ocean. There is no fixed property set — one result
carries county and state, the next district, street and postcode — so the line
under a name has to be composed from whatever is there. And the bounding box
is a bias rather than a filter: a Ghana bbox still returns a Cote d'Ivoire
village first, which makes ranking our job and not the upstream's.

A foreign result is demoted rather than hidden. A convoy driving to Lome is a
real trip and silently losing the destination would be worse than second place."
```

---

## Task 2: The LRU

**Files:**
- Create: `backend/src/domain/lru.ts`
- Test: `backend/src/domain/lru.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export interface Lru<T> {
    get(key: string): T | undefined;
    set(key: string, value: T): void;
    readonly size: number;
  }
  export function createLru<T>(opts: { max: number; ttlMs: number; now?: () => number }): Lru<T>;
  ```

- [ ] **Step 1: Write the failing test**

Create `backend/src/domain/lru.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createLru } from "./lru.ts";

describe("createLru", () => {
  it("returns what was put in", () => {
    const c = createLru<number>({ max: 3, ttlMs: 1000 });
    c.set("a", 1);
    expect(c.get("a")).toBe(1);
    expect(c.get("missing")).toBeUndefined();
  });

  it("evicts the least recently used entry at the cap", () => {
    // The cap is what stops a burst of unique queries growing memory without
    // bound, so it has to hold under use, not just on insert.
    const c = createLru<string>({ max: 2, ttlMs: 10_000 });
    c.set("a", "1");
    c.set("b", "2");
    c.get("a");          // a is now the most recently used
    c.set("c", "3");     // so b is the one that goes
    expect(c.get("b")).toBeUndefined();
    expect(c.get("a")).toBe("1");
    expect(c.get("c")).toBe("3");
    expect(c.size).toBe(2);
  });

  it("expires an entry once its ttl has passed", () => {
    let t = 0;
    const c = createLru<number>({ max: 5, ttlMs: 100, now: () => t });
    c.set("a", 1);
    t = 99;
    expect(c.get("a")).toBe(1);
    t = 101;
    expect(c.get("a")).toBeUndefined();
  });

  it("drops an expired entry rather than leaving it counted", () => {
    let t = 0;
    const c = createLru<number>({ max: 5, ttlMs: 100, now: () => t });
    c.set("a", 1);
    t = 101;
    c.get("a");
    expect(c.size).toBe(0);
  });

  it("overwrites a key without growing", () => {
    const c = createLru<number>({ max: 2, ttlMs: 1000 });
    c.set("a", 1);
    c.set("a", 2);
    expect(c.get("a")).toBe(2);
    expect(c.size).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd backend && npx vitest run src/domain/lru.test.ts`
Expected: FAIL — cannot resolve `./lru.ts`.

- [ ] **Step 3: Write the implementation**

Create `backend/src/domain/lru.ts`:

```ts
/**
 * A small LRU with a TTL, sized in entries.
 *
 * Nothing here knows about geocoding. It exists because a Map in JavaScript
 * iterates in insertion order, which is most of an LRU for free: deleting and
 * re-setting a key moves it to the end, so the oldest live key is always the
 * first one iteration yields.
 *
 * `now` is injectable so expiry can be tested without faking timers.
 */

export interface Lru<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  readonly size: number;
}

export function createLru<T>(opts: {
  max: number;
  ttlMs: number;
  now?: () => number;
}): Lru<T> {
  const now = opts.now ?? Date.now;
  const entries = new Map<string, { value: T; at: number }>();

  return {
    get(key) {
      const hit = entries.get(key);
      if (hit === undefined) return undefined;
      if (now() - hit.at > opts.ttlMs) {
        // Drop it rather than leave it counted against the cap.
        entries.delete(key);
        return undefined;
      }
      // Re-insert to mark it most recently used.
      entries.delete(key);
      entries.set(key, hit);
      return hit.value;
    },

    set(key, value) {
      entries.delete(key);
      entries.set(key, { value, at: now() });
      while (entries.size > opts.max) {
        const oldest = entries.keys().next();
        if (oldest.done === true) break;
        entries.delete(oldest.value);
      }
    },

    get size() {
      return entries.size;
    },
  };
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd backend && npx vitest run src/domain/lru.test.ts && npx tsc --noEmit`
Expected: 5 passing, typecheck clean.

- [ ] **Step 5: Commit**

```bash
cd backend
git add src/domain/lru.ts src/domain/lru.test.ts
git commit -m "feat: a small LRU with a ttl, for the geocoding cache

Sized in entries rather than bytes, with a hard cap, so a burst of unique
queries cannot grow memory without bound. A JavaScript Map iterates in
insertion order, which is most of an LRU for free — deleting and re-setting a
key moves it to the end, so the oldest live key is whatever iteration yields
first.

The clock is injected so expiry is tested by moving a number rather than by
faking timers."
```

---

## Task 3: The upstream client

**Files:**
- Create: `backend/src/geo/photon.ts`
- Test: `backend/src/geo/photon.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (deliberately — it returns the raw body and lets the caller map it).
- Produces:
  ```ts
  export const GHANA_BBOX = "-3.26,4.71,1.20,11.17";
  export interface PhotonDeps {
    baseUrl: string;
    fetchFn?: typeof fetch;
    timeoutMs?: number;
    userAgent?: string;
  }
  /** The raw upstream body, or null on any failure. Never throws. */
  export function createPhotonSearch(deps: PhotonDeps): (q: string) => Promise<unknown | null>;
  ```

- [ ] **Step 1: Write the failing test**

Create `backend/src/geo/photon.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { createPhotonSearch, GHANA_BBOX } from "./photon.ts";

const ok = (body: unknown): Response =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

describe("createPhotonSearch", () => {
  it("asks the configured instance, with the Ghana bbox and a language", async () => {
    const fetchFn = vi.fn(async () => ok({ type: "FeatureCollection", features: [] }));
    const search = createPhotonSearch({
      baseUrl: "https://photon.test",
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    await search("accra mall");

    const url = new URL(fetchFn.mock.calls[0]![0] as string);
    expect(url.origin + url.pathname).toBe("https://photon.test/api/");
    expect(url.searchParams.get("q")).toBe("accra mall");
    expect(url.searchParams.get("bbox")).toBe(GHANA_BBOX);
    expect(url.searchParams.get("lang")).toBe("en");
    expect(Number(url.searchParams.get("limit"))).toBeGreaterThan(0);
  });

  it("never sends anything about the caller", async () => {
    // The bias is a constant. A rider's own position must not reach a third
    // party on every keystroke — that is the leak this product exists to avoid.
    const fetchFn = vi.fn(async () => ok({ features: [] }));
    const search = createPhotonSearch({
      baseUrl: "https://photon.test",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    await search("circle");
    const url = new URL(fetchFn.mock.calls[0]![0] as string);
    expect(url.searchParams.get("lat")).toBeNull();
    expect(url.searchParams.get("lon")).toBeNull();
  });

  it("identifies itself, because the terms ask and a block should be a conversation", async () => {
    const fetchFn = vi.fn(async () => ok({ features: [] }));
    const search = createPhotonSearch({
      baseUrl: "https://photon.test",
      fetchFn: fetchFn as unknown as typeof fetch,
      userAgent: "radar-api/test (+https://example.test)",
    });
    await search("kumasi");
    const init = fetchFn.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>)["User-Agent"])
      .toBe("radar-api/test (+https://example.test)");
  });

  it("returns the raw body on success, leaving mapping to the caller", async () => {
    const body = { type: "FeatureCollection", features: [{ hello: true }] };
    const search = createPhotonSearch({
      baseUrl: "https://photon.test",
      fetchFn: (async () => ok(body)) as unknown as typeof fetch,
    });
    expect(await search("x")).toEqual(body);
  });

  it("answers null when the upstream errors, rather than throwing", async () => {
    // A 502 arriving mid-keystroke is worse than no suggestions. The screen has
    // a perfectly good map-pin path.
    const search = createPhotonSearch({
      baseUrl: "https://photon.test",
      fetchFn: (async () => ({ ok: false, status: 503, json: async () => ({}) })) as unknown as typeof fetch,
    });
    expect(await search("x")).toBeNull();
  });

  it("answers null when the network throws", async () => {
    const search = createPhotonSearch({
      baseUrl: "https://photon.test",
      fetchFn: (async () => { throw new TypeError("network down"); }) as unknown as typeof fetch,
    });
    expect(await search("x")).toBeNull();
  });

  it("answers null when the body will not parse", async () => {
    const search = createPhotonSearch({
      baseUrl: "https://photon.test",
      fetchFn: (async () => ({
        ok: true, status: 200, json: async () => { throw new Error("not json"); },
      })) as unknown as typeof fetch,
    });
    expect(await search("x")).toBeNull();
  });

  it("passes an abort signal, so a hanging upstream cannot pin the process", async () => {
    // This is the first outbound call on a request path in this service. A
    // hang here does not degrade search, it exhausts a host with limited
    // concurrency and takes trip creation down with it.
    const fetchFn = vi.fn(async () => ok({ features: [] }));
    const search = createPhotonSearch({
      baseUrl: "https://photon.test",
      fetchFn: fetchFn as unknown as typeof fetch,
      timeoutMs: 3000,
    });
    await search("x");
    const init = fetchFn.mock.calls[0]![1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("tolerates a base url with a trailing slash", async () => {
    const fetchFn = vi.fn(async () => ok({ features: [] }));
    const search = createPhotonSearch({
      baseUrl: "https://photon.test/",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    await search("x");
    expect(fetchFn.mock.calls[0]![0] as string).toContain("https://photon.test/api/?");
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd backend && npx vitest run src/geo/photon.test.ts`
Expected: FAIL — cannot resolve `./photon.ts`.

- [ ] **Step 3: Write the implementation**

Create `backend/src/geo/photon.ts`:

```ts
/**
 * The only place in this service that talks to Photon.
 *
 * It returns the raw body and leaves interpretation to `domain/geocode.ts`,
 * which keeps every surprising thing about the upstream's schema in one pure,
 * fixture-tested place and everything about the network in another.
 *
 * Nothing here can throw. This is the first outbound HTTP call on a request
 * path in this service, and the failure that matters is not a bad response but
 * a slow one: a hang on a host with limited concurrency does not degrade
 * search, it exhausts the process and takes trip creation with it. Hence the
 * abort signal, and hence null rather than an exception — a 502 arriving
 * mid-keystroke is worse than no suggestions, because the Create screen has a
 * perfectly good map-pin path either way.
 */

/** minLon,minLat,maxLon,maxLat. A constant: never the caller's own position. */
export const GHANA_BBOX = "-3.26,4.71,1.20,11.17";

const DEFAULT_TIMEOUT_MS = 3000;
const LIMIT = 8;

export interface PhotonDeps {
  baseUrl: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  userAgent?: string;
}

export function createPhotonSearch(
  deps: PhotonDeps
): (q: string) => Promise<unknown | null> {
  const doFetch = deps.fetchFn ?? globalThis.fetch;
  const base = deps.baseUrl.replace(/\/+$/, "");
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return async function search(q: string): Promise<unknown | null> {
    const url = new URL(`${base}/api/`);
    url.searchParams.set("q", q);
    url.searchParams.set("bbox", GHANA_BBOX);
    url.searchParams.set("lang", "en");
    url.searchParams.set("limit", String(LIMIT));

    try {
      const res = await doFetch(url.toString(), {
        headers: deps.userAgent === undefined ? {} : { "User-Agent": deps.userAgent },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      // Timeout, DNS, refused connection, unparseable body — all the same to
      // a caller that is going to answer an empty list regardless.
      return null;
    }
  };
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd backend && npx vitest run src/geo/photon.test.ts && npx tsc --noEmit`
Expected: 9 passing, typecheck clean.

- [ ] **Step 5: Commit**

```bash
cd backend
git add src/geo/photon.ts src/geo/photon.test.ts
git commit -m "feat: the one place that talks to Photon

Returns the raw body and leaves interpretation to domain/geocode.ts, so
everything surprising about the upstream's schema lives in one pure
fixture-tested place and everything about the network lives in another.

Nothing here throws, and the reason is not tidiness. This is the first
outbound HTTP call on a request path in this service, and the failure that
matters is a slow response rather than a bad one: a hang on a host with
limited concurrency does not degrade search, it exhausts the process and takes
trip creation down with it. So there is an abort signal, and every failure —
timeout, DNS, refusal, unparseable body — answers null, because a 502 arriving
mid-keystroke is worse than no suggestions when the screen has a map pin.

The bbox is a constant. A rider's own position is never sent: that is the leak
this product exists to avoid."
```

---

## Task 4: The endpoint

**Files:**
- Create: `backend/src/http/geocode.ts`, `backend/tests/api.geocode.test.ts`
- Modify: `backend/src/http/quotas.ts`, `backend/src/http/app.ts`, `backend/src/config.ts`, `backend/.env.example`, `backend/render.yaml`

**Interfaces:**
- Consumes: `Place`, `normalizeQuery`, `featuresToPlaces` (Task 1); `createLru` (Task 2); `createPhotonSearch`, `GHANA_BBOX` (Task 3).
- Produces:
  ```ts
  export interface GeocodeDeps {
    search: (q: string) => Promise<unknown | null>;
    cache?: Lru<Place[]>;
  }
  export function geocodeRoutes(deps: GeocodeDeps): Hono<{ Variables: AuthVars }>;
  ```

**Context you need:** routes are Hono sub-apps mounted in `src/http/app.ts`. Device auth is applied by the parent with `app.use("/v1/x/*", deviceAuth(pool))`, and rate limits with `app.post("/v1/x", rateLimit(limits, "quotaName", quotas.quotaName, byDevice("x")))`. `fail(c, status, code, detail?)` from `./errors.ts` renders `{error, detail?, serverNow}`. `ErrorCode` already includes `invalid` — no new code is needed.

- [ ] **Step 1: Add the quota**

In `backend/src/http/quotas.ts`, add to the `Quotas` interface, beside `alertReport`:

```ts
  /**
   * Destination searches, per device. Autocomplete is high-frequency by
   * nature, but most of the reduction happens in the client: it debounces and
   * refuses to search under three characters. This is the ceiling on a script.
   */
  geocode: Quota;
```

and to `DEFAULT_QUOTAS`:

```ts
  geocode: { limit: 60, windowMs: minutes(1) },
```

- [ ] **Step 2: Add the config**

In `backend/src/config.ts`, add to the `Config` interface:

```ts
  /**
   * The Photon instance to proxy. Defaults to the public one, which is a
   * courtesy service — pointing this at a self-hosted instance is the whole
   * migration.
   */
  photonUrl: string;
```

and to the object `loadConfig` returns:

```ts
    photonUrl: (process.env.PHOTON_URL ?? "").trim() || "https://photon.komoot.io",
```

Add to `backend/.env.example`:

```
# The Photon instance destination search proxies to. Defaults to the public
# one, which is a courtesy service with no SLA; set this to self-host.
# PHOTON_URL=https://photon.komoot.io
```

And in `backend/render.yaml`, add to the env var list, following the shape of the entries already there:

```yaml
      - key: PHOTON_URL
        sync: false
```

- [ ] **Step 3: Write the failing test**

Create `backend/tests/api.geocode.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { migrate } from "../src/db/migrate.ts";
import { testPool, closeTestPool, resetDb } from "./helpers/db.ts";
import { get, newDevice } from "./helpers/api.ts";
import { createApp } from "../src/http/app.ts";

const pool = () => testPool();

const collection = (features: unknown[]) => ({ type: "FeatureCollection", features });

const feature = (name: string, lon: number, lat: number, country = "Ghana", cc = "GH") => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [lon, lat] },
  properties: { name, osm_id: Math.round(lon * 1e6), osm_type: "N", country, countrycode: cc,
    state: "Greater Accra Region" },
});

describe("GET /v1/geocode", () => {
  beforeAll(async () => {
    await migrate(pool());
  });
  beforeEach(resetDb);
  afterAll(closeTestPool);

  it("refuses a caller with no device token", async () => {
    expect((await get("/v1/geocode?q=accra")).status).toBe(401);
  });

  it("answers places for a query", async () => {
    const { token } = await newDevice();
    let asked = 0;
    const app = createApp({
      pool: pool(),
      geocodeSearch: async (q: string) => {
        asked += 1;
        expect(q).toBe("accra mall");
        return collection([feature("Accra Mall", -0.1738, 5.6212)]);
      },
    });

    const res = await app.request("/v1/geocode?q=Accra%20Mall", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { places: unknown[]; serverNow: number };
    expect(body.places).toHaveLength(1);
    expect(body.places[0]).toMatchObject({
      label: "Accra Mall", lat: 5.6212, lng: -0.1738,
    });
    expect(typeof body.serverNow).toBe("number");
    // The query reaches the upstream normalised, which is what makes the cache
    // key mean anything.
    expect(asked).toBe(1);
  });

  it("serves a second identical query from the cache", async () => {
    const { token } = await newDevice();
    let asked = 0;
    const app = createApp({
      pool: pool(),
      geocodeSearch: async () => {
        asked += 1;
        return collection([feature("Circle", -0.2074, 5.5713)]);
      },
    });
    const h = { headers: { Authorization: `Bearer ${token}` } };

    await app.request("/v1/geocode?q=circle", h);
    await app.request("/v1/geocode?q=  CIRCLE  ", h);

    // Differing only in case and spacing is the same intent, and the whole
    // point of proxying is that it costs one upstream request, not two.
    expect(asked).toBe(1);
  });

  it("answers an empty list when the upstream fails, not an error", async () => {
    const { token } = await newDevice();
    const app = createApp({ pool: pool(), geocodeSearch: async () => null });

    const res = await app.request("/v1/geocode?q=anywhere", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    expect((await res.json() as { places: unknown[] }).places).toEqual([]);
  });

  it("refuses a query shorter than three characters without asking upstream", async () => {
    const { token } = await newDevice();
    let asked = 0;
    const app = createApp({
      pool: pool(),
      geocodeSearch: async () => { asked += 1; return collection([]); },
    });

    for (const q of ["", "a", "ab", "  ab  "]) {
      const res = await app.request(`/v1/geocode?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(400);
      expect((await res.json() as { error: string }).error).toBe("invalid");
    }
    expect(asked).toBe(0);
  });

  it("rate limits a device that searches too much", async () => {
    const { token } = await newDevice();
    const app = createApp({
      pool: pool(),
      quotas: { ...(await import("../src/http/quotas.ts")).DEFAULT_QUOTAS,
                geocode: { limit: 2, windowMs: 60_000 } },
      geocodeSearch: async () => collection([]),
    });
    const h = { headers: { Authorization: `Bearer ${token}` } };

    expect((await app.request("/v1/geocode?q=one", h)).status).toBe(200);
    expect((await app.request("/v1/geocode?q=two", h)).status).toBe(200);
    expect((await app.request("/v1/geocode?q=three", h)).status).toBe(429);
  });
});
```

- [ ] **Step 4: Run the test and watch it fail**

Run: `cd backend && npx vitest run tests/api.geocode.test.ts`
Expected: FAIL — `geocodeSearch` is not a known `AppDeps` key, and `/v1/geocode` is not mounted.

- [ ] **Step 5: Write the route**

Create `backend/src/http/geocode.ts`:

```ts
import { Hono } from "hono";
import type { AuthVars } from "./auth.ts";
import { fail } from "./errors.ts";
import { createLru, type Lru } from "../domain/lru.ts";
import { featuresToPlaces, normalizeQuery, type Place } from "../domain/geocode.ts";

/**
 * Destination search.
 *
 * A thin proxy, and the thinness is the point: the client gets our own small
 * `Place` shape rather than Photon's GeoJSON, so swapping the provider later
 * is a change here and nowhere else.
 *
 * The cache is what makes depending on a courtesy service defensible — it
 * turns N users typing "kotoka" into one upstream request. Without it the
 * proxy is pure overhead and we may as well have called Photon from the
 * browser.
 */

/** Below this, a query is noise: too many matches to rank and none to trust. */
const MIN_QUERY = 3;
const CACHE_MAX = 500;
const CACHE_TTL_MS = 60 * 60_000;

export interface GeocodeDeps {
  /** Returns the raw upstream body, or null on any failure. */
  search: (q: string) => Promise<unknown | null>;
  /** Injected in tests that need to observe or bypass it. */
  cache?: Lru<Place[]>;
}

export function geocodeRoutes(deps: GeocodeDeps): Hono<{ Variables: AuthVars }> {
  const r = new Hono<{ Variables: AuthVars }>();
  const cache =
    deps.cache ?? createLru<Place[]>({ max: CACHE_MAX, ttlMs: CACHE_TTL_MS });

  r.get("/", async (c) => {
    const q = normalizeQuery(c.req.query("q") ?? "");
    if (q.length < MIN_QUERY) {
      return fail(c, 400, "invalid", { q: `Use at least ${MIN_QUERY} characters.` });
    }

    const cached = cache.get(q);
    if (cached !== undefined) {
      return c.json({ places: cached, serverNow: Date.now() });
    }

    const body = await deps.search(q);
    // Upstream failure and upstream nonsense look the same from here, and both
    // answer an empty list: the screen still has its map pin.
    const places = body === null ? [] : featuresToPlaces(body);

    // A failure is not cached. The next keystroke should get a real attempt
    // rather than an hour of remembered silence.
    if (body !== null) cache.set(q, places);

    return c.json({ places, serverNow: Date.now() });
  });

  return r;
}
```

- [ ] **Step 6: Mount it**

In `backend/src/http/app.ts`, add to `AppDeps`:

```ts
  /**
   * Destination search's upstream. Defaults to Photon at `photonUrl`.
   * Overridden in tests, which must not reach the network.
   */
  geocodeSearch?: (q: string) => Promise<unknown | null>;
  /** Where the default `geocodeSearch` points. Ignored if one is supplied. */
  photonUrl?: string;
```

Add the imports:

```ts
import { geocodeRoutes } from "./geocode.ts";
import { createPhotonSearch } from "../geo/photon.ts";
```

Then, beside the other rider mounts (after the `/v1/auth` block and before `/v1/trips`), add:

```ts
  app.use("/v1/geocode", deviceAuth(pool));
  app.use("/v1/geocode/*", deviceAuth(pool));
  app.get(
    "/v1/geocode",
    rateLimit(limits, "geocode", quotas.geocode, byDevice("geocode"))
  );
  app.route(
    "/v1/geocode",
    geocodeRoutes({
      search:
        deps.geocodeSearch ??
        createPhotonSearch({
          baseUrl: deps.photonUrl ?? "https://photon.komoot.io",
          userAgent: "radar-api (+https://github.com/sadiquex/radar-api)",
        }),
    })
  );
```

And in `backend/src/server.ts`, pass the configured URL where `createApp` is called:

```ts
  photonUrl: config.photonUrl,
```

- [ ] **Step 7: Run the tests and watch them pass**

Run: `cd backend && npx vitest run tests/api.geocode.test.ts && npm test && npx tsc --noEmit`
Expected: 6 passing in the new file; the whole backend suite at 536 + 31 = **567** (11 from Task 1, 5 from Task 2, 9 from Task 3, 6 here); typecheck clean.

- [ ] **Step 8: Commit**

```bash
cd backend
git add src/http/geocode.ts src/http/quotas.ts src/http/app.ts src/server.ts \
        src/config.ts .env.example render.yaml tests/api.geocode.test.ts
git commit -m "feat: GET /v1/geocode, so a destination can be searched for

A thin proxy, and the thinness is deliberate: the client gets our own small
Place shape rather than Photon's GeoJSON, so changing provider later is a
change in this service and nowhere else.

The cache is what makes depending on a courtesy service defensible. It turns N
users typing 'kotoka' into one upstream request; without it the proxy is pure
overhead and we may as well have called Photon from the browser. A failure is
deliberately not cached — the next keystroke deserves a real attempt rather
than an hour of remembered silence.

Device-authenticated like every other rider route, so this is not an open
proxy for the internet. Three characters minimum, checked before anything
leaves the process. And upstream failure answers an empty list rather than an
error, because a 502 mid-keystroke is worse than no suggestions on a screen
that still has a working map pin."
```

---

## Task 5: The client

**Files:**
- Create: `frontend/lib/data/geocode.ts`, `frontend/lib/data/__tests__/geocode.test.ts`
- Modify: `frontend/lib/data/index.ts`

**Interfaces:**
- Consumes: the endpoint from Task 4.
- Produces:
  ```ts
  export interface Place { id: string; label: string; detail: string | null; lat: number; lng: number }
  export interface GeocodeClient { search(q: string): Promise<Place[]> }
  export interface GeocodeDeps {
    baseUrl: string;
    session: { get: () => Promise<Session> };
    fetchFn?: typeof fetch;
  }
  export function createGeocodeClient(deps: GeocodeDeps): GeocodeClient;
  export const offlineGeocode: GeocodeClient;
  ```

**Context you need:** `lib/data/account.ts` is the exact pattern to follow — an interface, a `Deps` shape with an injected session, a `createXClient(deps)`, and an `offlineX` constant for when no API is configured. `lib/data/index.ts` wires those into `createApiClient` and an offline branch and re-exports module-level singletons. **This is deliberately not part of `DataClient`**: every method there is trip data and `localAsync.ts` genuinely satisfies it as the reference implementation the conformance suite checks the API against, and a localStorage store cannot search a global place index.

- [ ] **Step 1: Write the failing test**

Create `frontend/lib/data/__tests__/geocode.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { createGeocodeClient, offlineGeocode } from "../geocode";

const session = { get: async () => ({ deviceId: "d1", token: "tok-1" }) } as never;

const reply = (status: number, body: unknown): Response =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

const PLACE = {
  id: "N1", label: "Accra Mall", detail: "Cantonments · Greater Accra Region · Ghana",
  lat: 5.6212, lng: -0.1738,
};

describe("createGeocodeClient", () => {
  it("sends the query and the device token", async () => {
    const fetchFn = vi.fn(async () => reply(200, { places: [PLACE], serverNow: 1 }));
    const client = createGeocodeClient({
      baseUrl: "http://api.test", session, fetchFn: fetchFn as unknown as typeof fetch,
    });

    expect(await client.search("accra mall")).toEqual([PLACE]);

    const [url, init] = fetchFn.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe("http://api.test/v1/geocode?q=accra+mall");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer tok-1");
  });

  it("answers an empty list on a refusal rather than throwing", async () => {
    // Nothing about a failed search should be able to break the Create screen.
    for (const status of [400, 401, 429, 500]) {
      const client = createGeocodeClient({
        baseUrl: "http://api.test", session,
        fetchFn: (async () => reply(status, { error: "invalid" })) as unknown as typeof fetch,
      });
      expect(await client.search("x")).toEqual([]);
    }
  });

  it("answers an empty list when the network throws", async () => {
    const client = createGeocodeClient({
      baseUrl: "http://api.test", session,
      fetchFn: (async () => { throw new TypeError("offline"); }) as unknown as typeof fetch,
    });
    expect(await client.search("accra")).toEqual([]);
  });

  it("answers an empty list when the body is not the shape we expect", async () => {
    const client = createGeocodeClient({
      baseUrl: "http://api.test", session,
      fetchFn: (async () => reply(200, { nope: true })) as unknown as typeof fetch,
    });
    expect(await client.search("accra")).toEqual([]);
  });
});

describe("offlineGeocode", () => {
  it("finds nothing, because there is nowhere to look", async () => {
    expect(await offlineGeocode.search("accra")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd frontend && npx vitest run lib/data/__tests__/geocode.test.ts`
Expected: FAIL — cannot resolve `../geocode`.

- [ ] **Step 3: Write the implementation**

Create `frontend/lib/data/geocode.ts`:

```ts
import type { Session } from "../session";

/**
 * Searching for a destination.
 *
 * Deliberately not part of `DataClient`. Every method there is trip data, and
 * that interface earns its keep because `localAsync.ts` genuinely satisfies it
 * as the reference implementation the conformance suite checks the API
 * against. A localStorage store cannot search a global place index; putting
 * `search` there would force it to invent results and add a conformance case
 * nothing could honestly meet.
 *
 * So this follows `account.ts` instead: its own small client, wired alongside
 * in `index.ts`, with an offline constant for when no API is configured.
 *
 * Nothing here throws. A search that fails leaves the Create screen exactly as
 * it was before this feature existed — type a name, drop a pin.
 */

export interface Place {
  id: string;
  label: string;
  detail: string | null;
  lat: number;
  lng: number;
}

export interface GeocodeClient {
  /** Matching places, best first. Empty on any failure. Never throws. */
  search(q: string): Promise<Place[]>;
}

export interface GeocodeDeps {
  baseUrl: string;
  session: { get: () => Promise<Session> };
  fetchFn?: typeof fetch;
}

function asPlaces(body: unknown): Place[] {
  const places = (body as { places?: unknown } | null)?.places;
  if (!Array.isArray(places)) return [];
  return places.filter((p): p is Place => {
    const c = p as Partial<Place> | null;
    return (
      typeof c?.id === "string" &&
      typeof c.label === "string" &&
      typeof c.lat === "number" &&
      typeof c.lng === "number"
    );
  });
}

export function createGeocodeClient(deps: GeocodeDeps): GeocodeClient {
  const doFetch = deps.fetchFn ?? globalThis.fetch;

  return {
    async search(q: string): Promise<Place[]> {
      try {
        const { token } = await deps.session.get();
        const url = `${deps.baseUrl}/v1/geocode?${new URLSearchParams({ q })}`;
        const res = await doFetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return [];
        return asPlaces(await res.json());
      } catch {
        return [];
      }
    },
  };
}

/** With no API configured there is nowhere to search. */
export const offlineGeocode: GeocodeClient = {
  async search() {
    return [];
  },
};
```

- [ ] **Step 4: Wire it in**

In `frontend/lib/data/index.ts`:

Add the imports beside the account ones:

```ts
import { createGeocodeClient, offlineGeocode } from "./geocode";
import type { GeocodeClient } from "./geocode";
```

Add `geocode: GeocodeClient;` to **both** return-type annotations — the one on `createApiClient` and the offline one below it. Add to the object `createApiClient` returns, beside `account`:

```ts
    geocode: createGeocodeClient({ baseUrl, session }),
```

Add to the offline object, beside `account: offlineAccount`:

```ts
    geocode: offlineGeocode,
```

And export the singleton beside `account`:

```ts
/** Destination search. Finds nothing when running offline. */
export const geocode = active.geocode;
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `cd frontend && npx vitest run lib/data/__tests__/geocode.test.ts && npm test && npx tsc --noEmit && npm run lint`
Expected: 5 passing in the new file; suite at 326 + 5 = **331**; typecheck and lint clean. **Do not run `npm run build`** if a dev server is up.

- [ ] **Step 6: Commit**

```bash
cd frontend
git add lib/data/geocode.ts lib/data/__tests__/geocode.test.ts lib/data/index.ts
git commit -m "feat: a client for destination search

Follows account.ts rather than joining DataClient, and the distinction
matters. Every method on DataClient is trip data, and that interface earns its
keep because localAsync genuinely satisfies it as the reference implementation
the conformance suite checks the API against. A localStorage store cannot
search a global place index — putting search there would force it to invent
results and add a conformance case nothing could honestly meet.

Nothing here throws. Every failure answers an empty list, so a search that
cannot reach the API leaves the Create screen exactly as it was before this
feature existed: type a name, drop a pin."
```

---

## Task 6: Debounce and the minimum-length rule

**Files:**
- Create: `frontend/lib/search.ts`, `frontend/lib/__tests__/search.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export const MIN_QUERY = 3;
  export const DEBOUNCE_MS = 250;
  export function shouldSearch(raw: string): boolean;
  export function createDebouncer(delayMs: number, timers?: {
    set: (fn: () => void, ms: number) => number; clear: (id: number) => void;
  }): { run(fn: () => void): void; cancel(): void };
  ```

**Why this is a separate module:** the frontend's vitest runs in `node` with `include: ["**/*.test.ts"]`. There is no DOM and a `.test.tsx` is silently not collected, so logic that lives inside a component cannot be tested at all. This repo's rule is that logic worth testing gets extracted — so the two rules that decide whether and when a request happens live here, and the component only wires them.

- [ ] **Step 1: Write the failing test**

Create `frontend/lib/__tests__/search.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { shouldSearch, createDebouncer, MIN_QUERY, DEBOUNCE_MS } from "../search";

describe("shouldSearch", () => {
  it("needs at least three characters after trimming", () => {
    expect(MIN_QUERY).toBe(3);
    expect(shouldSearch("")).toBe(false);
    expect(shouldSearch("a")).toBe(false);
    expect(shouldSearch("ab")).toBe(false);
    expect(shouldSearch("   ab   ")).toBe(false);
    expect(shouldSearch("abc")).toBe(true);
    expect(shouldSearch("  accra  ")).toBe(true);
  });

  it("agrees with the server, which refuses under three too", () => {
    // The client rule exists to save a round trip, not to disagree.
    expect(shouldSearch("ab")).toBe(false);
  });
});

describe("createDebouncer", () => {
  const fakeTimers = () => {
    let next = 1;
    const pending = new Map<number, () => void>();
    return {
      set: (fn: () => void, _ms: number) => {
        const id = next++;
        pending.set(id, fn);
        return id;
      },
      clear: (id: number) => void pending.delete(id),
      flush: () => {
        for (const fn of [...pending.values()]) fn();
        pending.clear();
      },
      get pendingCount() {
        return pending.size;
      },
    };
  };

  it("runs the last call and not the ones it superseded", () => {
    // Typing "accra" must not produce five requests.
    const timers = fakeTimers();
    const d = createDebouncer(DEBOUNCE_MS, timers);
    const calls: string[] = [];

    d.run(() => calls.push("a"));
    d.run(() => calls.push("ac"));
    d.run(() => calls.push("acc"));
    expect(timers.pendingCount).toBe(1);

    timers.flush();
    expect(calls).toEqual(["acc"]);
  });

  it("cancels a pending call, so an unmount cannot fire into a dead component", () => {
    const timers = fakeTimers();
    const d = createDebouncer(DEBOUNCE_MS, timers);
    const fn = vi.fn();

    d.run(fn);
    d.cancel();
    timers.flush();
    expect(fn).not.toHaveBeenCalled();
  });

  it("defaults to a quarter of a second, which is a keystroke apart", () => {
    expect(DEBOUNCE_MS).toBe(250);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `cd frontend && npx vitest run lib/__tests__/search.test.ts`
Expected: FAIL — cannot resolve `../search`.

- [ ] **Step 3: Write the implementation**

Create `frontend/lib/search.ts`:

```ts
/**
 * The two rules that decide whether and when a destination search happens.
 *
 * They live here rather than inside the component because this repo's vitest
 * runs in `node` with no DOM and silently does not collect `.test.tsx`, so
 * logic inside a component is logic with no test. Extracting it is the house
 * rule, and these two rules are worth the file: one of them is the difference
 * between five requests per word and one.
 */

/** Below three characters there is nothing to rank. The server agrees. */
export const MIN_QUERY = 3;

/** About a keystroke apart. Long enough to coalesce a word, short enough to feel live. */
export const DEBOUNCE_MS = 250;

export function shouldSearch(raw: string): boolean {
  return raw.trim().length >= MIN_QUERY;
}

export interface Timers {
  set: (fn: () => void, ms: number) => number;
  clear: (id: number) => void;
}

/**
 * Runs the most recent call and drops the ones it superseded.
 *
 * Timers are injectable because the alternative is faking them globally, and
 * this repo prefers a seam to a mocked clock.
 */
export function createDebouncer(
  delayMs: number,
  timers?: Timers
): { run(fn: () => void): void; cancel(): void } {
  const t: Timers =
    timers ?? {
      set: (fn, ms) => setTimeout(fn, ms) as unknown as number,
      clear: (id) => clearTimeout(id),
    };
  let pending: number | null = null;

  return {
    run(fn) {
      if (pending !== null) t.clear(pending);
      pending = t.set(() => {
        pending = null;
        fn();
      }, delayMs);
    },
    cancel() {
      if (pending !== null) t.clear(pending);
      pending = null;
    },
  };
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cd frontend && npx vitest run lib/__tests__/search.test.ts && npm test && npx tsc --noEmit`
Expected: 5 passing in the new file; suite at **336**; typecheck clean.

- [ ] **Step 5: Commit**

```bash
cd frontend
git add lib/search.ts lib/__tests__/search.test.ts
git commit -m "feat: the two rules that decide when a search happens

Extracted rather than left in the component, because this repo's vitest runs
in node with no DOM and silently does not collect .test.tsx — logic inside a
component is logic with no test, and the house rule is to pull it out.

Both rules earn the file. Three characters minimum matches what the server
already enforces, so the client rule saves a round trip rather than
disagreeing. And the debouncer is the difference between five requests per
word and one; its timers are injected because this repo prefers a seam to a
globally mocked clock."
```

---

## Task 7: Make the regression guards discover their own inputs

**Files:**
- Modify: `frontend/lib/__tests__/tokens.test.ts:110-133`

**Do this BEFORE Task 8.** The point is that the guard covers `DestinationSearch.tsx` the moment it lands, rather than after someone remembers.

**The problem.** `tokens.test.ts` has two guards over the component sources:

```ts
const SCREENS = ["Radar.tsx", "PhoneFrame.tsx", "JoinFlow.tsx"];
it.each(SCREENS)("has no type below 12px in %s", ...)
it("keeps text inputs at 16px or above, ...", () => {
  const src = readFileSync(join(root, "app", "components", "Radar.tsx"), "utf8");
  ...
});
```

A hardcoded list, and an input check that reads one file. A new component joins neither, so it could ship a 14px input, iOS would zoom the viewport on focus, and the suite would stay green.

**This repo has already been bitten by this exact shape.** The backend's `resetDb` kept a hand-written table list and silently stopped truncating `users` when that table was added, which is why it now discovers tables from `information_schema`. Do the same here.

- [ ] **Step 1: Write the failing test**

Add to `frontend/lib/__tests__/tokens.test.ts`, inside the `describe("type scale floor", ...)` block:

```ts
  it("guards every component, so a new screen cannot slip past the floor", () => {
    // A hardcoded list is how a guard rots: the backend's resetDb kept one and
    // quietly stopped truncating `users`, which is why it reads
    // information_schema now. Discover the directory instead.
    const discovered = readdirSync(join(root, "app", "components"))
      .filter((f) => f.endsWith(".tsx"))
      .sort();
    expect(discovered.length).toBeGreaterThanOrEqual(5);
    expect(SCREENS).toEqual(discovered);
  });
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npx vitest run lib/__tests__/tokens.test.ts`
Expected: FAIL — `SCREENS` is the three hardcoded names; the directory holds `GoogleSignInButton.tsx`, `JoinFlow.tsx`, `LiveMap.tsx`, `PhoneFrame.tsx`, `Radar.tsx`.

- [ ] **Step 3: Make both guards discover the directory**

In `frontend/lib/__tests__/tokens.test.ts`, add `readdirSync` to the `node:fs` import, then replace the hardcoded list:

```ts
  // Every component, discovered rather than listed. A literal list is how this
  // kind of guard rots — see the comment in the test below.
  const SCREENS = readdirSync(join(root, "app", "components"))
    .filter((f) => f.endsWith(".tsx"))
    .sort();
```

And widen the input guard from one file to all of them:

```ts
  it.each(SCREENS)("keeps text inputs in %s at 16px or above, or iOS zooms on focus", (file) => {
    const src = readFileSync(join(root, "app", "components", file), "utf8");
    const inputs = src.match(/<input[\s\S]{0,900}?\/>/g) ?? [];
    for (const input of inputs) {
      const size = input.match(/fontSize:\s*(\d+)/);
      expect(size, `an <input> in ${file} has no explicit fontSize:\n${input}`).not.toBeNull();
      expect(Number(size![1])).toBeGreaterThanOrEqual(16);
    }
  });
```

Note the original asserted `inputs.length > 0`, which made sense for a file known to contain inputs. Across every component that assertion is wrong — most have none — so it goes. The new discovery test is what guarantees the guard is looking at something.

- [ ] **Step 4: Run and watch them pass**

Run: `cd frontend && npx vitest run lib/__tests__/tokens.test.ts && npm test && npx tsc --noEmit`
Expected: all passing. The type-scale guard now runs once per component; the input guard likewise.

**If a pre-existing component fails the type floor**, stop and report it rather than raising the floor or re-adding a list — you have found a real bug the hardcoded list was hiding, which is the whole point of this task.

- [ ] **Step 5: Commit**

```bash
cd frontend
git add lib/__tests__/tokens.test.ts
git commit -m "test: let the token guards find their own inputs

The type-scale guard read a hardcoded [Radar, PhoneFrame, JoinFlow] and the
input-size guard read Radar.tsx alone, so a new component joined neither. It
could have shipped a 14px input, iOS would have zoomed the viewport on focus,
and the suite would have stayed green.

This repo has met this bug before. The backend's resetDb kept a hand-written
table list and silently stopped truncating users when that table arrived,
which is why it discovers tables from information_schema now. Same fix: read
the directory, and a test asserts the list really is the directory so it
cannot quietly regress to a literal."
```

---

## Task 8: The combobox

**Files:**
- Create: `frontend/app/components/DestinationSearch.tsx`
- Modify: `frontend/app/components/Radar.tsx:705-714` (the `<Field label="DESTINATION">` block)

**Interfaces:**
- Consumes: `geocode` from `@/lib/data` (Task 5); `shouldSearch`, `createDebouncer`, `DEBOUNCE_MS` (Task 6); `Place` from `@/lib/data/geocode`.
- Produces: `export function DestinationSearch(props: DestinationSearchProps)`.

**No unit test, and that is not an oversight.** Vitest here is `environment: "node"` with `include: ["**/*.test.ts"]`: no DOM, and a `.test.tsx` is silently not collected. Do not add jsdom or a testing library. The logic worth testing was extracted in Task 6; this task is verified by `tsc`, `lint`, the Task 7 guards, and the browser walkthrough in Task 9.

**The code you are replacing**, currently at roughly `Radar.tsx:705-714`:

```tsx
        <Field label="DESTINATION">
          <MapPin size={20} style={{ color: C.muted }} />
          <input
            value={dest}
            onChange={(e) => setDest(e.target.value)}
            placeholder="Where to?"
            className="flex-1 bg-transparent outline-none"
            /* 16px minimum: anything smaller and iOS Safari zooms on focus. */
            style={{ color: C.text, fontFamily: FONT.body, fontSize: 16 }}
          />
        </Field>
```

- [ ] **Step 1: Write the component**

Create `frontend/app/components/DestinationSearch.tsx`:

```tsx
"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { MapPin, Loader2 } from "lucide-react";
import { geocode } from "@/lib/data";
import type { Place } from "@/lib/data/geocode";
import { createDebouncer, shouldSearch, DEBOUNCE_MS } from "@/lib/search";
import { C, FONT } from "./Radar";

/**
 * Destination search.
 *
 * Choosing a suggestion sets the name and the coordinates together, which is
 * the whole point: before this the Create screen let you name one place and
 * pin another and recorded both without complaint.
 *
 * Everything here degrades to nothing. A search that fails, a rate limit, an
 * API that is asleep — all of them leave the screen exactly as it was, with a
 * text field and a map pin, because that path still works and is untouched.
 */

export interface DestinationSearchProps {
  /** The text in the field. Owned by the parent, which submits it. */
  value: string;
  onChange: (next: string) => void;
  /** Called when a suggestion is chosen: set the name and the pin together. */
  onSelect: (place: Place) => void;
}

export function DestinationSearch({ value, onChange, onSelect }: DestinationSearchProps) {
  const [places, setPlaces] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const debouncer = useMemo(() => createDebouncer(DEBOUNCE_MS), []);
  // Guards against a slow response for "acc" landing after a fast one for
  // "accra" and overwriting it.
  const seq = useRef(0);

  useEffect(() => () => debouncer.cancel(), [debouncer]);

  const search = (raw: string) => {
    if (!shouldSearch(raw)) {
      debouncer.cancel();
      setPlaces([]);
      setOpen(false);
      setBusy(false);
      return;
    }
    setBusy(true);
    debouncer.run(() => {
      const mine = ++seq.current;
      void geocode.search(raw.trim()).then((found) => {
        if (mine !== seq.current) return;
        setPlaces(found);
        setActive(-1);
        setOpen(true);
        setBusy(false);
      });
    });
  };

  const choose = (place: Place) => {
    onChange(place.label);
    onSelect(place);
    setOpen(false);
    setPlaces([]);
    setActive(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || places.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % places.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? places.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      choose(places[active]!);
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <div
        className="flex items-center gap-3 rounded-2xl"
        style={{ background: C.raised, border: `1px solid ${C.line}`, padding: "0 14px", minHeight: 56 }}
      >
        <MapPin size={20} style={{ color: C.muted }} />
        <input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            search(e.target.value);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          placeholder="Where to?"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          className="flex-1 bg-transparent outline-none"
          /* 16px minimum: anything smaller and iOS Safari zooms on focus. */
          style={{ color: C.text, fontFamily: FONT.body, fontSize: 16 }}
        />
        {busy && <Loader2 size={16} className="animate-spin" style={{ color: C.muted }} />}
      </div>

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="rounded-2xl overflow-y-auto"
          style={{
            position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 20,
            background: C.raised, border: `1px solid ${C.lineStrong}`,
            maxHeight: 260, listStyle: "none", margin: 0, padding: 4,
          }}
        >
          {places.length === 0 && (
            <li
              style={{ fontFamily: FONT.body, fontSize: 14, color: C.muted, padding: "12px 12px" }}
            >
              No matches
            </li>
          )}
          {places.map((p, i) => (
            <li
              key={p.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(p)}
              onMouseEnter={() => setActive(i)}
              className="rounded-xl"
              style={{
                padding: "10px 12px", minHeight: 44, cursor: "pointer",
                background: i === active ? C.ground : "transparent",
              }}
            >
              <div style={{ fontFamily: FONT.body, fontSize: 15, color: C.text }}>{p.label}</div>
              {p.detail !== null && (
                <div style={{ fontFamily: FONT.body, fontSize: 13, color: C.muted, marginTop: 2 }}>
                  {p.detail}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

**On the styling:** inline `style={{...}}` referencing `C` and `FONT`, per this repo's rule — Tailwind here only carries layout utilities and the font vars. `C.x` is the string `var(--c-x)`, so no colour arithmetic; the highlight uses the declared `C.ground` token. If `C.lineStrong` does not exist in this repo's token set, use `C.line` — check `Radar.tsx`'s `C` before assuming.

- [ ] **Step 2: Use it in the Create screen**

In `frontend/app/components/Radar.tsx`, add the import at the top of the file:

```ts
import { DestinationSearch } from "./DestinationSearch";
import type { Place } from "@/lib/data/geocode";
```

Replace the `<Field label="DESTINATION">` block shown above with:

```tsx
        <div style={{ marginBottom: 4 }}>
          <div className="label" style={{ marginBottom: 6 }}>DESTINATION</div>
          <DestinationSearch
            value={dest}
            onChange={setDest}
            onSelect={(place: Place) => setPin({ lat: place.lat, lng: place.lng })}
          />
        </div>
```

**Match the existing label markup.** `Field` renders its label some particular way; read `Field` in `Radar.tsx` and reproduce it rather than inventing `className="label"` if that is not what it uses.

**Do not change the "tap to adjust" button or the `LiveMap` block below it.** Moving the pin afterwards must keep the name: someone who searched "Kotoka Airport" meant it and is correcting where it is, not changing their mind.

- [ ] **Step 3: Verify**

Run: `cd frontend && npm test && npx tsc --noEmit && npm run lint`
Expected: typecheck clean, lint clean, everything passing.

**Do not expect a fixed test count here.** Task 7 deliberately made both token guards
`it.each` over the discovered component directory, so adding a component *raises* the count by
two — one type-scale case and one input case for `DestinationSearch.tsx`. That is the guard
working: if its input were under 16px or it carried type below 12px, those two new cases are
where it fails. A plan that pinned an exact number here would be asserting the guard does not
do its job.

**Do not run `npm run build`** while a dev server is running.

- [ ] **Step 4: Commit**

```bash
cd frontend
git add app/components/DestinationSearch.tsx app/components/Radar.tsx
git commit -m "feat: search for a destination instead of guessing at a pin

The Create screen has had a 'Where to?' field and a tap-to-pin map that knew
nothing about each other since it was built: you could name one place, pin
another, and the trip recorded both without complaint. Choosing a suggestion
now sets the name and the coordinates together.

A real combobox — arrow keys, Enter, Escape, aria-activedescendant — because a
list reachable only by tapping is unusable by keyboard, and this repo already
runs regression guards over contrast and tap targets whose spirit applies here.

Moving the pin afterwards deliberately does not clear the name. Somebody who
searched Kotoka Airport meant Kotoka Airport; they are correcting exactly where
it is, not changing their mind about where they are going.

Everything degrades to nothing. A failed search, a rate limit, an API asleep on
a cold start — all leave the screen as it was, with a text field and a map pin."
```

---

## Task 9: Documentation and the walkthrough

**Files:**
- Modify: `backend/README.md`, `frontend/README.md`, `frontend/CLAUDE.md`

- [ ] **Step 1: Document the endpoint**

In `backend/README.md`, add `GET /v1/geocode?q=` to the endpoint table with auth "device bearer token", and a short subsection covering: that it proxies Photon at `PHOTON_URL`; that the public instance is a courtesy service and self-hosting is one env var; that the response is our own `Place` shape rather than Photon's GeoJSON so the provider can change; that results are cached by normalised query for an hour and a failure is not cached; that upstream failure answers an empty list rather than an error; and that the bias is a fixed Ghana bbox and never the caller's position. Add `geocode` to the rate-limit prose.

- [ ] **Step 2: Document the feature**

In `frontend/README.md`, note that the Create screen's destination field searches, that choosing a suggestion sets both the name and the pin, that moving the pin afterwards keeps the name, and that with no API configured search finds nothing and the map pin is the only path.

In `frontend/CLAUDE.md`, correct the two lines this feature makes untrue: the Map bullet says *"There is no geocoding; destination coordinates come from the picker only"* — it now also comes from search. And add a line to the testing-constraints section noting that the token guards discover the component directory, so a new component is covered automatically and a new one that fails the type floor fails there.

- [ ] **Step 3: Walk it in a browser**

Start the API and the rider app — **not** `npm run dev` in the backend, which is broken:

```bash
docker start caravan-pg
cd backend && npx tsx --env-file=.env src/server.ts        # :8787
cd frontend && NEXT_PUBLIC_API_URL=http://localhost:8787 npm run dev   # :3000
```

Confirm each, and **report what you actually observed, including anything that did not work**:

1. Type "acc" — nothing happens under three characters; at three, a spinner then a list.
2. Type "accra mall" — one "Accra Mall" row, not three. This is the dedupe working.
3. Each row shows a locality line beneath the name, and rows with the same name differ by it.
4. Type "kotoka" — Ghanaian results rank above the Côte d'Ivoire village, and the village is still present further down.
5. Tap a suggestion — the field fills with its name and the map pin moves to it.
6. Open the map and drag the pin — **the name stays**.
7. Create the trip; confirm the group view shows the destination name and the arrival status works.
8. Arrow keys move the highlight, Enter chooses, Escape closes.
9. Stop the API and type — "No matches", no error state, and the map pin still works.
10. With `NEXT_PUBLIC_API_URL` unset, the screen behaves exactly as it did before this feature.

- [ ] **Step 4: Final verification**

Run, and paste the real output rather than asserting success:

```bash
cd backend && npx tsc --noEmit && npm test
cd frontend && npx tsc --noEmit && npm test && npm run lint && npm run build
```

`npm run build` is safe here **only if no dev server is running** — stop it first.

Expected: backend **567** passing. Frontend: everything passing with typecheck, lint and
build clean — the exact count is a function of the component directory after Task 7, so read
it rather than checking it against a number written here.

- [ ] **Step 5: Commit**

```bash
cd backend && git add README.md && git commit -m "docs: the geocode endpoint and what it proxies"
cd frontend && git add README.md CLAUDE.md && git commit -m "docs: the destination field searches now

CLAUDE.md said there is no geocoding and coordinates come from the picker
only, which was true for as long as it took to write this feature."
```

---

## Notes for the executor

- **Two repos.** `backend/` and `frontend/` are separate git repositories. Never stage across both in one commit. Tasks 1–4 are backend, 5–8 frontend, 9 both.
- **Task 7 must precede Task 8.** Fixing the guard first is what makes it cover the new component on arrival rather than whenever somebody remembers.
- **`npm run dev` in the backend does not work.** Its scripts run `tsx` with nothing loading `.env`. Use `npx tsx --env-file=.env src/server.ts`. Vitest loads `.env` itself, which is why the backend suite passes while its documented dev command cannot.
- **Never `npm run build` while a dev server is up**, and never run two dev servers for one repo. Both have bitten this project.
- **A `.test.tsx` file is silently not collected** by the frontend's vitest. If a task seems to want a component test, it is the wrong task — extract the logic instead.
- **When a step's expectation and reality disagree, stop and say so.** Do not adjust an assertion to match what the code or the upstream happens to do. Three defects in this project's last feature were caught exactly because an implementer pushed back rather than complying — and one of them was a test that could not fail.
- **The Photon fixture is recorded reality.** If a mapping test fails, suspect the mapping, not the fixture. If the live upstream disagrees with the fixture, that is a finding worth reporting: it means Photon's schema moved.
