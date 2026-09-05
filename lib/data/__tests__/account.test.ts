import { describe, it, expect, vi } from "vitest";
import { createAccountClient, offlineAccount } from "../account";
import type { Session } from "../../session";

const SESSION: Session = { deviceId: "dev-1", token: "tok-1" };

function stub(replies: Array<[number, unknown]>) {
  const calls: Array<{ url: string; method: string; headers: Record<string, string>; body: unknown }> = [];
  const queue = [...replies];
  const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({
      url,
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body === undefined ? undefined : JSON.parse(init.body as string),
    });
    const [status, payload] = queue.shift() ?? [204, null];
    return new Response(status === 204 ? null : JSON.stringify(payload), { status });
  });
  const client = createAccountClient({
    baseUrl: "https://api.test",
    session: { get: async () => SESSION },
    fetchFn: fetchFn as unknown as typeof fetch,
  });
  return { client, calls, fetchFn };
}

describe("createAccountClient", () => {
  it("sends the credential to be verified server-side", () => {
    // The ID token is never trusted in the browser; the server checks its
    // signature and audience.
    const { client, calls } = stub([[200, { user: { displayName: "Ibrahim" } }]]);
    return client.signInWithGoogle("an-id-token").then((profile) => {
      expect(calls[0].url).toBe("https://api.test/v1/auth/google");
      expect(calls[0].method).toBe("POST");
      expect(calls[0].headers.Authorization).toBe("Bearer tok-1");
      expect(calls[0].body).toEqual({ idToken: "an-id-token" });
      expect(profile).toEqual({ displayName: "Ibrahim" });
    });
  });

  it("surfaces a rejected credential, because the user is watching", async () => {
    const { client } = stub([[401, { error: "unauthorized" }]]);
    await expect(client.signInWithGoogle("forged")).rejects.toThrow();
  });

  it("reads the current account", async () => {
    const { client, calls } = stub([[200, { user: { displayName: "Ibrahim" } }]]);
    expect(await client.me()).toEqual({ displayName: "Ibrahim" });
    expect(calls[0].url).toBe("https://api.test/v1/auth/me");
  });

  it("reports no account for an anonymous device", async () => {
    const { client } = stub([[200, { user: null }]]);
    expect(await client.me()).toBeNull();
  });

  it("treats an unreachable server as no account rather than an error", async () => {
    // The landing screen renders either way; failing here would block the app
    // on a network blip for a feature that is optional.
    const fetchFn = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const client = createAccountClient({
      baseUrl: "https://api.test",
      session: { get: async () => SESSION },
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(await client.me()).toBeNull();
  });

  it("treats a server error as no account", async () => {
    const { client } = stub([[500, { error: "internal" }]]);
    expect(await client.me()).toBeNull();
  });

  it("signs out", async () => {
    const { client, calls } = stub([[204, null]]);
    await client.signOut();
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.test/v1/auth/signout");
  });

  it("does not fail a sign-out the server never received", async () => {
    // The local state is cleared regardless; a stuck "signed in" UI would be
    // worse than a stale row.
    const fetchFn = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const client = createAccountClient({
      baseUrl: "https://api.test",
      session: { get: async () => SESSION },
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    await expect(client.signOut()).resolves.toBeUndefined();
  });
});

describe("offlineAccount", () => {
  it("has no account and cannot sign in", async () => {
    // With no API configured there is nowhere to verify a credential.
    expect(await offlineAccount.me()).toBeNull();
    await expect(offlineAccount.signInWithGoogle("x")).rejects.toThrow(/not available/i);
    await expect(offlineAccount.signOut()).resolves.toBeUndefined();
  });
});
