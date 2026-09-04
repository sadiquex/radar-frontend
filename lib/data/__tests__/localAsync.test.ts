import { describe, it, expect, vi } from "vitest";
import { createLocalAsyncData } from "../localAsync";
import { SHARE_CODE_ALPHABET } from "../../shareCode";
import { describeDataClient } from "./conformance";

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

let n = 0;
const harness = async () => {
  n = 0;
  const data = createLocalAsyncData({
    storage: memoryStorage(),
    genId: () => `id-${++n}`,
    // Distinct but still inside the real alphabet — "AAAA02" would contain a
    // "0", which is precisely what the alphabet excludes.
    genCode: () => `AAAAA${SHARE_CODE_ALPHABET[++n % SHARE_CODE_ALPHABET.length]}`,
    now: () => Date.now(),
  });
  return { data, myId: "device-local" };
};

// The offline implementation must satisfy exactly the same contract as the API.
describeDataClient("localAsync", harness);

describe("createLocalAsyncData", () => {
  it("returns promises, so screens can await it like the API", async () => {
    const { data, myId } = await harness();
    const result = data.createTrip({}, myId);
    expect(result).toBeInstanceOf(Promise);
    await result;
  });

  it("notifies subscribers synchronously, with no polling delay", async () => {
    const { data, myId } = await harness();
    const trip = await data.createTrip({}, myId);
    const onChange = vi.fn();
    const unsub = data.subscribe(trip.id, onChange);
    await data.joinTrip(trip.id, myId, "Ama");
    expect(onChange).toHaveBeenCalled();
    unsub();
  });

  it("scopes notifications to the trip being watched", async () => {
    const { data, myId } = await harness();
    const watched = await data.createTrip({}, myId);
    const other = await data.createTrip({}, myId);
    const onChange = vi.fn();
    const unsub = data.subscribe(watched.id, onChange);
    await data.joinTrip(other.id, myId, "Ama");
    expect(onChange).not.toHaveBeenCalled();
    unsub();
  });
});
