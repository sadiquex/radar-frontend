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
