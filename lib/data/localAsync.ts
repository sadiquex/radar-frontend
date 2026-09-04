import { createLocalData, type LocalDataDeps } from "./local";
import { normalizeShareCode } from "../shareCode";
import type { DataClient } from "./types";
import type { Participant, Trip, TripInput } from "../types";

/**
 * The localStorage store, wrapped to satisfy the async DataClient.
 *
 * Kept rather than deleted for three reasons: `npm run dev` works with no
 * backend and no network, the demo convoy still runs offline, and 156
 * thoroughly tested lines stay useful as the reference implementation the API
 * is checked against (see __tests__/conformance.ts).
 *
 * Live updates are the original mechanism: same-tab writes fan out through an
 * EventTarget, cross-tab ones through the browser `storage` event.
 */
export function createLocalAsyncData(deps: LocalDataDeps): DataClient {
  const base = createLocalData(deps);

  // EventTarget exists in Node too, so same-tab notification works anywhere.
  // Only the cross-tab `storage` listener genuinely needs a browser.
  const bus = new EventTarget();
  const eventName = (tripId: string) => `gt:changed:${tripId}`;
  const notify = (tripId: string) => bus.dispatchEvent(new Event(eventName(tripId)));

  return {
    createTrip: async (input: TripInput, creatorId: string): Promise<Trip> =>
      base.createTrip(input, creatorId),

    // Normalising here, not in the store, keeps the two implementations
    // answering identically for a padded or lowercased code.
    getTripByCode: async (code: string): Promise<Trip | null> => {
      const normalized = normalizeShareCode(code);
      return normalized === null ? null : base.getTripByCode(normalized);
    },

    getTripById: async (id: string): Promise<Trip | null> => base.getTripById(id),

    listParticipants: async (tripId: string): Promise<Participant[]> =>
      base.listParticipants(tripId),

    async joinTrip(tripId: string, participantId: string, displayName: string) {
      const p = base.joinTrip(tripId, participantId, displayName);
      notify(tripId);
      return p;
    },

    async updatePosition(tripId: string, participantId: string, pos) {
      const p = base.updatePosition(tripId, participantId, pos);
      notify(tripId);
      return p;
    },

    async leaveTrip(tripId: string, participantId: string) {
      base.leaveTrip(tripId, participantId);
      notify(tripId);
    },

    async endTrip(tripId: string) {
      base.endTrip(tripId);
      notify(tripId);
    },

    subscribe(tripId: string, onChange: () => void): () => void {
      const local = () => onChange();
      bus.addEventListener(eventName(tripId), local);

      // These key strings are load-bearing: they must match the store's.
      const cross = (e: StorageEvent) => {
        if (e.key === `gt:participants:${tripId}` || e.key === `gt:trip:${tripId}`) onChange();
      };
      const hasWindow = typeof window !== "undefined";
      if (hasWindow) window.addEventListener("storage", cross);

      return () => {
        bus.removeEventListener(eventName(tripId), local);
        if (hasWindow) window.removeEventListener("storage", cross);
      };
    },
  };
}
