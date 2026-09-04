import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { createHttpData } from "../http";
import { ApiError } from "../types";
import { createClock } from "../../serverTime";
import type { Session } from "../../session";

const SESSION: Session = { deviceId: "dev-1", token: "tok-1" };
const TRIP_ID = "trip-1";
const ACCRA = { lat: 5.6037, lng: -0.187 };

function trip(over: Record<string, unknown> = {}) {
  return {
    id: TRIP_ID,
    shareCode: "KMS4F2",
    name: "Road Trip",
    destinationName: "Kumasi",
    destinationLat: 6.6885,
    destinationLng: -1.6244,
    creatorId: "dev-1",
    endedAt: null,
    expiresAt: 2_000_000,
    createdAt: 1_000_000,
    ...over,
  };
}

function participant(over: Record<string, unknown> = {}) {
  return {
    id: "dev-1",
    tripId: TRIP_ID,
    displayName: "Ama",
    latitude: null,
    longitude: null,
    status: null,
    lastMovedAt: null,
    lastSeenAt: 1_000_000,
    ...over,
  };
}

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/** A fetch stub that answers from a queue of [status, payload] pairs. */
function stubFetch(replies: Array<[number, unknown]>) {
  const calls: Call[] = [];
  const queue = [...replies];
  const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({
      url,
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body === undefined ? undefined : JSON.parse(init.body as string),
    });
    const next = queue.shift();
    if (next === undefined) throw new Error(`unexpected fetch: ${init?.method} ${url}`);
    const [status, payload] = next;
    return new Response(status === 204 ? null : JSON.stringify(payload), { status });
  });
  return { fetchFn, calls };
}

function makeClient(replies: Array<[number, unknown]>, clock = createClock(() => 1_000_000)) {
  const { fetchFn, calls } = stubFetch(replies);
  const data = createHttpData({
    baseUrl: "https://api.test",
    session: {
      get: async () => SESSION,
      peek: () => SESSION,
      clear: () => {},
    },
    fetchFn: fetchFn as unknown as typeof fetch,
    clock,
  });
  return { data, calls, fetchFn };
}

const withNow = (payload: Record<string, unknown>, serverNow = 1_000_000) => ({
  ...payload,
  serverNow,
});

describe("createHttpData — requests", () => {
  it("sends the session token as a bearer credential", async () => {
    const { data, calls } = makeClient([[201, withNow({ trip: trip() })]]);
    await data.createTrip({ name: "Road Trip" }, "ignored");
    expect(calls[0].headers.Authorization).toBe("Bearer tok-1");
  });

  it("posts the trip input and ignores the caller's creatorId", async () => {
    // Ownership is derived from the token server-side; passing it would be a
    // lie the server has to defend against anyway.
    const { data, calls } = makeClient([[201, withNow({ trip: trip() })]]);
    await data.createTrip({ name: "Road Trip", destinationLat: 6.6885, destinationLng: -1.6244 }, "dev-9");
    expect(calls[0].url).toBe("https://api.test/v1/trips");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].body).toEqual({
      name: "Road Trip",
      destinationLat: 6.6885,
      destinationLng: -1.6244,
    });
  });

  it("returns the trip in the frontend's own shape", async () => {
    const { data } = makeClient([[201, withNow({ trip: trip() })]]);
    const made = await data.createTrip({}, "x");
    expect(made.shareCode).toBe("KMS4F2");
    expect(made.expiresAt).toBe(2_000_000);
    expect(typeof made.createdAt).toBe("number");
  });

  it("looks a trip up by code, uppercased and trimmed", async () => {
    // The Join screen does not trim before submitting.
    const { data, calls } = makeClient([[200, withNow({ trip: trip(), isMember: false })]]);
    await data.getTripByCode("  kms4f2 ");
    expect(calls[0].url).toBe("https://api.test/v1/trips/by-code/KMS4F2");
  });

  it("joins as the session device", async () => {
    const { data, calls } = makeClient([[201, withNow({ participant: participant() })]]);
    await data.joinTrip(TRIP_ID, "dev-1", "Ama");
    expect(calls[0].url).toBe(`https://api.test/v1/trips/${TRIP_ID}/participants`);
    expect(calls[0].body).toEqual({ displayName: "Ama" });
  });

  it("writes its own position to the /me route", async () => {
    const { data, calls } = makeClient([[200, withNow({ participant: participant() })]]);
    await data.updatePosition(TRIP_ID, "dev-1", ACCRA);
    expect(calls[0].url).toBe(`https://api.test/v1/trips/${TRIP_ID}/participants/me`);
    expect(calls[0].method).toBe("PATCH");
    expect(calls[0].body).toEqual(ACCRA);
  });

  it("leaves via the /me route", async () => {
    const { data, calls } = makeClient([[204, null]]);
    await data.leaveTrip(TRIP_ID, "dev-1");
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toBe(`https://api.test/v1/trips/${TRIP_ID}/participants/me`);
  });

  it("ends a trip", async () => {
    const { data, calls } = makeClient([[200, withNow({ trip: trip({ endedAt: 1_500_000 }) })]]);
    await data.endTrip(TRIP_ID);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe(`https://api.test/v1/trips/${TRIP_ID}/end`);
  });
});

describe("createHttpData — the demo convoy", () => {
  it("routes a demo member's join to the creator-only demo endpoint", async () => {
    // lib/demo.ts writes as three scripted members. Those are the only ids
    // that are legitimately not the caller.
    const { data, calls } = makeClient([
      [201, withNow({ participant: participant({ id: "demo-kofi", displayName: "Kofi" }) })],
    ]);
    await data.joinTrip(TRIP_ID, "demo-kofi", "Kofi");
    expect(calls[0].url).toBe(`https://api.test/v1/trips/${TRIP_ID}/participants/demo`);
    expect(calls[0].body).toEqual({ id: "demo-kofi", displayName: "Kofi" });
  });

  it("routes a demo member's position to the demo participant route", async () => {
    const { data, calls } = makeClient([
      [200, withNow({ participant: participant({ id: "demo-yaw" }) })],
    ]);
    await data.updatePosition(TRIP_ID, "demo-yaw", ACCRA);
    expect(calls[0].url).toBe(`https://api.test/v1/trips/${TRIP_ID}/participants/demo-yaw`);
    expect(calls[0].method).toBe("PATCH");
  });

  it("refuses to address anyone else as if they were a demo member", async () => {
    // A guard against a future call site quietly writing another member's row.
    const { data } = makeClient([]);
    await expect(data.updatePosition(TRIP_ID, "dev-2", ACCRA)).rejects.toThrow(/own position/i);
  });
});

describe("createHttpData — clock correction", () => {
  it("records serverNow from every response", async () => {
    const clock = createClock(() => 1_000_000);
    const { data } = makeClient([[201, withNow({ trip: trip() }, 1_600_000)]], clock);
    await data.createTrip({}, "x");
    expect(clock.offsetMs()).toBe(600_000);
  });

  it("records serverNow even from an error response", async () => {
    // The Ended screen and "last ping" both read the clock; an expired trip
    // must not leave it uncorrected.
    const clock = createClock(() => 1_000_000);
    const { data } = makeClient([[410, { error: "expired", serverNow: 1_600_000 }]], clock);
    await data.getTripByCode("KMS4F2");
    expect(clock.offsetMs()).toBe(600_000);
  });
});

describe("createHttpData — a trip that is gone", () => {
  it("reports an unknown code as no trip, the way the screens already expect", async () => {
    const { data } = makeClient([[404, { error: "not_found", serverNow: 1_000_000 }]]);
    expect(await data.getTripByCode("ZZZZZZ")).toBeNull();
  });

  it("reports an expired trip as no trip", async () => {
    const { data } = makeClient([[410, { error: "expired", serverNow: 1_000_000 }]]);
    expect(await data.getTripByCode("KMS4F2")).toBeNull();
  });

  it("reports an ended trip as no trip", async () => {
    const { data } = makeClient([[410, { error: "ended", serverNow: 1_000_000 }]]);
    expect(await data.getTripByCode("KMS4F2")).toBeNull();
  });

  it("reports a code that could never be valid as no trip", async () => {
    const { data } = makeClient([]);
    expect(await data.getTripByCode("nope")).toBeNull();
  });

  it("reports a trip this device cannot see as no trip", async () => {
    // getTripById is the group view's liveness re-check. Being forbidden and
    // being gone look the same from there: leave the group view.
    const { data } = makeClient([[403, { error: "forbidden", serverNow: 1_000_000 }]]);
    expect(await data.getTripById(TRIP_ID)).toBeNull();
  });
});

describe("createHttpData — errors that must surface", () => {
  it("throws a typed error when the trip is full", async () => {
    const { data } = makeClient([[409, { error: "trip_full", serverNow: 1_000_000 }]]);
    await expect(data.joinTrip(TRIP_ID, "dev-1", "Ama")).rejects.toMatchObject({
      code: "trip_full",
      status: 409,
    });
  });

  it("throws a typed error when a position write is refused", async () => {
    // useGeolocation stops the watch on this rather than throwing inside a
    // watchPosition callback forever.
    const { data } = makeClient([[403, { error: "forbidden", serverNow: 1_000_000 }]]);
    await expect(data.updatePosition(TRIP_ID, "dev-1", ACCRA)).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("throws a typed error when the trip ended mid-drive", async () => {
    const { data } = makeClient([[410, { error: "ended", serverNow: 1_000_000 }]]);
    await expect(data.updatePosition(TRIP_ID, "dev-1", ACCRA)).rejects.toMatchObject({
      code: "ended",
    });
  });

  it("reports a network failure as offline rather than a crash", async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const data = createHttpData({
      baseUrl: "https://api.test",
      session: { get: async () => SESSION, peek: () => SESSION, clear: () => {} },
      fetchFn: fetchFn as unknown as typeof fetch,
      clock: createClock(() => 1_000_000),
    });
    await expect(data.createTrip({}, "x")).rejects.toMatchObject({ code: "offline" });
  });

  it("reports an unparseable response as an internal error", async () => {
    const fetchFn = vi.fn(async () => new Response("<html>502</html>", { status: 502 }));
    const data = createHttpData({
      baseUrl: "https://api.test",
      session: { get: async () => SESSION, peek: () => SESSION, clear: () => {} },
      fetchFn: fetchFn as unknown as typeof fetch,
      clock: createClock(() => 1_000_000),
    });
    await expect(data.createTrip({}, "x")).rejects.toBeInstanceOf(ApiError);
  });
});

describe("createHttpData — one request for the refresh path", () => {
  it("serves getTripById and listParticipants from a single /state fetch", async () => {
    // app/t/[code]/page.tsx asks for both inside one refresh(). Two round trips
    // per poll on mobile data is a cost with no benefit.
    const { data, fetchFn } = makeClient([
      [200, withNow({ trip: trip(), participants: [participant()] })],
    ]);
    const [found, members] = await Promise.all([
      data.getTripById(TRIP_ID),
      data.listParticipants(TRIP_ID),
    ]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(found?.id).toBe(TRIP_ID);
    expect(members).toHaveLength(1);
  });

  it("coalesces sequential calls inside the same tick", async () => {
    const { data, fetchFn } = makeClient([
      [200, withNow({ trip: trip(), participants: [participant()] })],
    ]);
    await data.getTripById(TRIP_ID);
    await data.listParticipants(TRIP_ID);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("hits /state with the trip id", async () => {
    const { data, calls } = makeClient([
      [200, withNow({ trip: trip(), participants: [] })],
    ]);
    await data.getTripById(TRIP_ID);
    expect(calls[0].url).toBe(`https://api.test/v1/trips/${TRIP_ID}/state`);
  });

  it("refetches after a write, so a fresh join is never read from cache", async () => {
    // Joining then immediately reading state is the actual navigation flow.
    const { data, fetchFn } = makeClient([
      [200, withNow({ trip: trip(), participants: [] })],
      [201, withNow({ participant: participant() })],
      [200, withNow({ trip: trip(), participants: [participant()] })],
    ]);
    await data.listParticipants(TRIP_ID);
    await data.joinTrip(TRIP_ID, "dev-1", "Ama");
    const members = await data.listParticipants(TRIP_ID);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(members).toHaveLength(1);
  });

  it("keeps different trips' caches apart", async () => {
    const { data, fetchFn } = makeClient([
      [200, withNow({ trip: trip(), participants: [] })],
      [200, withNow({ trip: trip({ id: "trip-2" }), participants: [participant()] })],
    ]);
    await data.listParticipants(TRIP_ID);
    const other = await data.listParticipants("trip-2");
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(other).toHaveLength(1);
  });
});

describe("createHttpData — subscribe with a live socket", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A stand-in for lib/realtime, so the wiring can be driven by hand. */
  function fakeRealtime() {
    const watches: Array<{
      tripId: string;
      handlers: { onChange: () => void; onHealth: (up: boolean) => void };
      stopped: boolean;
    }> = [];
    const realtime = {
      watch(tripId: string, handlers: any) {
        const entry = { tripId, handlers, stopped: false };
        watches.push(entry);
        return () => {
          entry.stopped = true;
        };
      },
    };
    return { realtime, watches };
  }

  function clientWithSocket(replies: Array<[number, unknown]>) {
    const { fetchFn, calls } = stubFetch(replies);
    const { realtime, watches } = fakeRealtime();
    const data = createHttpData({
      baseUrl: "https://api.test",
      session: { get: async () => SESSION, peek: () => SESSION, clear: () => {} },
      fetchFn: fetchFn as unknown as typeof fetch,
      clock: createClock(() => 1_000_000),
      realtime: realtime as any,
    });
    return { data, calls, fetchFn, watches };
  }

  it("watches the trip's socket", async () => {
    const { data, watches } = clientWithSocket([]);
    const stop = data.subscribe(TRIP_ID, vi.fn());
    expect(watches).toHaveLength(1);
    expect(watches[0].tripId).toBe(TRIP_ID);
    stop();
  });

  it("notifies on a socket change, with a fresh read", async () => {
    const { data, watches, fetchFn } = clientWithSocket([
      [200, withNow({ trip: trip(), participants: [participant()] })],
      [200, withNow({ trip: trip(), participants: [participant()] })],
    ]);
    const onChange = vi.fn();
    const stop = data.subscribe(TRIP_ID, onChange);

    // Warm the cache, then let the socket report a change.
    await data.listParticipants(TRIP_ID);
    watches[0].handlers.onChange();
    expect(onChange).toHaveBeenCalledTimes(1);

    // The cached read must have been dropped, so the screen re-reads.
    await data.listParticipants(TRIP_ID);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    stop();
  });

  it("polls until the socket is up, then stops", async () => {
    // Covers the case that matters most in the field: a network or proxy that
    // blocks WebSockets entirely. Polling simply never stops.
    const { data, fetchFn, watches } = clientWithSocket([
      [200, withNow({ trip: trip(), participants: [] })],
      [200, withNow({ trip: trip(), participants: [] })],
      [200, withNow({ trip: trip(), participants: [] })],
    ]);
    const stop = data.subscribe(TRIP_ID, vi.fn());

    await vi.advanceTimersByTimeAsync(4_000);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    watches[0].handlers.onHealth(true);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetchFn).toHaveBeenCalledTimes(1); // no further polling
    stop();
  });

  it("resumes polling when the socket drops, and stops again when it returns", async () => {
    const { data, fetchFn, watches } = clientWithSocket(
      Array.from({ length: 6 }, () => [200, withNow({ trip: trip(), participants: [] })] as [number, unknown])
    );
    const stop = data.subscribe(TRIP_ID, vi.fn());
    watches[0].handlers.onHealth(true);
    await vi.advanceTimersByTimeAsync(20_000);
    const whileUp = fetchFn.mock.calls.length;

    watches[0].handlers.onHealth(false);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(fetchFn.mock.calls.length).toBeGreaterThan(whileUp);

    const whileDown = fetchFn.mock.calls.length;
    watches[0].handlers.onHealth(true);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetchFn.mock.calls.length).toBe(whileDown);
    stop();
  });

  it("stops watching when the caller unsubscribes", async () => {
    const { data, watches } = clientWithSocket([]);
    const stop = data.subscribe(TRIP_ID, vi.fn());
    stop();
    expect(watches[0].stopped).toBe(true);
  });

  it("still notifies on this tab's own writes", async () => {
    const { data, watches } = clientWithSocket([[201, withNow({ participant: participant() })]]);
    const onChange = vi.fn();
    const stop = data.subscribe(TRIP_ID, onChange);
    await data.joinTrip(TRIP_ID, "dev-1", "Ama");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(watches[0].stopped).toBe(false);
    stop();
  });
});

describe("createHttpData — subscribe", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("polls the trip's state and fires only when something changed", async () => {
    const { data, fetchFn } = makeClient([
      [200, withNow({ trip: trip(), participants: [participant()] })],
      [200, withNow({ trip: trip(), participants: [participant()] })],
      [200, withNow({ trip: trip(), participants: [participant(), participant({ id: "dev-2", displayName: "Kojo" })] })],
    ]);
    const onChange = vi.fn();
    const unsub = data.subscribe(TRIP_ID, onChange);

    await vi.advanceTimersByTimeAsync(4_000);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    // First sample establishes the baseline; nothing has "changed" yet.
    expect(onChange).toHaveBeenCalledTimes(0);

    await vi.advanceTimersByTimeAsync(4_000);
    expect(onChange).toHaveBeenCalledTimes(0); // identical state

    await vi.advanceTimersByTimeAsync(4_000);
    expect(onChange).toHaveBeenCalledTimes(1); // Kojo joined

    unsub();
  });

  it("notifies immediately when this client writes, without waiting for a poll", async () => {
    // The local store notifies on write, and screens rely on it: the group
    // view joins, subscribes, and then adds demo members. A change landing
    // before the first poll must not be swallowed into the baseline.
    const { data } = makeClient([
      [201, withNow({ participant: participant() })],
      [200, withNow({ trip: trip(), participants: [participant()] })],
    ]);
    const onChange = vi.fn();
    const unsub = data.subscribe(TRIP_ID, onChange);
    await data.joinTrip(TRIP_ID, "dev-1", "Ama");
    expect(onChange).toHaveBeenCalledTimes(1);
    unsub();
  });

  it("notifies on a position write", async () => {
    const { data } = makeClient([[200, withNow({ participant: participant() })]]);
    const onChange = vi.fn();
    const unsub = data.subscribe(TRIP_ID, onChange);
    await data.updatePosition(TRIP_ID, "dev-1", ACCRA);
    expect(onChange).toHaveBeenCalledTimes(1);
    unsub();
  });

  it("does not notify a subscriber watching a different trip", async () => {
    const { data } = makeClient([[201, withNow({ participant: participant() })]]);
    const onChange = vi.fn();
    const unsub = data.subscribe("other-trip", onChange);
    await data.joinTrip(TRIP_ID, "dev-1", "Ama");
    expect(onChange).not.toHaveBeenCalled();
    unsub();
  });

  it("stops notifying on writes after unsubscribe", async () => {
    const { data } = makeClient([[201, withNow({ participant: participant() })]]);
    const onChange = vi.fn();
    const unsub = data.subscribe(TRIP_ID, onChange);
    unsub();
    await data.joinTrip(TRIP_ID, "dev-1", "Ama");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("stops polling once unsubscribed", async () => {
    const { data, fetchFn } = makeClient([
      [200, withNow({ trip: trip(), participants: [] })],
    ]);
    const unsub = data.subscribe(TRIP_ID, vi.fn());
    await vi.advanceTimersByTimeAsync(4_000);
    unsub();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("notices a position change, not just a joiner", async () => {
    const { data } = makeClient([
      [200, withNow({ trip: trip(), participants: [participant()] })],
      [200, withNow({ trip: trip(), participants: [participant({ latitude: 5.6, longitude: -0.18 })] })],
    ]);
    const onChange = vi.fn();
    const unsub = data.subscribe(TRIP_ID, onChange);
    await vi.advanceTimersByTimeAsync(4_000);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(onChange).toHaveBeenCalledTimes(1);
    unsub();
  });

  it("notices the trip ending", async () => {
    const { data } = makeClient([
      [200, withNow({ trip: trip(), participants: [] })],
      [410, { error: "ended", serverNow: 1_000_000 }],
    ]);
    const onChange = vi.fn();
    const unsub = data.subscribe(TRIP_ID, onChange);
    await vi.advanceTimersByTimeAsync(4_000);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(onChange).toHaveBeenCalledTimes(1);
    unsub();
  });

  it("keeps polling through a transient network failure", async () => {
    const calls: number[] = [];
    let n = 0;
    const fetchFn = vi.fn(async () => {
      n += 1;
      calls.push(n);
      if (n === 2) throw new TypeError("Failed to fetch");
      return new Response(
        JSON.stringify(withNow({ trip: trip(), participants: n >= 3 ? [participant()] : [] })),
        { status: 200 }
      );
    });
    const data = createHttpData({
      baseUrl: "https://api.test",
      session: { get: async () => SESSION, peek: () => SESSION, clear: () => {} },
      fetchFn: fetchFn as unknown as typeof fetch,
      clock: createClock(() => 1_000_000),
    });
    const onChange = vi.fn();
    const unsub = data.subscribe(TRIP_ID, onChange);
    await vi.advanceTimersByTimeAsync(4_000); // baseline
    await vi.advanceTimersByTimeAsync(4_000); // throws, swallowed
    await vi.advanceTimersByTimeAsync(4_000); // recovers, participant appears
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(calls.length).toBe(3);
    unsub();
  });
});
