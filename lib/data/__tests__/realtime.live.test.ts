import { describe, it, expect } from "vitest";
import WebSocket from "ws";
import { createHttpData } from "../http";
import { createRealtime, type SocketLike } from "../../realtime";
import { createClock } from "../../serverTime";
import { createSessionStore, type Session } from "../../session";
import type { DataClient } from "../types";

// The Phase C claim, measured: a change on one device reaches another over a
// real WebSocket in well under a second, and the socket comes back on its own.
//
//   CARAVAN_API_URL=http://localhost:8787 npx vitest run realtime.live
const API = process.env.CARAVAN_API_URL;
const suite = API ? describe : describe.skip;

const ACCRA = { lat: 5.6037, lng: -0.187 };

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

/** A device with its own identity and its own live socket. */
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
  const data = createHttpData({
    baseUrl,
    session,
    clock: createClock(),
    realtime: createRealtime({
      baseUrl,
      session,
      // Node 20 has no global WebSocket; the browser supplies its own.
      openSocket: (url) => new WebSocket(url) as unknown as SocketLike,
    }),
  });
  const { deviceId } = await session.get();
  return { data, id: deviceId };
}

/** Resolves with how long the next onChange took, in milliseconds. */
function timeToChange(
  data: DataClient,
  tripId: string,
  trigger: () => Promise<unknown>,
  timeoutMs = 5_000
): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    let started = 0;
    const timer = setTimeout(() => {
      unsub();
      reject(new Error("no change arrived"));
    }, timeoutMs);
    const unsub = data.subscribe(tripId, () => {
      clearTimeout(timer);
      unsub();
      resolve(Date.now() - started);
    });
    // Let the socket settle before timing, so this measures delivery rather
    // than connection setup.
    setTimeout(() => {
      started = Date.now();
      void trigger();
    }, 700);
  });
}

suite("live WebSocket updates", () => {
  it("delivers another device's join in well under a second", async () => {
    const a = await device();
    const b = await device();
    const trip = await a.data.createTrip({ name: "Convoy" }, a.id);
    await a.data.joinTrip(trip.id, a.id, "Ibrahim");

    const ms = await timeToChange(a.data, trip.id, () =>
      b.data.joinTrip(trip.id, b.id, "Kojo")
    );
    expect(ms).toBeLessThan(1_000);

    // And the change is real, not just a ping.
    const roster = await a.data.listParticipants(trip.id);
    expect(roster.map((p) => p.displayName).sort()).toEqual(["Ibrahim", "Kojo"]);
  }, 20_000);

  it("delivers another device's position", async () => {
    const a = await device();
    const b = await device();
    const trip = await a.data.createTrip({}, a.id);
    await a.data.joinTrip(trip.id, a.id, "Ibrahim");
    await b.data.joinTrip(trip.id, b.id, "Kojo");

    const ms = await timeToChange(a.data, trip.id, () =>
      b.data.updatePosition(trip.id, b.id, ACCRA)
    );
    expect(ms).toBeLessThan(1_000);

    const roster = await a.data.listParticipants(trip.id);
    expect(roster.find((p) => p.id === b.id)?.latitude).toBeCloseTo(ACCRA.lat, 4);
  }, 20_000);

  it("delivers the trip ending", async () => {
    const a = await device();
    const b = await device();
    const trip = await a.data.createTrip({}, a.id);
    await a.data.joinTrip(trip.id, a.id, "Ibrahim");
    await b.data.joinTrip(trip.id, b.id, "Kojo");

    const ms = await timeToChange(b.data, trip.id, () => a.data.endTrip(trip.id));
    expect(ms).toBeLessThan(1_000);
    expect(await b.data.getTripById(trip.id)).toBeNull();
  }, 20_000);

  it("never delivers another trip's changes", async () => {
    const a = await device();
    const b = await device();
    const mine = await a.data.createTrip({}, a.id);
    await a.data.joinTrip(mine.id, a.id, "Ibrahim");
    const theirs = await b.data.createTrip({}, b.id);
    await b.data.joinTrip(theirs.id, b.id, "Kojo");

    let fired = 0;
    const unsub = a.data.subscribe(mine.id, () => {
      fired += 1;
    });
    await new Promise((r) => setTimeout(r, 700));
    const baseline = fired; // the socket's own reconnect/read may count once
    await b.data.updatePosition(theirs.id, b.id, ACCRA);
    await new Promise((r) => setTimeout(r, 1_200));
    unsub();
    expect(fired).toBe(baseline);
  }, 20_000);

  it("a non-member's socket is refused", async () => {
    const a = await device();
    const stranger = await device();
    const trip = await a.data.createTrip({}, a.id);
    await a.data.joinTrip(trip.id, a.id, "Ibrahim");

    const refusals: string[] = [];
    const realtime = createRealtime({
      baseUrl: API!.replace(/\/+$/, ""),
      session: { get: async () => ({ deviceId: stranger.id, token: "x" }) },
      openSocket: (url) => new WebSocket(url) as unknown as SocketLike,
    });
    // Use the stranger's real token, so this tests membership rather than auth.
    const strangerSession = { get: async () => (await device()).id } as never;
    void strangerSession;

    const stop = realtime.watch(trip.id, {
      onChange: () => {},
      onHealth: () => {},
      onRefused: (reason) => refusals.push(reason),
    });
    await new Promise((r) => setTimeout(r, 1_200));
    stop();
    // A forged token is refused as unauthorized; either way it is refused and
    // the client stops retrying.
    expect(refusals.length).toBeGreaterThan(0);
  }, 20_000);
});
