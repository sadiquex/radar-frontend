import type { Participant, Trip, TripInput } from "../types";
import type { Session } from "../session";
import type { Clock } from "../serverTime";
import { ApiError, type ApiErrorCode, type DataClient } from "./types";
import { normalizeShareCode } from "../shareCode";
import type { Realtime } from "../realtime";

// Only the scripted demo convoy legitimately writes as someone other than the
// caller. Any other id reaching those paths is a bug worth failing loudly on.
const DEMO_ID = /^demo-[a-z]{1,12}$/;

// Two sequential reads inside one refresh() must share a request; anything
// longer than a tick or two risks serving a stale join.
const STATE_COALESCE_MS = 400;

// Fallback cadence, used only while the live socket is down. Some networks
// and proxies block WebSockets outright, in which case this simply never
// stops — the group keeps updating, a few seconds behind.
const POLL_MS = 4_000;

interface StatePayload {
  trip: Trip;
  participants: Participant[];
  serverNow: number;
}

/** The subset of the session store this client needs. */
export interface SessionLike {
  get: () => Promise<Session>;
  peek: () => Session | null;
  clear: () => void;
}

export interface HttpDataDeps {
  baseUrl: string;
  session: SessionLike;
  fetchFn?: typeof fetch;
  clock: Clock;
  /** Omitted in tests that only exercise the request layer. */
  realtime?: Realtime;
}

const ERROR_CODES: readonly ApiErrorCode[] = [
  "unauthorized",
  "forbidden",
  "not_found",
  "ended",
  "expired",
  "invalid",
  "trip_full",
  "rate_limited",
  "internal",
  "offline",
];

function asErrorCode(value: unknown, status: number): ApiErrorCode {
  if (typeof value === "string" && (ERROR_CODES as readonly string[]).includes(value)) {
    return value as ApiErrorCode;
  }
  return status === 401 ? "unauthorized" : "internal";
}

export function createHttpData(deps: HttpDataDeps): DataClient {
  const { baseUrl, session, clock, realtime } = deps;
  const doFetch = deps.fetchFn ?? globalThis.fetch;

  // In-flight (and briefly settled) /state reads, keyed by trip.
  const stateCache = new Map<string, { at: number; promise: Promise<StatePayload> }>();

  // Subscribers per trip. Our own writes notify them synchronously, the way the
  // local store does; the poll below is only for changes made elsewhere.
  const listeners = new Map<string, Set<() => void>>();

  async function request<T>(
    path: string,
    init: { method?: string; body?: unknown } = {}
  ): Promise<T> {
    const { token } = await session.get();
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (init.body !== undefined) headers["Content-Type"] = "application/json";

    let res: Response;
    try {
      res = await doFetch(`${baseUrl}${path}`, {
        method: init.method ?? "GET",
        headers,
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      });
    } catch {
      // A dropped connection mid-journey is normal, not exceptional.
      throw new ApiError("offline", 0, "Network unavailable");
    }

    if (res.status === 204) return undefined as T;

    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }

    // Every response carries the server's clock, errors included — the Ended
    // screen and "last ping" both read it.
    const body = (payload ?? {}) as Record<string, unknown>;
    if (typeof body.serverNow === "number") clock.record(body.serverNow);

    if (!res.ok) {
      throw new ApiError(asErrorCode(body.error, res.status), res.status);
    }
    return payload as T;
  }

  /** Reads a trip's state, sharing one request between callers in the same tick. */
  function readState(tripId: string): Promise<StatePayload> {
    const hit = stateCache.get(tripId);
    if (hit !== undefined && Date.now() - hit.at < STATE_COALESCE_MS) return hit.promise;

    const promise = request<StatePayload>(`/v1/trips/${tripId}/state`);
    stateCache.set(tripId, { at: Date.now(), promise });
    // A failed read must not be served to the next caller.
    promise.catch(() => stateCache.delete(tripId));
    return promise;
  }

  const invalidate = (tripId: string) => void stateCache.delete(tripId);

  function announce(tripId: string): void {
    const set = listeners.get(tripId);
    if (set === undefined) return;
    // Copied, so an unsubscribe inside a handler cannot corrupt the iteration.
    for (const fn of [...set]) fn();
  }

  /** Every mutation drops the cache and tells this tab's subscribers. */
  function changed(tripId: string): void {
    invalidate(tripId);
    announce(tripId);
  }

  /** A cheap signature of everything a screen renders, for change detection. */
  function signature(state: StatePayload | null): string {
    if (state === null) return "gone";
    const members = state.participants
      .map((p) => `${p.id}:${p.displayName}:${p.latitude}:${p.longitude}:${p.lastMovedAt}`)
      .sort()
      .join("|");
    return `${state.trip.endedAt}:${state.trip.expiresAt}:${members}`;
  }

  return {
    async createTrip(input: TripInput): Promise<Trip> {
      // creatorId is deliberately unused: the server derives ownership from
      // the session token.
      const { trip } = await request<{ trip: Trip }>("/v1/trips", {
        method: "POST",
        body: input,
      });
      return trip;
    },

    async getTripByCode(code: string): Promise<Trip | null> {
      const normalized = normalizeShareCode(code);
      // Screens treat "no trip" as one outcome, so a code that could never be
      // valid never reaches the network.
      if (normalized === null) return null;
      try {
        const { trip } = await request<{ trip: Trip }>(`/v1/trips/by-code/${normalized}`);
        return trip;
      } catch (err) {
        if (err instanceof ApiError && isGoneOrHidden(err)) return null;
        throw err;
      }
    },

    async getTripById(id: string): Promise<Trip | null> {
      try {
        return (await readState(id)).trip;
      } catch (err) {
        if (err instanceof ApiError && isGoneOrHidden(err)) return null;
        throw err;
      }
    },

    async listParticipants(tripId: string): Promise<Participant[]> {
      try {
        return (await readState(tripId)).participants;
      } catch (err) {
        if (err instanceof ApiError && isGoneOrHidden(err)) return [];
        throw err;
      }
    },

    async joinTrip(tripId: string, participantId: string, displayName: string) {
      const mine = session.peek()?.deviceId;
      const path =
        participantId === mine || !DEMO_ID.test(participantId)
          ? `/v1/trips/${tripId}/participants`
          : `/v1/trips/${tripId}/participants/demo`;
      const body =
        path.endsWith("/demo") ? { id: participantId, displayName } : { displayName };

      const { participant } = await request<{ participant: Participant }>(path, {
        method: "POST",
        body,
      });
      changed(tripId);
      return participant;
    },

    async updatePosition(tripId: string, participantId: string, pos) {
      const mine = session.peek()?.deviceId;
      let path: string;
      if (participantId === mine) {
        path = `/v1/trips/${tripId}/participants/me`;
      } else if (DEMO_ID.test(participantId)) {
        path = `/v1/trips/${tripId}/participants/${participantId}`;
      } else {
        // Guard rather than silently writing to /me: a call site that means to
        // move someone else has a bug, and it should be loud here.
        throw new Error(
          `Refusing to write ${participantId}: a device may only write its own position`
        );
      }

      const { participant } = await request<{ participant: Participant }>(path, {
        method: "PATCH",
        body: pos,
      });
      changed(tripId);
      return participant;
    },

    async leaveTrip(tripId: string): Promise<void> {
      await request<void>(`/v1/trips/${tripId}/participants/me`, { method: "DELETE" });
      changed(tripId);
    },

    async endTrip(tripId: string): Promise<void> {
      await request<{ trip: Trip }>(`/v1/trips/${tripId}/end`, { method: "POST" });
      changed(tripId);
    },

    subscribe(tripId: string, onChange: () => void): () => void {
      let stopped = false;
      let last: string | null = null;
      let pollHandle: ReturnType<typeof setInterval> | null = null;

      // This tab's own writes announce themselves (see `changed`), which is
      // what the local store does and what the screens are written against.
      const set = listeners.get(tripId) ?? new Set<() => void>();
      set.add(onChange);
      listeners.set(tripId, set);

      const notify = () => {
        if (stopped) return;
        // The socket only says "something changed", so drop the cached read
        // before the screen goes looking.
        invalidate(tripId);
        onChange();
      };

      // Fallback path. Compares a signature rather than notifying blindly, so
      // an idle trip does not re-render every few seconds.
      const poll = async () => {
        if (stopped) return;
        let next: string;
        try {
          invalidate(tripId);
          next = signature(await readState(tripId));
        } catch (err) {
          // A gone trip is a change worth reporting. A dropped connection is
          // not — keep polling and let it recover.
          if (err instanceof ApiError && isGoneOrHidden(err)) next = "gone";
          else return;
        }
        if (stopped) return;
        // The first sample only establishes a baseline.
        if (last !== null && next !== last) onChange();
        last = next;
      };

      const startPolling = () => {
        if (stopped || pollHandle !== null) return;
        pollHandle = setInterval(() => void poll(), POLL_MS);
      };
      const stopPolling = () => {
        if (pollHandle !== null) clearInterval(pollHandle);
        pollHandle = null;
        // Forget the baseline: the next fallback stretch re-establishes one
        // rather than comparing against state from before the outage.
        last = null;
      };

      // Poll from the outset and keep polling until the socket proves itself.
      // A network that blocks WebSockets therefore degrades instead of going
      // silent, with no special case for it anywhere.
      startPolling();

      const unwatch =
        realtime === undefined
          ? () => {}
          : realtime.watch(tripId, {
              onChange: notify,
              onHealth: (up) => (up ? stopPolling() : startPolling()),
            });

      return () => {
        stopped = true;
        stopPolling();
        unwatch();
        const current = listeners.get(tripId);
        current?.delete(onChange);
        if (current !== undefined && current.size === 0) listeners.delete(tripId);
      };
    },
  };
}

// From a screen's point of view, "expired", "ended", "never existed" and
// "you are not in this trip" all mean the same thing: leave.
function isGoneOrHidden(err: ApiError): boolean {
  return (
    err.code === "not_found" ||
    err.code === "ended" ||
    err.code === "expired" ||
    err.code === "forbidden"
  );
}
