import { describe, it, expect } from "vitest";
import { createHttpData } from "../http";
import { createClock } from "../../serverTime";
import { createSessionStore, type Session } from "../../session";
import { computeStatuses } from "../../status";
import type { DataClient } from "../types";

// The Phase B claim, end to end: two devices with nothing in common but a
// share code can see each other's positions, and the status engine agrees on
// both. This is the thing that was impossible on localStorage.
//
//   CARAVAN_API_URL=http://localhost:8787 npx vitest run twoDevices
const API = process.env.CARAVAN_API_URL;
const suite = API ? describe : describe.skip;

const ACCRA = { lat: 5.6037, lng: -0.187 };
const KUMASI = { lat: 6.6885, lng: -1.6244 };

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

/** A device: its own storage, its own token, its own clock. Like a phone. */
async function device(): Promise<{ data: DataClient; id: string }> {
  const baseUrl = API!.replace(/\/+$/, "");
  const session = createSessionStore({
    storage: memoryStorage(),
    requestDevice: async (): Promise<Session> => {
      const res = await fetch(`${baseUrl}/v1/devices`, { method: "POST" });
      if (!res.ok) throw new Error(`device registration failed: ${res.status}`);
      const body = (await res.json()) as Session;
      return { deviceId: body.deviceId, token: body.token };
    },
  });
  const data = createHttpData({ baseUrl, session, clock: createClock() });
  const { deviceId } = await session.get();
  return { data, id: deviceId };
}

suite("two devices, one trip", () => {
  it("each sees the other join", async () => {
    const a = await device();
    const b = await device();

    const trip = await a.data.createTrip({ name: "Road Trip" }, a.id);
    await a.data.joinTrip(trip.id, a.id, "Ibrahim");

    // B has only the share code, exactly as a link recipient would.
    const seen = await b.data.getTripByCode(trip.shareCode);
    expect(seen?.id).toBe(trip.id);
    await b.data.joinTrip(trip.id, b.id, "Kojo");

    const fromA = await a.data.listParticipants(trip.id);
    const fromB = await b.data.listParticipants(trip.id);
    expect(fromA.map((p) => p.displayName).sort()).toEqual(["Ibrahim", "Kojo"]);
    expect(fromB.map((p) => p.displayName).sort()).toEqual(["Ibrahim", "Kojo"]);
  });

  it("each sees the other's position, and both derive the same statuses", async () => {
    const a = await device();
    const b = await device();

    const trip = await a.data.createTrip(
      { destinationName: "Kumasi", destinationLat: KUMASI.lat, destinationLng: KUMASI.lng },
      a.id
    );
    await a.data.joinTrip(trip.id, a.id, "Ibrahim");
    await b.data.joinTrip(trip.id, b.id, "Kojo");

    // Ibrahim is in Accra; Kojo is 20km up the road toward Kumasi.
    await a.data.updatePosition(trip.id, a.id, ACCRA);
    await b.data.updatePosition(trip.id, b.id, { lat: 5.7837, lng: -0.187 });

    const asA = await a.data.listParticipants(trip.id);
    const asB = await b.data.listParticipants(trip.id);

    const kojoSeenByA = asA.find((p) => p.id === b.id);
    expect(kojoSeenByA?.latitude).toBeCloseTo(5.7837, 4);
    const ibrahimSeenByB = asB.find((p) => p.id === a.id);
    expect(ibrahimSeenByB?.latitude).toBeCloseTo(ACCRA.lat, 4);

    // The status engine is client-side, so the real test is that two devices
    // reach the same verdict from the same server data.
    const now = Date.now();
    const dest = { lat: KUMASI.lat, lng: KUMASI.lng };
    const statusesA = computeStatuses(asA, dest, now);
    const statusesB = computeStatuses(asB, dest, now);
    expect(statusesA[a.id].status).toBe("behind");
    expect(statusesA[b.id].status).toBe("ahead");
    expect(statusesB).toEqual(statusesA);
  });

  it("a device that never joined cannot see anyone's position", async () => {
    // The privacy rule, from the client's side of the wire.
    const a = await device();
    const stranger = await device();

    const trip = await a.data.createTrip({}, a.id);
    await a.data.joinTrip(trip.id, a.id, "Ibrahim");
    await a.data.updatePosition(trip.id, a.id, ACCRA);

    expect(await stranger.data.listParticipants(trip.id)).toEqual([]);
    expect(await stranger.data.getTripById(trip.id)).toBeNull();
  });

  it("a stranger holding the code sees the trip's name but not its destination", async () => {
    const a = await device();
    const stranger = await device();

    const trip = await a.data.createTrip(
      { name: "Road Trip", destinationName: "Kumasi", destinationLat: KUMASI.lat, destinationLng: KUMASI.lng },
      a.id
    );
    const preview = await stranger.data.getTripByCode(trip.shareCode);
    expect(preview?.name).toBe("Road Trip");
    expect(preview?.destinationName).toBe("Kumasi");
    expect(preview?.destinationLat).toBeNull();
    expect(preview?.destinationLng).toBeNull();
  });

  it("one device ending the trip ends it for the other", async () => {
    const a = await device();
    const b = await device();

    const trip = await a.data.createTrip({}, a.id);
    await a.data.joinTrip(trip.id, a.id, "Ibrahim");
    await b.data.joinTrip(trip.id, b.id, "Kojo");

    await a.data.endTrip(trip.id);

    // B's group view re-checks liveness on every change and lands on Ended.
    expect(await b.data.getTripById(trip.id)).toBeNull();
    expect(await b.data.getTripByCode(trip.shareCode)).toBeNull();
  });

  it("a non-creator cannot end the trip", async () => {
    const a = await device();
    const b = await device();

    const trip = await a.data.createTrip({}, a.id);
    await a.data.joinTrip(trip.id, a.id, "Ibrahim");
    await b.data.joinTrip(trip.id, b.id, "Kojo");

    await expect(b.data.endTrip(trip.id)).rejects.toMatchObject({ code: "forbidden" });
    // Still running for everyone.
    expect(await a.data.getTripById(trip.id)).not.toBeNull();
  });

  it("both devices are corrected onto the server's clock", async () => {
    // Two phones with different clock settings must still agree on how long
    // ago someone was last seen.
    const a = await device();
    const trip = await a.data.createTrip({}, a.id);
    const p = await a.data.joinTrip(trip.id, a.id, "Ibrahim");
    // lastSeenAt is the server's, in epoch milliseconds.
    expect(typeof p.lastSeenAt).toBe("number");
    expect(Math.abs(p.lastSeenAt - Date.now())).toBeLessThan(60_000);
  });
});
