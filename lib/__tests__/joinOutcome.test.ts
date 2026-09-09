import { describe, it, expect } from "vitest";
import { joinOutcome } from "../joinOutcome";
import { ApiError } from "../data/types";

const occupied = (detail: unknown) => new ApiError("already_in_trip", 409, undefined, detail);

describe("joinOutcome", () => {
  it("offers to switch, naming the trip you are in", () => {
    const out = joinOutcome(
      occupied({ id: "trip-1", name: "Test Leg", shareCode: "ABC234" })
    );
    expect(out).toEqual({
      kind: "switch",
      occupied: { id: "trip-1", name: "Test Leg", shareCode: "ABC234" },
    });
  });

  it("still offers to switch when the trip you are in has no name", () => {
    const out = joinOutcome(occupied({ id: "trip-1", name: null, shareCode: "ABC234" }));
    expect(out.kind).toBe("switch");
  });

  // The offer removes you from a trip. If the server did not say which one, we
  // must not guess — an offer we cannot honour is worse than a plain refusal.
  it("falls back to a message when the refusal names no trip", () => {
    expect(joinOutcome(occupied(undefined))).toEqual({
      kind: "message",
      text: "You're already in a trip. Leave it before joining another.",
    });
  });

  it("does not offer to switch on a full trip", () => {
    // Same endpoint, same 409, opposite meaning — nothing to leave.
    expect(joinOutcome(new ApiError("trip_full", 409))).toEqual({
      kind: "message",
      text: "This trip is full.",
    });
  });

  it.each(["ended", "expired"] as const)("reports %s as a finished trip", (code) => {
    expect(joinOutcome(new ApiError(code, 410))).toEqual({
      kind: "message",
      text: "That trip has already ended.",
    });
  });

  it("reports being offline as itself", () => {
    expect(joinOutcome(new ApiError("offline", 0))).toEqual({
      kind: "message",
      text: "You appear to be offline.",
    });
  });

  it("falls back for anything it does not recognise", () => {
    expect(joinOutcome(new Error("boom"))).toEqual({
      kind: "message",
      text: "Couldn't join that trip. Try again.",
    });
  });
});
