import { describe, it, expect } from "vitest";
import { ApiError, isTripGone, isNotMember, isRateLimited } from "../types";

describe("ApiError classification", () => {
  // Screens branch on these rather than on status numbers or message strings,
  // so each one needs to mean exactly one thing.

  describe("isTripGone", () => {
    it.each(["not_found", "ended", "expired"] as const)("is true for %s", (code) => {
      expect(isTripGone(new ApiError(code, 410))).toBe(true);
    });

    it("is false for a refusal, which is about us and not the trip", () => {
      expect(isTripGone(new ApiError("forbidden", 403))).toBe(false);
    });

    it("is false for being offline — the trip is probably fine", () => {
      expect(isTripGone(new ApiError("offline", 0))).toBe(false);
    });

    it("is false for a plain error", () => {
      expect(isTripGone(new Error("boom"))).toBe(false);
      expect(isTripGone(null)).toBe(false);
    });
  });

  describe("isNotMember", () => {
    it("is true for forbidden", () => {
      expect(isNotMember(new ApiError("forbidden", 403))).toBe(true);
    });

    it("is false for anything else", () => {
      expect(isNotMember(new ApiError("ended", 410))).toBe(false);
      expect(isNotMember(new Error("boom"))).toBe(false);
    });
  });

  describe("isRateLimited", () => {
    it("is true for a throttled request", () => {
      expect(isRateLimited(new ApiError("rate_limited", 429))).toBe(true);
    });

    it("is false for being offline", () => {
      // These need to stay distinct: offline means retry as soon as possible,
      // throttled means the opposite.
      expect(isRateLimited(new ApiError("offline", 0))).toBe(false);
    });

    it("is false for anything else", () => {
      expect(isRateLimited(new ApiError("internal", 500))).toBe(false);
      expect(isRateLimited(new Error("boom"))).toBe(false);
    });
  });

  it("keeps the code and status it was given", () => {
    const err = new ApiError("trip_full", 409);
    expect(err.code).toBe("trip_full");
    expect(err.status).toBe(409);
    expect(err.name).toBe("ApiError");
    expect(err).toBeInstanceOf(Error);
  });
});
