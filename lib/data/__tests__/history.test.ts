import { describe, it, expect, vi } from "vitest";
import { createHistoryClient, offlineHistory } from "../history";
import type { Session } from "../../session";

const SESSION: Session = { deviceId: "dev-1", token: "tok-1" };

function stub(replies: Array<[number, unknown]>) {
  const calls: Array<{ url: string; method: string; headers: Record<string, string> }> = [];
  const queue = [...replies];
  const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({
      url,
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    const [status, payload] = queue.shift() ?? [204, null];
    return new Response(status === 204 ? null : JSON.stringify(payload), { status });
  });
  const client = createHistoryClient({
    baseUrl: "https://api.test",
    session: { get: async () => SESSION },
    fetchFn: fetchFn as unknown as typeof fetch,
  });
  return { client, calls };
}

/** A client whose every request rejects, the way an offline phone behaves. */
function unreachable() {
  return createHistoryClient({
    baseUrl: "https://api.test",
    session: { get: async () => SESSION },
    fetchFn: (() => Promise.reject(new Error("network"))) as unknown as typeof fetch,
  });
}

const PAST = {
  kind: "past" as const,
  tripId: "t1",
  name: "Sunday ride",
  destinationName: "Kumasi",
  destinationLat: 6.6885,
  destinationLng: -1.6244,
  startedAt: 1,
  finishedAt: 2,
  finishReason: "ended" as const,
  wasCreator: true,
  youLeftEarly: false,
  finishers: [{ name: "Ibrahim", arrived: true }],
};

describe("createHistoryClient", () => {
  it("reads the running trips", async () => {
    const { client, calls } = stub([[200, { trips: [] }]]);
    expect(await client.live()).toEqual([]);
    expect(calls[0]!.url).toBe("https://api.test/v1/me/trips/live");
    expect(calls[0]!.headers.Authorization).toBe("Bearer tok-1");
  });

  it("reads a page of history", async () => {
    const { client, calls } = stub([[200, { trips: [PAST], nextCursor: "abc" }]]);
    const page = await client.list();
    expect(page.trips).toEqual([PAST]);
    expect(page.nextCursor).toBe("abc");
    expect(calls[0]!.url).toBe("https://api.test/v1/me/trips");
  });

  it("follows a cursor to the next page", async () => {
    const { client, calls } = stub([[200, { trips: [], nextCursor: null }]]);
    await client.list("cur+sor/value");
    // Encoded: a base64url cursor is safe, but nothing here should depend on
    // the server's chosen alphabet staying URL-safe forever.
    expect(calls[0]!.url).toBe("https://api.test/v1/me/trips?cursor=cur%2Bsor%2Fvalue");
  });

  it("treats a missing nextCursor as the last page", async () => {
    const { client } = stub([[200, { trips: [PAST] }]]);
    expect((await client.list()).nextCursor).toBeNull();
  });

  it("reads one trip", async () => {
    const { client, calls } = stub([[200, { trip: PAST }]]);
    expect(await client.get("t1")).toEqual(PAST);
    expect(calls[0]!.url).toBe("https://api.test/v1/me/trips/t1");
  });

  it("reports a trip that is not this account's as null", async () => {
    const { client } = stub([[404, { error: "not_found" }]]);
    expect(await client.get("someone-elses")).toBeNull();
  });

  it("degrades an anonymous device to empty rather than to an error", async () => {
    // /v1/me answers 401 for a device with no account, and every screen that
    // reads this renders correctly against an empty list.
    const { client } = stub([
      [401, { error: "unauthorized" }],
      [401, { error: "unauthorized" }],
    ]);
    expect(await client.live()).toEqual([]);
    expect(await client.list()).toEqual({ trips: [], nextCursor: null });
  });

  it("degrades an unreachable server to empty", async () => {
    const client = unreachable();
    expect(await client.live()).toEqual([]);
    expect(await client.list()).toEqual({ trips: [], nextCursor: null });
    expect(await client.get("t1")).toBeNull();
  });

  it("removes one trip", async () => {
    const { client, calls } = stub([[204, null]]);
    await client.forget("t1");
    expect(calls[0]!.method).toBe("DELETE");
    expect(calls[0]!.url).toBe("https://api.test/v1/me/trips/t1");
  });

  it("surfaces a failed deletion, because the user is watching", async () => {
    // The one place this client is not allowed to be quiet: silently doing
    // nothing to a row somebody asked to remove is the worst outcome here.
    const { client } = stub([[500, { error: "internal" }]]);
    await expect(client.forget("t1")).rejects.toThrow();
  });

  it("clears everything", async () => {
    const { client, calls } = stub([[204, null]]);
    await client.forgetAll();
    expect(calls[0]!.method).toBe("DELETE");
    expect(calls[0]!.url).toBe("https://api.test/v1/me/trips");
  });

  it("surfaces a failed clear too", async () => {
    const { client } = stub([[500, { error: "internal" }]]);
    await expect(client.forgetAll()).rejects.toThrow();
  });
});

describe("offlineHistory", () => {
  it("has nothing, because without an API there are no accounts", async () => {
    expect(await offlineHistory.live()).toEqual([]);
    expect(await offlineHistory.list()).toEqual({ trips: [], nextCursor: null });
    expect(await offlineHistory.get("t1")).toBeNull();
  });

  it("does not throw when asked to delete", async () => {
    await expect(offlineHistory.forget("t1")).resolves.toBeUndefined();
    await expect(offlineHistory.forgetAll()).resolves.toBeUndefined();
  });
});
