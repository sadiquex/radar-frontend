import { describe, it, expect, afterEach } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import WebSocket from "ws";
import { createRealtime, type SocketLike } from "../../realtime";

// The other half of the live-updates claim: when the connection dies, it comes
// back by itself. Riding through a tunnel is the normal case, and a socket that
// never recovers means the group silently stops updating for the rest of the trip.
//
//   CARAVAN_RECONNECT_TEST=1 npx vitest run reconnect.live
const ENABLED = process.env.CARAVAN_RECONNECT_TEST === "1";
const suite = ENABLED ? describe : describe.skip;

const PORT = 8791;
const BASE = `http://127.0.0.1:${PORT}`;
const API_DIR = new URL("../../../../backend", import.meta.url).pathname;

let api: ChildProcess | null = null;

async function startApi(): Promise<void> {
  api = spawn("npx", ["tsx", "src/server.ts"], {
    cwd: API_DIR,
    // Its own process group: `npx` spawns tsx which spawns node, and killing
    // only npx leaves the actual server running — which made this test pass
    // while proving nothing.
    detached: true,
    env: {
      ...process.env,
      PORT: String(PORT),
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        "postgres://caravan:caravan@localhost:5436/caravan_test",
      ALLOWED_ORIGINS: "http://localhost:3000",
    },
    stdio: "ignore",
  });
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(`${BASE}/v1/health`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("api did not start");
}

async function stopApi(): Promise<void> {
  const proc = api;
  api = null;
  if (proc === null || proc.pid === undefined) return;
  try {
    // Negative pid: the whole group, including the node process npx spawned.
    process.kill(-proc.pid, "SIGKILL");
  } catch {
    proc.kill("SIGKILL");
  }
  // Wait for the port to actually free up before rebinding it.
  for (let i = 0; i < 80; i++) {
    try {
      await fetch(`${BASE}/v1/health`);
    } catch {
      return;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
}

const post = (path: string, token?: string, body?: unknown) =>
  fetch(`${BASE}/v1${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }).then((r) => r.json());

async function waitFor(predicate: () => boolean, timeoutMs: number, label: string) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`timed out waiting for ${label}`);
}

suite("live socket recovery", () => {
  afterEach(stopApi);

  it("reconnects by itself after the connection dies, and re-reads what it missed", async () => {
    await startApi();

    const me = await post("/devices");
    const other = await post("/devices");
    const { trip } = await post("/trips", me.token, { name: "Tunnel Run" });
    await post(`/trips/${trip.id}/participants`, me.token, { displayName: "Ibrahim" });
    await post(`/trips/${trip.id}/participants`, other.token, { displayName: "Kojo" });

    const health: boolean[] = [];
    let changes = 0;
    const realtime = createRealtime({
      baseUrl: BASE,
      session: { get: async () => ({ deviceId: me.deviceId, token: me.token }) },
      openSocket: (url) => new WebSocket(url) as unknown as SocketLike,
    });
    const stop = realtime.watch(trip.id, {
      onChange: () => {
        changes += 1;
      },
      onHealth: (up) => health.push(up),
    });

    try {
      // 1. Connected.
      await waitFor(() => health.at(-1) === true, 8_000, "the first connection");

      // 2. The connection dies under it — the equivalent of losing signal.
      await stopApi();
      await waitFor(() => health.at(-1) === false, 8_000, "the drop to be noticed");

      // 3. A change happens while it is away, which the socket cannot replay.
      await startApi();
      await post(`/trips/${trip.id}/participants`, other.token, { displayName: "Kojo K." });

      // 4. It comes back on its own, with no intervention.
      await waitFor(() => health.at(-1) === true, 20_000, "the reconnection");

      // 5. And reports a change on the way in, so the screen re-reads rather
      //    than showing state from before the outage.
      await waitFor(() => changes >= 1, 5_000, "the catch-up change");

      // 6. Live again: a fresh change is delivered normally.
      const before = changes;
      await post(`/trips/${trip.id}/participants`, other.token, { displayName: "Kojo B." });
      await waitFor(() => changes > before, 5_000, "a change after recovery");
    } finally {
      stop();
    }
  }, 90_000);
});
