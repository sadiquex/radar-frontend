import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRealtime, type SocketLike } from "../realtime";
import type { Session } from "../session";

const SESSION: Session = { deviceId: "dev-1", token: "tok-1" };
const TRIP = "trip-1";

/** A WebSocket stand-in the test drives by hand. */
class FakeSocket implements SocketLike {
  static instances: FakeSocket[] = [];
  static latest(): FakeSocket {
    const s = FakeSocket.instances.at(-1);
    if (!s) throw new Error("no socket was opened");
    return s;
  }

  readyState = 0;
  sent: string[] = [];
  closedWith: { code?: number; reason?: string } | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }

  send(data: string) {
    if (this.readyState !== 1) throw new Error("not open");
    this.sent.push(data);
  }

  close(code?: number, reason?: string) {
    this.closedWith = { code, reason };
    this.readyState = 3;
  }

  // ── test drivers ──
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  deliver(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
  serverClose(code = 1006) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

function setup(baseUrl = "https://api.caravan.app") {
  FakeSocket.instances = [];
  const onChange = vi.fn();
  const onHealth = vi.fn();
  const realtime = createRealtime({
    baseUrl,
    session: { get: async () => SESSION },
    openSocket: (url) => new FakeSocket(url),
    // Deterministic backoff: no jitter, so delays are exact.
    random: () => 0.5,
  });
  return { realtime, onChange, onHealth };
}

/** Opens, authenticates and readies the newest socket. */
async function handshake() {
  await vi.advanceTimersByTimeAsync(0);
  const ws = FakeSocket.latest();
  ws.open();
  await vi.advanceTimersByTimeAsync(0);
  ws.deliver({ type: "ready" });
  return ws;
}

describe("createRealtime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("connects to the trip's event stream over ws", async () => {
    const { realtime, onChange, onHealth } = setup();
    const stop = realtime.watch(TRIP, { onChange, onHealth });
    await vi.advanceTimersByTimeAsync(0);
    expect(FakeSocket.latest().url).toBe(`wss://api.caravan.app/v1/trips/${TRIP}/events`);
    stop();
  });

  it("uses ws:// for a plain http API, for local development", async () => {
    const { realtime, onChange, onHealth } = setup("http://localhost:8787");
    const stop = realtime.watch(TRIP, { onChange, onHealth });
    await vi.advanceTimersByTimeAsync(0);
    expect(FakeSocket.latest().url).toBe(`ws://localhost:8787/v1/trips/${TRIP}/events`);
    stop();
  });

  it("sends the token in the first frame", async () => {
    // A browser cannot set headers on a WebSocket, and a token in the query
    // string would land in every access log on the way.
    const { realtime, onChange, onHealth } = setup();
    const stop = realtime.watch(TRIP, { onChange, onHealth });
    await vi.advanceTimersByTimeAsync(0);
    const ws = FakeSocket.latest();
    ws.open();
    await vi.advanceTimersByTimeAsync(0);
    expect(JSON.parse(ws.sent[0])).toEqual({ type: "auth", token: "tok-1" });
    stop();
  });

  it("reports healthy once the server says ready", async () => {
    const { realtime, onChange, onHealth } = setup();
    const stop = realtime.watch(TRIP, { onChange, onHealth });
    await handshake();
    expect(onHealth).toHaveBeenCalledWith(true);
    stop();
  });

  it("reports a change", async () => {
    const { realtime, onChange, onHealth } = setup();
    const stop = realtime.watch(TRIP, { onChange, onHealth });
    const ws = await handshake();
    ws.deliver({ type: "changed" });
    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
  });

  it("does not treat the ready frame as a change", async () => {
    const { realtime, onChange, onHealth } = setup();
    const stop = realtime.watch(TRIP, { onChange, onHealth });
    await handshake();
    expect(onChange).not.toHaveBeenCalled();
    stop();
  });

  it("answers a ping so the server does not hang up", async () => {
    const { realtime, onChange, onHealth } = setup();
    const stop = realtime.watch(TRIP, { onChange, onHealth });
    const ws = await handshake();
    ws.deliver({ type: "ping" });
    expect(JSON.parse(ws.sent.at(-1)!)).toEqual({ type: "pong" });
    stop();
  });

  it("ignores a malformed frame", async () => {
    const { realtime, onChange, onHealth } = setup();
    const stop = realtime.watch(TRIP, { onChange, onHealth });
    const ws = await handshake();
    expect(() => ws.onmessage?.({ data: "not json" })).not.toThrow();
    expect(() => ws.deliver({ type: "who-knows" })).not.toThrow();
    expect(onChange).not.toHaveBeenCalled();
    stop();
  });

  it("reports unhealthy when the connection drops", async () => {
    const { realtime, onChange, onHealth } = setup();
    const stop = realtime.watch(TRIP, { onChange, onHealth });
    const ws = await handshake();
    onHealth.mockClear();
    ws.serverClose();
    expect(onHealth).toHaveBeenCalledWith(false);
    stop();
  });

  it("reconnects after an unexpected drop", async () => {
    // Riding through a tunnel is the normal case, not the exceptional one.
    const { realtime, onChange, onHealth } = setup();
    const stop = realtime.watch(TRIP, { onChange, onHealth });
    const ws = await handshake();
    ws.serverClose();
    expect(FakeSocket.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(600);
    expect(FakeSocket.instances).toHaveLength(2);
    stop();
  });

  it("fires a change once it is back, because it may have missed some", async () => {
    // The socket cannot replay what happened while it was down, so the screen
    // has to re-read. Without this, a reconnect leaves a stale group on screen.
    const { realtime, onChange, onHealth } = setup();
    const stop = realtime.watch(TRIP, { onChange, onHealth });
    const first = await handshake();
    first.serverClose();
    await vi.advanceTimersByTimeAsync(600);
    onChange.mockClear();
    await handshake();
    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
  });

  it("backs off further on each failure, up to a cap", async () => {
    const { realtime, onChange, onHealth } = setup();
    const stop = realtime.watch(TRIP, { onChange, onHealth });

    const delays: number[] = [];
    let attempts = FakeSocket.instances.length;
    for (let i = 0; i < 8; i++) {
      await vi.advanceTimersByTimeAsync(0);
      FakeSocket.latest().serverClose();
      // Find how long until the next socket appears.
      let waited = 0;
      while (FakeSocket.instances.length === attempts && waited < 60_000) {
        await vi.advanceTimersByTimeAsync(100);
        waited += 100;
      }
      delays.push(waited);
      attempts = FakeSocket.instances.length;
    }

    // Growing, then flat once capped.
    expect(delays[0]).toBeLessThan(delays[2]);
    expect(delays.at(-1)).toBeLessThanOrEqual(20_000);
    expect(delays.at(-1)).toBe(delays.at(-2));
    stop();
  });

  it("resets the backoff after a successful connection", async () => {
    const { realtime, onChange, onHealth } = setup();
    const stop = realtime.watch(TRIP, { onChange, onHealth });

    // Fail twice to grow the delay.
    await vi.advanceTimersByTimeAsync(0);
    FakeSocket.latest().serverClose();
    await vi.advanceTimersByTimeAsync(5_000);
    FakeSocket.latest().serverClose();
    await vi.advanceTimersByTimeAsync(5_000);

    // Now succeed, then drop again — the retry should be quick again.
    await handshake();
    FakeSocket.latest().serverClose();
    const before = FakeSocket.instances.length;
    await vi.advanceTimersByTimeAsync(700);
    expect(FakeSocket.instances.length).toBe(before + 1);
    stop();
  });

  it("gives up when the server refuses on policy grounds", async () => {
    // 1008 means the server decided: the trip ended, or we are not a member.
    // Retrying would hammer it forever for a reason that cannot change.
    const { realtime, onChange, onHealth } = setup();
    const stop = realtime.watch(TRIP, { onChange, onHealth });
    const ws = await handshake();
    ws.deliver({ type: "error", error: "forbidden" });
    ws.serverClose(1008);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeSocket.instances).toHaveLength(1);
    stop();
  });

  it("reports the refusal so the caller can act on it", async () => {
    const onFatal = vi.fn();
    FakeSocket.instances = [];
    const realtime = createRealtime({
      baseUrl: "https://api.caravan.app",
      session: { get: async () => SESSION },
      openSocket: (url) => new FakeSocket(url),
      random: () => 0.5,
    });
    const stop = realtime.watch(TRIP, { onChange: vi.fn(), onHealth: vi.fn(), onRefused: onFatal });
    const ws = await handshake();
    ws.deliver({ type: "error", error: "ended" });
    ws.serverClose(1008);
    expect(onFatal).toHaveBeenCalledWith("ended");
    stop();
  });

  it("gives up on a refusal message alone, without waiting for a close", async () => {
    // Behind Render's proxy the server's close(1008) frame never reaches the
    // client — verified against the deployed API. Depending on it meant a
    // refused socket sat open forever, so the error message has to be enough
    // on its own.
    const { realtime, onChange, onHealth } = setup();
    const stop = realtime.watch(TRIP, { onChange, onHealth });
    const ws = await handshake();

    ws.deliver({ type: "error", error: "forbidden" });
    // The client hangs up itself rather than waiting to be hung up on.
    expect(ws.closedWith).not.toBeNull();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeSocket.instances).toHaveLength(1);
    stop();
  });

  it("reports unhealthy when it gives up", async () => {
    const { realtime, onChange, onHealth } = setup();
    const stop = realtime.watch(TRIP, { onChange, onHealth });
    const ws = await handshake();
    onHealth.mockClear();
    ws.deliver({ type: "error", error: "ended" });
    // So the caller falls back to polling instead of believing it is live.
    expect(onHealth).toHaveBeenCalledWith(false);
    stop();
  });

  it("does not reconnect if a close does arrive after a refusal", async () => {
    // Belt and braces: on a proxy that *does* forward the close, the refusal
    // must not be retried twice over.
    const { realtime, onChange, onHealth } = setup();
    const stop = realtime.watch(TRIP, { onChange, onHealth });
    const ws = await handshake();
    ws.deliver({ type: "error", error: "forbidden" });
    ws.serverClose(1006);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeSocket.instances).toHaveLength(1);
    stop();
  });

  it("ignores an error frame that names no reason", async () => {
    const { realtime, onChange, onHealth } = setup();
    const stop = realtime.watch(TRIP, { onChange, onHealth });
    const ws = await handshake();
    expect(() => ws.deliver({ type: "error" })).not.toThrow();
    stop();
  });

  it("stops reconnecting once the caller unsubscribes", async () => {
    const { realtime, onChange, onHealth } = setup();
    const stop = realtime.watch(TRIP, { onChange, onHealth });
    const ws = await handshake();
    stop();
    expect(ws.closedWith).not.toBeNull();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it("delivers nothing after unsubscribing", async () => {
    const { realtime, onChange, onHealth } = setup();
    const stop = realtime.watch(TRIP, { onChange, onHealth });
    const ws = await handshake();
    stop();
    ws.deliver({ type: "changed" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not throw when the socket dies before the auth frame is sent", async () => {
    // The session lookup is async, so the socket can close underneath it.
    const { realtime, onChange, onHealth } = setup();
    const stop = realtime.watch(TRIP, { onChange, onHealth });
    await vi.advanceTimersByTimeAsync(0);
    const ws = FakeSocket.latest();
    ws.readyState = 3;
    expect(() => ws.onopen?.()).not.toThrow();
    stop();
  });

  it("keeps two trips on separate sockets", async () => {
    const { realtime, onChange, onHealth } = setup();
    const other = vi.fn();
    const stopA = realtime.watch(TRIP, { onChange, onHealth });
    const stopB = realtime.watch("trip-2", { onChange: other, onHealth: vi.fn() });
    await vi.advanceTimersByTimeAsync(0);
    expect(FakeSocket.instances).toHaveLength(2);

    FakeSocket.instances[0].open();
    await vi.advanceTimersByTimeAsync(0);
    FakeSocket.instances[0].deliver({ type: "ready" });
    FakeSocket.instances[0].deliver({ type: "changed" });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
    stopA();
    stopB();
  });
});
