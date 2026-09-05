import { describe, it, expect } from "vitest";
import { parseScannedCode } from "../scan";

describe("parseScannedCode", () => {
  // A camera hands over whatever happens to be in frame, so this has to pull a
  // trip code out of the shapes we actually produce and refuse everything else.

  it("reads a code from a join link", () => {
    expect(parseScannedCode("https://radar-for-sports.vercel.app/t/AWUEHN/join")).toBe("AWUEHN");
  });

  it("reads a code from a group link", () => {
    expect(parseScannedCode("https://radar-for-sports.vercel.app/t/AWUEHN")).toBe("AWUEHN");
  });

  it("accepts a bare code, since a code can be shown as a QR too", () => {
    expect(parseScannedCode("AWUEHN")).toBe("AWUEHN");
  });

  it("does not care which deployment produced the link", () => {
    // A production QR scanned by a local build should still join: the code is
    // the thing that matters, and it is validated either way.
    expect(parseScannedCode("http://localhost:3000/t/AWUEHN/join")).toBe("AWUEHN");
  });

  it("uppercases and trims", () => {
    expect(parseScannedCode("  awuehn  ")).toBe("AWUEHN");
    expect(parseScannedCode("https://x.test/t/awuehn/join")).toBe("AWUEHN");
  });

  it("survives a query string or hash on the link", () => {
    expect(parseScannedCode("https://x.test/t/AWUEHN/join?utm=qr")).toBe("AWUEHN");
    expect(parseScannedCode("https://x.test/t/AWUEHN#top")).toBe("AWUEHN");
  });

  it("survives a trailing slash", () => {
    expect(parseScannedCode("https://x.test/t/AWUEHN/")).toBe("AWUEHN");
    expect(parseScannedCode("https://x.test/t/AWUEHN/join/")).toBe("AWUEHN");
  });

  it("refuses a URL that is not a trip link", () => {
    expect(parseScannedCode("https://radar-for-sports.vercel.app/")).toBeNull();
    expect(parseScannedCode("https://x.test/join")).toBeNull();
    expect(parseScannedCode("https://x.test/t/")).toBeNull();
  });

  it("refuses a link whose code could never be valid", () => {
    // 0 and I are excluded from the alphabet on purpose.
    expect(parseScannedCode("https://x.test/t/AWUEH0/join")).toBeNull();
    expect(parseScannedCode("https://x.test/t/TOOLONGCODE/join")).toBeNull();
    expect(parseScannedCode("https://x.test/t/ABC/join")).toBeNull();
  });

  it("refuses whatever else happened to be in frame", () => {
    expect(parseScannedCode("https://example.com/some/page")).toBeNull();
    expect(parseScannedCode("WIFI:S:MyNetwork;T:WPA;P:hunter2;;")).toBeNull();
    expect(parseScannedCode("tel:+233200000000")).toBeNull();
    expect(parseScannedCode("")).toBeNull();
    expect(parseScannedCode("   ")).toBeNull();
  });

  it("refuses a code hidden in a longer string", () => {
    // Only a bare code or a real trip path counts; anything else is ambiguous.
    expect(parseScannedCode("join AWUEHN now")).toBeNull();
  });
});
