# Destination search — Design

*8 Sep 2026. Phase F, finally.*

## 1. What this is

On the Create screen you can type a destination name and you can drop a pin on a map, and
**the two have nothing to do with each other**. `Radar.tsx` holds `dest` as free text from a
"Where to?" input and `pin` as `{lat, lng}` from tapping `LiveMap`; on submit both are sent
independently. Type "Kotoka Airport", drop a pin in the wrong suburb, and the trip cheerfully
records both.

This connects them: you type, suggestions appear, you tap one, and it sets the name *and* the
coordinates.

**Non-goals.** No turn-by-turn, no saved or recent destinations, no reverse geocoding of a
dropped pin into a name, no address autocomplete for anything other than the trip destination.
The map-pin path stays exactly as it is for places with no name.

## 2. Decisions taken before designing

- **Provider: Photon** (`photon.komoot.io`), the OSM-backed geocoder. Keyless, no billing, and
  unlike Nominatim its usage policy permits typeahead — Nominatim's explicitly forbids it, which
  rules out the otherwise-obvious choice.
- **Hosting: the public instance for now**, reached through our own proxy with the base URL in an
  environment variable, so moving to a self-hosted Photon is a config change rather than a
  rewrite. Self-hosting needs a persistent server with several GB of disk for even a Ghana
  extract, which does not fit the current free-tier shape.
- **Bias: a fixed Ghana bounding box, never the rider's own position.** Sending a user's coarse
  location to a third party on every keystroke is the exact shape of leak this product's privacy
  section argues against. komoot sees a query string and a constant that is identical for every
  user.

## 3. What the wire actually returns

Verified against `photon.komoot.io` on 8 Sep 2026, not read off documentation. Three findings
changed this design.

**Coordinates are `[lon, lat]`.** GeoJSON order, longitude first. The mapping must not assume
otherwise, and the test for it must use a real recorded response.

**There is no fixed property set.** Across three results for one query: the first had `county`
and `state` and no `city`; the second had `district`, `street`, `postcode` and an `extent`; the
third had `city` and `locality`. Only `name`, `country`, `countrycode`, `osm_id`, `osm_key`,
`osm_type`, `osm_value` and `type` appeared on all of them. A detail line therefore has to be
*composed* from whatever is present, with fallbacks — not read from fixed fields.

**The bounding box is a bias, not a filter.** With a Ghana bbox, the query `kotoka` still returns
a village in Côte d'Ivoire as its top result. This is the single most surprising finding and it
means ranking cannot be left to the upstream.

**Photon returns one place as several features.** The query `accra mall` comes back as three
entries all named "Accra Mall" in the same district — separate OSM node and way objects for the
same thing. Shown raw, the suggestion list looks broken.

Quality is otherwise good for this market: `circle` finds Kwame Nkrumah Circle, `airport` finds
the Airport Residential Area, `kumasi` finds Kumasi.

## 4. The endpoint

```
GET /v1/geocode?q=<query>        device bearer token required
  -> { places: Place[], serverNow: number }
```

```ts
export interface Place {
  /** Stable within a response, for React keys and selection. Derived from osm_type + osm_id. */
  id: string;
  /** What the row reads as. Photon's `name`. */
  label: string;
  /** Where it is, composed per §5. Null when nothing useful is available. */
  detail: string | null;
  lat: number;
  lng: number;
}
```

Authenticated with the device token like every other rider route, so this is not an open proxy
for the internet to use. It returns our own trimmed shape rather than Photon's
`FeatureCollection`: passing that through would couple every screen to Photon's schema and make
the "swap the provider later" decision in §2 a promise we could not keep.

`serverNow` is present because every response on this API carries it.

**On the client this is not part of `DataClient`, deliberately.** Every method on that interface
is trip data — create, get, join, write a position, leave, end, subscribe — and its value comes
from `localAsync.ts` genuinely satisfying it as "the reference implementation the API is checked
against", with a conformance suite run against both. A localStorage store cannot meaningfully
search a global place index; adding `searchPlaces` there would force it to return canned results
and put a method in the conformance suite that nothing can honestly conform to.

So geocoding gets its own module, following the same dependency-injection shape as
`createHttpData`:

```ts
// lib/geocode.ts
export interface GeocodeDeps {
  baseUrl: string;
  /** The same slice http.ts already exports — this needs the device token, nothing more. */
  session: SessionLike;
  fetchFn?: typeof fetch;
}
export function createGeocoder(deps: GeocodeDeps): (q: string) => Promise<Place[]>;
```

It reuses the session store rather than re-implementing token handling, and leaves `DataClient`
and its conformance suite untouched.

## 5. Turning features into places

Four rules, each answering a finding from §3.

**Coordinates.** `lat = coordinates[1]`, `lng = coordinates[0]`. Features whose geometry is not a
`Point`, or whose coordinates are not two finite numbers, are dropped rather than coerced.

**The detail line.** `[city || district || county, state, country]`, dropping absent parts and
joining with " · ". For the three §3 examples this yields "Aboisso · Comoé · Côte d'Ivoire",
"Cantonments · Greater Accra Region · Ghana" and "Noyem · Eastern Region · Ghana" — which is what
distinguishes three same-named results from each other. `null` when every part is missing.

**Ghana ranks first, and nothing is dropped for being foreign.** Results with
`countrycode === "GH"` sort above the rest, preserving upstream order within each group. A
straight country filter would be simpler but wrong: a convoy driving to Lomé or Abidjan is a
real use of this product, and silently hiding the destination would be worse than ranking it
second.

**Duplicates collapse.** Two features are the same place if they share a `label` and their
coordinates round to the same four decimal places (~11 m). The first survives. This is what turns
three "Accra Mall" rows into one.

## 6. The cache

An in-process LRU keyed on the normalised query — trimmed, lowercased, internal whitespace
collapsed — with a hard cap on entries and a one-hour TTL. Places do not move; an hour is
conservative.

This is the whole reason for proxying rather than calling Photon from the browser: a cache turns
*N* users typing "kotoka" into one upstream request, which is what makes depending on a courtesy
service defensible. Without it the proxy is pure overhead.

It is in-process, so it is empty after a Render cold start and is not shared between instances.
Both are acceptable and are the same tradeoff `src/http/rateLimit.ts` already documents for the
limiter.

## 7. The first outbound call on a request path

The API makes no outbound HTTP calls today — `google-auth-library` and `web-push` do their own
internally, but nothing in `src/` calls `fetch`. This endpoint is the first, and being first is
what the following three rules are about.

**A hard 3-second timeout** via `AbortSignal.timeout`. A hanging upstream on a host with limited
concurrency does not degrade search, it exhausts the process and takes down trip creation with
it. The timeout is the difference between one broken feature and one broken API.

**Failure answers an empty list, not an error.** A 502 arriving mid-keystroke is worse than no
suggestions: the screen has a perfectly good map-pin path, and the client renders "No matches"
either way. Upstream failure is logged and counted, never surfaced as a request failure.

**A `User-Agent` naming the app and a contact URL.** komoot's terms ask for it, and it is what
makes a future rate-limit conversation possible rather than an unexplained outage.

## 8. Rate limit

A new `geocode` quota in `src/http/quotas.ts`, keyed per device. Autocomplete is high-frequency
by nature, so most of the reduction happens before a request is made: the client debounces
250 ms and refuses to search under three characters. The server-side limit is the real ceiling,
sized to allow ordinary typing and not much more.

## 9. The UI

**A new component.** `app/components/Radar.tsx` is 2,026 lines; this does not go inside it.
`app/components/DestinationSearch.tsx` owns the input, the debounce, the suggestion list and the
keyboard handling. `Radar.tsx` keeps the `dest` and `pin` state it already has and passes setters
down.

**Behaviour.**

- Three or more characters, debounced 250 ms, then the list appears below the input.
- Choosing a suggestion sets **both** `dest` (to `label`) and `pin` (to its coordinates), and
  recentres the map on it.
- The existing "tap to adjust" keeps working, and moving the pin afterwards **does not clear the
  name**. Someone who searched "Kotoka Airport" meant Kotoka Airport; they are correcting exactly
  where it is, not changing their mind about where they are going.
- Escape, a blur, or a selection dismisses the list.
- Typing with no network, or upstream failure, shows "No matches" — never an error state.

**Accessibility.** A real combobox: `role="combobox"` with `aria-expanded` and
`aria-controls` on the input, `role="listbox"`/`option` on the list, `aria-activedescendant`
tracking the highlighted row, and arrow keys, Enter and Escape all working. A suggestion list
reachable only by tapping would be unusable by keyboard, and this repo already runs a regression
suite over contrast and tap targets — the spirit of that suite applies here.

## 10. Degradation

Strictly additive. If the endpoint is unreachable, rate-limited, slow, or the provider has
blocked us, the Create screen behaves exactly as it does today: type a name, drop a pin. There is
no path in which a third party's availability prevents somebody starting a trip.

## 11. Testing

Pure logic gets real tests, in this project's existing style.

- **Query normalisation and the LRU** — unit tests, including eviction at the cap and expiry at
  the TTL.
- **`featuresToPlaces`** — against a **recorded real Photon response** committed as a fixture, so
  an upstream schema change fails a test instead of a screen. Must cover all four §5 rules: the
  `[lon, lat]` order, a composed detail line from each of the three different property shapes,
  Ghana ranking above a foreign result, and three same-named features collapsing to one.
- **The endpoint** through `app.request()` with a stubbed upstream: the happy path, a 3-second
  timeout answering an empty list, an upstream 500 answering an empty list, a query under three
  characters, a missing token, and the rate limit.
- **The client-side debounce and the minimum-length rule** extracted to `lib/search.ts` and
  tested there, because the frontend's vitest has no DOM. The component itself is verified in a
  browser.
- **`createGeocoder`** with a mocked `fetchFn`, in the style of `lib/data/__tests__/account.test.ts`:
  the request carries the bearer token, a non-2xx answers an empty list rather than throwing, and
  a network failure does the same. It is deliberately not part of the `DataClient` conformance
  suite, for the reason given in §4.

## 12. Files

| File | Change |
|---|---|
| `backend/src/domain/geocode.ts` | new — normalisation, `featuresToPlaces`, the four §5 rules |
| `backend/src/domain/geocode.test.ts` | new — with the recorded Photon fixture |
| `backend/src/http/geocode.ts` | new — the route, timeout, cache wiring |
| `backend/src/http/quotas.ts` | a `geocode` quota |
| `backend/src/http/app.ts` | mount the route |
| `backend/src/config.ts` | `PHOTON_URL`, defaulting to the public instance |
| `backend/tests/api.geocode.test.ts` | new — endpoint tests with a stubbed upstream |
| `backend/.env.example`, `render.yaml` | `PHOTON_URL` |
| `frontend/lib/geocode.ts` | new — `createGeocoder(deps)`; NOT on `DataClient`, see §4 |
| `frontend/lib/geocode.test.ts` | new — request shape, error handling, empty-on-failure |
| `frontend/lib/search.ts` | new — debounce and minimum-length logic |
| `frontend/app/components/DestinationSearch.tsx` | new — the combobox |
| `frontend/app/components/Radar.tsx` | use it; pass `dest`/`pin` setters |
| `frontend/README.md`, `backend/README.md` | the new endpoint and env var |

## 13. Risks

**The provider can block us.** It is a courtesy service and we are shipping against it knowingly.
The cache and the 3-character floor keep volume low, and §7's `User-Agent` makes us contactable —
but the mitigation that matters is §2's swappable URL and §10's degradation. This is the same
exposure as the keyless OSM tiles in open item #8, entered deliberately this time and contained.

**Search quality is unmeasured beyond a handful of queries.** §3's samples are encouraging but
they are samples. If Ghanaian POI coverage proves thin in real use, the answer is a different
provider behind the same endpoint, which §4's trimmed shape exists to allow.

**`Radar.tsx` grows again.** It is already too large, and this adds a prop or two. The new
component is the right boundary, but the file needs a proper split at some point and this design
deliberately does not attempt it.
