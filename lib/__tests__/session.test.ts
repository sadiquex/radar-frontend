import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSessionStore, SESSION_KEY, type Session } from "../session";

function memoryStorage(seed: Record<string, string> = {}) {
  const m = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    _dump: () => Object.fromEntries(m),
  };
}

const DEVICE = { deviceId: "dev-1", token: "tok-1" };

describe("createSessionStore", () => {
  let storage: ReturnType<typeof memoryStorage>;
  let requestDevice: (() => Promise<Session>) & { mock: { calls: unknown[] } };

  beforeEach(() => {
    storage = memoryStorage();
    requestDevice = vi.fn(async (): Promise<Session> => DEVICE);
  });

  it("asks the server for an identity on first use", async () => {
    const store = createSessionStore({ storage, requestDevice });
    expect(await store.get()).toEqual(DEVICE);
    expect(requestDevice).toHaveBeenCalledTimes(1);
  });

  it("persists the identity so a reload keeps the same device", async () => {
    const store = createSessionStore({ storage, requestDevice });
    await store.get();

    const neverCalled = vi.fn(async (): Promise<Session> => {
      throw new Error("must not ask the server when an identity is stored");
    });
    const fresh = createSessionStore({ storage, requestDevice: neverCalled });
    expect(await fresh.get()).toEqual(DEVICE);
  });

  it("does not ask the server twice", async () => {
    const store = createSessionStore({ storage, requestDevice });
    await store.get();
    await store.get();
    expect(requestDevice).toHaveBeenCalledTimes(1);
  });

  it("creates only one device when called concurrently", async () => {
    // The group screen resolves identity while the geolocation hook is already
    // asking for it. Two devices here would mean joining as a stranger.
    const store = createSessionStore({ storage, requestDevice });
    const [a, b, c] = await Promise.all([store.get(), store.get(), store.get()]);
    expect(requestDevice).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  it("retries after a failed creation rather than caching the failure", async () => {
    const failing = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(DEVICE);
    const store = createSessionStore({ storage, requestDevice: failing });

    await expect(store.get()).rejects.toThrow("offline");
    expect(await store.get()).toEqual(DEVICE);
  });

  it("peeks without touching the network", () => {
    const store = createSessionStore({ storage, requestDevice });
    expect(store.peek()).toBeNull();
    expect(requestDevice).not.toHaveBeenCalled();
  });

  it("peeks a stored identity synchronously, for render paths", async () => {
    const store = createSessionStore({ storage, requestDevice });
    await store.get();
    expect(store.peek()).toEqual(DEVICE);
  });

  it("ignores corrupt stored data and re-registers", async () => {
    const corrupt = memoryStorage({ [SESSION_KEY]: "{not json" });
    const store = createSessionStore({ storage: corrupt, requestDevice });
    expect(await store.get()).toEqual(DEVICE);
  });

  it("ignores stored data missing a token and re-registers", async () => {
    const partial = memoryStorage({ [SESSION_KEY]: JSON.stringify({ deviceId: "dev-9" }) });
    const store = createSessionStore({ storage: partial, requestDevice });
    expect(await store.get()).toEqual(DEVICE);
  });

  it("survives a storage that throws on read", async () => {
    // Private browsing and "block site data" both make localStorage throw
    // rather than return null.
    const hostile = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {},
    };
    const store = createSessionStore({ storage: hostile, requestDevice });
    expect(await store.get()).toEqual(DEVICE);
    expect(store.peek()).toEqual(DEVICE);
  });

  it("clears the identity", async () => {
    const store = createSessionStore({ storage, requestDevice });
    await store.get();
    store.clear();
    expect(store.peek()).toBeNull();
    expect(await store.get()).toEqual(DEVICE);
    expect(requestDevice).toHaveBeenCalledTimes(2);
  });
});
