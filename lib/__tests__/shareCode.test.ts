import { describe, it, expect } from "vitest";
import { generateShareCode, normalizeShareCode, SHARE_CODE_ALPHABET } from "../shareCode";

describe("generateShareCode", () => {
  it("is 6 characters long by default", () => {
    expect(generateShareCode()).toHaveLength(6);
  });

  it("respects a custom length", () => {
    expect(generateShareCode(4)).toHaveLength(4);
  });

  it("only uses the unambiguous alphabet", () => {
    for (let i = 0; i < 200; i++) {
      for (const ch of generateShareCode()) {
        expect(SHARE_CODE_ALPHABET).toContain(ch);
      }
    }
  });

  it("excludes ambiguous characters 0 O 1 I", () => {
    expect(SHARE_CODE_ALPHABET).not.toMatch(/[0O1I]/);
  });

  it("is reasonably non-repeating across calls", () => {
    const codes = new Set(Array.from({ length: 500 }, () => generateShareCode()));
    expect(codes.size).toBeGreaterThan(490);
  });
});

describe("normalizeShareCode", () => {
  it("uppercases so a typed code matches however it was entered", () => {
    expect(normalizeShareCode("kms4f2")).toBe("KMS4F2");
  });

  it("trims surrounding whitespace", () => {
    // The Join screen submits the raw field value, so a pasted code arrives
    // padded and used to fail lookup for no visible reason.
    expect(normalizeShareCode("  KMS4F2 ")).toBe("KMS4F2");
    expect(normalizeShareCode("\nKMS4F2\t")).toBe("KMS4F2");
  });

  it("rejects a code of the wrong length", () => {
    expect(normalizeShareCode("KMS4F")).toBeNull();
    expect(normalizeShareCode("KMS4F22")).toBeNull();
  });

  it("rejects characters outside the alphabet", () => {
    expect(normalizeShareCode("KMS4F0")).toBeNull();
    expect(normalizeShareCode("KMS4FI")).toBeNull();
    expect(normalizeShareCode("KM-4F2")).toBeNull();
  });

  it("rejects empty input", () => {
    expect(normalizeShareCode("")).toBeNull();
    expect(normalizeShareCode("   ")).toBeNull();
  });

  it("accepts every code the generator produces", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateShareCode();
      expect(normalizeShareCode(code)).toBe(code);
    }
  });
});
