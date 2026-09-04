import type { Session } from "./session";

/**
 * The live channel: one WebSocket per watched trip.
 *
 * The server's messages carry no payload — just "this trip changed" — so the
 * screen re-reads through the normal authorized endpoint. That keeps the
 * authorization in one place and means a missed message costs a re-read
 * rather than a wrong screen.
 *
 * Reconnection is the interesting part. A phone in a convoy loses signal
 * constantly, and a socket that dies without recovering means the group
 * silently stops updating for the rest of the journey.
 */

/** The bit of WebSocket this module uses, so tests can supply their own. */
export interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: (() => void) | null;
  onmessage: ((e: { data: string }) => void) | null;
  onclose: ((e: { code: number }) => void) | null;
  onerror: (() => void) | null;
}

export interface RealtimeDeps {
  baseUrl: string;
  session: { get: () => Promise<Session> };
  openSocket?: (url: string) => SocketLike;
  random?: () => number;
}

export interface WatchHandlers {
  /** Something changed — re-read the trip. */
  onChange: () => void;
  /** Whether the live channel is currently up. */
  onHealth: (connected: boolean) => void;
  /** The server refused us for good: ended, expired, or not a member. */
  onRefused?: (reason: string) => void;
}

const OPEN = 1;
const POLICY_VIOLATION = 1008;

const BACKOFF_BASE_MS = 500;
const BACKOFF_CAP_MS = 20_000;
const JITTER = 0.3;

function toWebSocketUrl(baseUrl: string, tripId: string): string {
  const url = new URL(`${baseUrl}/v1/trips/${tripId}/events`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

export function createRealtime(deps: RealtimeDeps) {
  const { baseUrl, session } = deps;
  const random = deps.random ?? Math.random;
  const openSocket =
    deps.openSocket ?? ((url: string) => new WebSocket(url) as unknown as SocketLike);

  return {
    /** Watches one trip. Returns a function that stops watching. */
    watch(tripId: string, handlers: WatchHandlers): () => void {
      const url = toWebSocketUrl(baseUrl, tripId);
      let stopped = false;
      let socket: SocketLike | null = null;
      let retryTimer: ReturnType<typeof setTimeout> | null = null;
      let attempt = 0;
      // Only after a first successful connection: the very first read is the
      // screen's own, so re-reading again immediately would be wasted.
      let hasConnectedBefore = false;

      const nextDelay = (): number => {
        const flat = Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_CAP_MS);
        // Jitter keeps a whole convoy coming back from one dead cell tower
        // from reconnecting in lockstep.
        const spread = flat * JITTER;
        return Math.round(flat - spread + random() * spread * 2);
      };

      function scheduleRetry(): void {
        if (stopped || retryTimer !== null) return;
        const delay = nextDelay();
        attempt += 1;
        retryTimer = setTimeout(() => {
          retryTimer = null;
          connect();
        }, delay);
      }

      function connect(): void {
        if (stopped) return;
        const ws = openSocket(url);
        socket = ws;

        ws.onopen = () => {
          // The token comes from an async lookup, so the socket may already
          // be gone by the time it resolves.
          void session
            .get()
            .then(({ token }) => {
              if (stopped || socket !== ws || ws.readyState !== OPEN) return;
              ws.send(JSON.stringify({ type: "auth", token }));
            })
            .catch(() => {
              // No identity, no channel. The retry will try again.
              try {
                ws.close();
              } catch {
                /* already gone */
              }
            });
        };

        ws.onmessage = (e) => {
          if (stopped || socket !== ws) return;
          let msg: { type?: unknown; error?: unknown };
          try {
            msg = JSON.parse(e.data) as { type?: unknown; error?: unknown };
          } catch {
            return;
          }

          switch (msg.type) {
            case "ready": {
              attempt = 0;
              handlers.onHealth(true);
              // A socket cannot replay what it missed while it was down, so
              // the screen has to re-read on the way back in.
              if (hasConnectedBefore) handlers.onChange();
              hasConnectedBefore = true;
              return;
            }
            case "changed":
              handlers.onChange();
              return;
            case "ping":
              if (ws.readyState === OPEN) {
                try {
                  ws.send(JSON.stringify({ type: "pong" }));
                } catch {
                  /* closing */
                }
              }
              return;
            case "error":
              if (typeof msg.error === "string") handlers.onRefused?.(msg.error);
              return;
            default:
              return;
          }
        };

        ws.onerror = () => {
          // A close always follows; retrying is handled there.
        };

        ws.onclose = (e) => {
          if (stopped || socket !== ws) return;
          socket = null;
          handlers.onHealth(false);
          // 1008 is the server telling us this will never work: the trip
          // ended, or we are not a member. Retrying would hammer it forever.
          if (e.code === POLICY_VIOLATION) return;
          scheduleRetry();
        };
      }

      connect();

      return () => {
        stopped = true;
        if (retryTimer !== null) clearTimeout(retryTimer);
        retryTimer = null;
        const ws = socket;
        socket = null;
        try {
          ws?.close(1000, "unsubscribed");
        } catch {
          /* already gone */
        }
      };
    },
  };
}

export type Realtime = ReturnType<typeof createRealtime>;
