import { describe, it, expect } from "vitest";
import { vapidKeyToBytes } from "../push";

describe("vapidKeyToBytes", () => {
  // PushManager.subscribe wants the application server key as raw bytes, and
  // VAPID keys travel as base64url. Getting this wrong fails at subscribe time
  // with an opaque DOMException, so it is worth pinning.

  it("decodes a base64url key to bytes", () => {
    // "AQIDBA" is base64url for 0x01 0x02 0x03 0x04.
    expect(Array.from(vapidKeyToBytes("AQIDBA"))).toEqual([1, 2, 3, 4]);
  });

  it("translates the base64url alphabet", () => {
    // '-' and '_' stand in for '+' and '/', which plain atob does not accept.
    const bytes = vapidKeyToBytes("-_8");
    expect(Array.from(bytes)).toEqual([251, 255]);
  });

  it("restores the padding base64url omits", () => {
    // Length 22 needs two '=' to become a valid base64 quantum.
    expect(() => vapidKeyToBytes("A".repeat(22))).not.toThrow();
    expect(vapidKeyToBytes("A".repeat(22))).toHaveLength(16);
  });

  it("decodes a realistic 65-byte application server key", () => {
    const key =
      "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";
    expect(vapidKeyToBytes(key)).toHaveLength(65);
  });

  it("rejects an empty key rather than subscribing with nothing", () => {
    expect(() => vapidKeyToBytes("")).toThrow(/key/i);
  });
});
