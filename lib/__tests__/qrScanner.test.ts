import { describe, it, expect } from "vitest";
import { classifyCameraError } from "../qrScanner";

describe("classifyCameraError", () => {
  // These three cases need different copy: one is fixable in browser settings,
  // one means fall back to typing the code, one is worth retrying.

  it("recognises a refused permission", () => {
    expect(classifyCameraError({ name: "NotAllowedError" })).toBe("denied");
    // Older Safari used a different name for the same thing.
    expect(classifyCameraError({ name: "PermissionDeniedError" })).toBe("denied");
    expect(classifyCameraError({ name: "SecurityError" })).toBe("denied");
  });

  it("recognises a device with no usable camera", () => {
    expect(classifyCameraError({ name: "NotFoundError" })).toBe("unavailable");
    expect(classifyCameraError({ name: "DevicesNotFoundError" })).toBe("unavailable");
    expect(classifyCameraError({ name: "OverconstrainedError" })).toBe("unavailable");
  });

  it("recognises a camera another app already holds", () => {
    // Common on a phone that just left a video call.
    expect(classifyCameraError({ name: "NotReadableError" })).toBe("unavailable");
    expect(classifyCameraError({ name: "TrackStartError" })).toBe("unavailable");
  });

  it("falls back to a retryable failure for anything else", () => {
    expect(classifyCameraError({ name: "AbortError" })).toBe("failed");
    expect(classifyCameraError(new Error("boom"))).toBe("failed");
    expect(classifyCameraError(null)).toBe("failed");
    expect(classifyCameraError("nonsense")).toBe("failed");
  });
});
