import { describe } from "vitest";
import { createHttpData } from "../http";
import { createClock } from "../../serverTime";
import { createSessionStore, type Session } from "../../session";
import { describeDataClient } from "./conformance";

// Opt-in: runs the same contract as the local store against a real API over
// real HTTP. Mocked fetch proves the request shapes; only this proves the two
// implementations actually agree.
//
//   CARAVAN_API_URL=http://localhost:8787 npx vitest run http.live
const API = process.env.CARAVAN_API_URL;

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

const suite = API ? describe : describe.skip;

suite("live API", () => {
  describeDataClient(
    "http",
    async () => {
      const baseUrl = API!.replace(/\/+$/, "");
      // A fresh device per test, so "removes only the leaver" and the creator
      // checks are about this test's own identity.
      const session = createSessionStore({
        storage: memoryStorage(),
        requestDevice: async (): Promise<Session> => {
          const res = await fetch(`${baseUrl}/v1/devices`, { method: "POST" });
          if (!res.ok) throw new Error(`device registration failed: ${res.status}`);
          const body = (await res.json()) as Session;
          return { deviceId: body.deviceId, token: body.token };
        },
      });
      const data = createHttpData({ baseUrl, session, clock: createClock() });
      const { deviceId } = await session.get();
      return { data, myId: deviceId };
    },
    // subscribe() polls every 4s in this phase.
    { subscribeWaitMs: 9_000 }
  );
});
