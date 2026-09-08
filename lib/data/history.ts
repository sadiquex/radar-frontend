import type { Session } from "../session";

/**
 * The trips behind an account.
 *
 * Deliberately not part of `DataClient`. That interface is the trip operations
 * every screen shares, and it has two implementations held to a conformance
 * suite — putting history behind it would force a localStorage implementation
 * of a feature that cannot exist without an account, and the suite would then
 * be asserting the behaviour of something that never runs.
 *
 * Everything here degrades to empty rather than to an error, for the same
 * reason `account.ts` degrades to "no account": a dashboard that renders
 * nothing is recoverable, and a screen that throws is not.
 */

/** Somebody still in the trip when it finished. `arrived` is null with no destination. */
export interface Finisher {
  name: string;
  arrived: boolean | null;
}

/** Still running. The only kind that carries a share code. */
export interface LiveTripEntry {
  kind: "live";
  tripId: string;
  shareCode: string;
  name: string | null;
  destinationName: string | null;
  memberCount: number;
  startedAt: number;
  expiresAt: number;
  wasCreator: boolean;
}

/** Over, but the sweep has not taken its record yet, so there is no roster. */
export interface FinishingTripEntry {
  kind: "finishing";
  tripId: string;
  name: string | null;
  destinationName: string | null;
  destinationLat: number | null;
  destinationLng: number | null;
  startedAt: number;
  finishedAt: number;
  finishReason: "ended" | "expired";
  wasCreator: boolean;
  youLeftEarly: boolean;
}

/** Over and recorded. */
export interface PastTripEntry extends Omit<FinishingTripEntry, "kind"> {
  kind: "past";
  finishers: Finisher[];
}

export type TripEntry = LiveTripEntry | FinishingTripEntry | PastTripEntry;

export interface HistoryPage {
  trips: TripEntry[];
  /** Null on the last page. */
  nextCursor: string | null;
}

export interface HistoryClient {
  /** Trips running right now. Empty on any failure. */
  live(): Promise<LiveTripEntry[]>;
  /** One page of history, newest first. Empty on any failure. */
  list(cursor?: string | null): Promise<HistoryPage>;
  /** One trip, or null when it is not this account's to read. */
  get(tripId: string): Promise<TripEntry | null>;
  /** Removes one trip from this account's history. Throws on refusal. */
  forget(tripId: string): Promise<void>;
  /** Removes every trip. Throws on refusal. */
  forgetAll(): Promise<void>;
}

export interface HistoryDeps {
  baseUrl: string;
  session: { get: () => Promise<Session> };
  fetchFn?: typeof fetch;
}

export function createHistoryClient(deps: HistoryDeps): HistoryClient {
  const doFetch = deps.fetchFn ?? globalThis.fetch;

  async function send(path: string, method = "GET"): Promise<Response> {
    const { token } = await deps.session.get();
    return doFetch(`${deps.baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  return {
    async live(): Promise<LiveTripEntry[]> {
      try {
        const res = await send("/v1/me/trips/live");
        if (!res.ok) return [];
        const body = (await res.json()) as { trips?: LiveTripEntry[] };
        return body.trips ?? [];
      } catch {
        // Home renders perfectly well with no live trips, and an error banner
        // over the two buttons somebody came here to press helps nobody.
        return [];
      }
    },

    async list(cursor?: string | null): Promise<HistoryPage> {
      try {
        const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
        const res = await send(`/v1/me/trips${query}`);
        if (!res.ok) return { trips: [], nextCursor: null };
        const body = (await res.json()) as Partial<HistoryPage>;
        return { trips: body.trips ?? [], nextCursor: body.nextCursor ?? null };
      } catch {
        return { trips: [], nextCursor: null };
      }
    },

    async get(tripId: string): Promise<TripEntry | null> {
      try {
        const res = await send(`/v1/me/trips/${encodeURIComponent(tripId)}`);
        if (!res.ok) return null;
        const body = (await res.json()) as { trip?: TripEntry };
        return body.trip ?? null;
      } catch {
        return null;
      }
    },

    async forget(tripId: string): Promise<void> {
      // Deletion is the one operation here the user is watching, so it is
      // honest about failing — silently doing nothing to a row somebody asked
      // to remove is the worst outcome available.
      const res = await send(`/v1/me/trips/${encodeURIComponent(tripId)}`, "DELETE");
      if (!res.ok) throw new Error(`Could not remove that trip (${res.status})`);
    },

    async forgetAll(): Promise<void> {
      const res = await send("/v1/me/trips", "DELETE");
      if (!res.ok) throw new Error(`Could not clear your history (${res.status})`);
    },
  };
}

/** With no API configured there are no accounts, so there is no history. */
export const offlineHistory: HistoryClient = {
  async live() {
    return [];
  },
  async list() {
    return { trips: [], nextCursor: null };
  },
  async get() {
    return null;
  },
  async forget() {},
  async forgetAll() {},
};
