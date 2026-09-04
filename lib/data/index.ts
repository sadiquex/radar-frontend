import { createLocalAsyncData } from "./localAsync";
import { createHttpData } from "./http";
import { selectBackend, normalizeBaseUrl } from "./select";
import { createSessionStore, type Session } from "../session";
import { getClientId } from "../clientId";
import { generateShareCode } from "../shareCode";
import { recordServerTime, serverNow, clockOffsetMs } from "../serverTime";
import { createRealtime } from "../realtime";
import type { DataClient } from "./types";
import type { StorageLike } from "./local";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const BACKEND = selectBackend(API_URL);

// SSR-safe storage: real localStorage in the browser, a throwaway map on the
// server. Route components are "use client", so a server-side read here just
// returns empty rather than crashing the render.
function getStorage(): StorageLike {
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

// ── The API-backed implementation ───────────────────────────────────────────

function createApiClient(baseUrl: string): { data: DataClient; identity: () => Promise<string> } {
  const session = createSessionStore({
    storage: getStorage(),
    // The one unauthenticated call in the app: exchange nothing for an identity.
    requestDevice: async (): Promise<Session> => {
      const res = await fetch(`${baseUrl}/v1/devices`, { method: "POST" });
      if (!res.ok) throw new Error(`Could not register this device (${res.status})`);
      const body = (await res.json()) as Session & { serverNow?: number };
      if (typeof body.serverNow === "number") recordServerTime(body.serverNow);
      return { deviceId: body.deviceId, token: body.token };
    },
  });

  const data = createHttpData({
    baseUrl,
    session,
    clock: { now: serverNow, record: recordServerTime, offsetMs: clockOffsetMs },
    // Live updates over a WebSocket, with the poll kept as a fallback for
    // networks that block them.
    realtime: createRealtime({ baseUrl, session }),
  });

  return {
    data,
    identity: async () => (await session.get()).deviceId,
  };
}

// ── The offline implementation ──────────────────────────────────────────────

function createOfflineClient(): { data: DataClient; identity: () => Promise<string> } {
  const data = createLocalAsyncData({
    storage: getStorage(),
    genId: () => crypto.randomUUID(),
    genCode: () => generateShareCode(),
    now: () => Date.now(),
  });
  // Offline identity stays the original per-browser UUID.
  return { data, identity: async () => getClientId() };
}

const active = BACKEND === "http" ? createApiClient(normalizeBaseUrl(API_URL!)) : createOfflineClient();

/** The single data layer every screen talks to. */
export const data: DataClient = active.data;

/**
 * This device's participant id. Async because the API mints it on first use.
 * Only call it on the client — it touches localStorage.
 */
export const getIdentity = active.identity;

/** Which implementation is live. Surfaced so a screen can explain itself. */
export const backend = BACKEND;

export { ApiError, isTripGone, isNotMember } from "./types";
export type { DataClient } from "./types";
