import { describe, it, expect } from "vitest";
import { selectBackend, normalizeBaseUrl } from "../select";

describe("selectBackend", () => {
  it("uses the API when one is configured", () => {
    expect(selectBackend("https://api.caravan.app")).toBe("http");
  });

  it("falls back to the local store when no API is configured", () => {
    // `npm run dev` with no backend must still work — that is how the whole
    // frontend was built, and the demo convoy depends on it.
    expect(selectBackend(undefined)).toBe("local");
  });

  it("treats an empty or whitespace value as unconfigured", () => {
    // An unset variable in a .env file arrives as "", not undefined.
    expect(selectBackend("")).toBe("local");
    expect(selectBackend("   ")).toBe("local");
  });

  it("ignores a value that is not an absolute http URL", () => {
    // Better to run offline than to fire every request at a broken origin.
    expect(selectBackend("localhost:8787")).toBe("local");
    expect(selectBackend("/api")).toBe("local");
    expect(selectBackend("ftp://example.com")).toBe("local");
  });

  it("accepts a plain http origin, for local development", () => {
    expect(selectBackend("http://localhost:8787")).toBe("http");
  });
});

describe("normalizeBaseUrl", () => {
  it("strips a trailing slash so paths do not double up", () => {
    expect(normalizeBaseUrl("https://api.caravan.app/")).toBe("https://api.caravan.app");
  });

  it("leaves a bare origin alone", () => {
    expect(normalizeBaseUrl("https://api.caravan.app")).toBe("https://api.caravan.app");
  });

  it("strips several trailing slashes", () => {
    expect(normalizeBaseUrl("http://localhost:8787///")).toBe("http://localhost:8787");
  });

  it("preserves a path prefix", () => {
    expect(normalizeBaseUrl("https://caravan.app/api/")).toBe("https://caravan.app/api");
  });
});
