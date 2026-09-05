import { describe, it, expect, vi } from "vitest";
import { createNotificationsClient } from "../notifications";
import type { Session } from "../../session";

const SESSION: Session = { deviceId: "dev-1", token: "tok-1" };
const TRIP = "trip-1";

function stub(replies: Array<[number, unknown]>) {
  const calls: Array<{ url: string; method: string; headers: Record<string, string>; body: unknown }> =
    [];
  const queue = [...replies];
  const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({
      url,
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body === undefined ? undefined : JSON.parse(init.body as string),
    });
    const next = queue.shift() ?? [204, null];
    const [status, payload] = next;
    return new Response(status === 204 ? null : JSON.stringify(payload), { status });
  });
  const client = createNotificationsClient({
    baseUrl: "https://api.test",
    session: { get: async () => SESSION },
    fetchFn: fetchFn as unknown as typeof fetch,
  });
  return { client, calls, fetchFn };
}

const KEYS = { endpoint: "https://push.example/me", keys: { p256dh: "k", auth: "s" } };

describe("createNotificationsClient", () => {
  it("registers a subscription", async () => {
    const { client, calls } = stub([[204, null]]);
    await client.subscribe(KEYS);
    expect(calls[0].url).toBe("https://api.test/v1/push/subscriptions");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].headers.Authorization).toBe("Bearer tok-1");
    expect(calls[0].body).toEqual(KEYS);
  });

  it("removes a subscription", async () => {
    const { client, calls } = stub([[204, null]]);
    await client.unsubscribe();
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toBe("https://api.test/v1/push/subscriptions");
  });

  it("reports a status change", async () => {
    const { client, calls } = stub([[202, { pushed: true, delivered: 2 }]]);
    await client.report(TRIP, "dev-2", "arrived");
    expect(calls[0].url).toBe(`https://api.test/v1/trips/${TRIP}/alerts`);
    expect(calls[0].body).toEqual({ participantId: "dev-2", status: "arrived" });
  });

  it("sends a status, never a message", async () => {
    // The server renders the words. A member is trusted to be in the trip,
    // not to write what everyone else's phone displays.
    const { client, calls } = stub([[202, { pushed: true }]]);
    await client.report(TRIP, "dev-2", "stopped");
    expect(calls[0].body).not.toHaveProperty("body");
    expect(Object.keys(calls[0].body as object).sort()).toEqual(["participantId", "status"]);
  });

  it("swallows a failed report", async () => {
    // An alert is a nicety layered on top of a screen that is already correct.
    // Failing to send one must never surface as an error in the group view.
    const { client } = stub([[500, { error: "internal" }]]);
    await expect(client.report(TRIP, "dev-2", "arrived")).resolves.toBeUndefined();
  });

  it("swallows a report that could not be sent at all", async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const client = createNotificationsClient({
      baseUrl: "https://api.test",
      session: { get: async () => SESSION },
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    await expect(client.report(TRIP, "dev-2", "arrived")).resolves.toBeUndefined();
  });

  it("surfaces a failed subscribe, because the toggle has to be honest", async () => {
    // Unlike a report, this one the user is watching: the bell must not claim
    // alerts are on when the server never stored the subscription.
    const { client } = stub([[500, { error: "internal" }]]);
    await expect(client.subscribe(KEYS)).rejects.toThrow();
  });

  it("does not report the same status twice in a row from this device", async () => {
    // The server de-duplicates across the group; this saves the round trip
    // when one device re-renders repeatedly with no real change.
    const { client, fetchFn } = stub([
      [202, { pushed: true }],
      [202, { pushed: false }],
    ]);
    await client.report(TRIP, "dev-2", "arrived");
    await client.report(TRIP, "dev-2", "arrived");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("reports again once the status actually changes", async () => {
    const { client, fetchFn } = stub([
      [202, { pushed: true }],
      [202, { pushed: true }],
    ]);
    await client.report(TRIP, "dev-2", "arrived");
    await client.report(TRIP, "dev-2", "behind");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("tracks each member separately", async () => {
    const { client, fetchFn } = stub([
      [202, { pushed: true }],
      [202, { pushed: true }],
    ]);
    await client.report(TRIP, "dev-2", "arrived");
    await client.report(TRIP, "dev-3", "arrived");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});

describe("the offline notifications client", () => {
  it("accepts everything and does nothing", async () => {
    const { offlineNotifications } = await import("../notifications");
    await expect(offlineNotifications.subscribe(KEYS)).resolves.toBeUndefined();
    await expect(offlineNotifications.unsubscribe()).resolves.toBeUndefined();
    await expect(offlineNotifications.report(TRIP, "x", "arrived")).resolves.toBeUndefined();
  });
});
