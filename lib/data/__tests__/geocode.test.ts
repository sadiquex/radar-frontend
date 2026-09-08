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
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) =>
      reply(200, { places: [PLACE], serverNow: 1 }));
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
