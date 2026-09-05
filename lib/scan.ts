import { normalizeShareCode } from "./shareCode";

/**
 * Pulls a trip code out of whatever a camera happened to decode.
 *
 * Accepts the two shapes we produce — a join link and a group link — and a
 * bare code, since a code can be printed as a QR on its own. Everything else
 * is refused: a camera sees Wi-Fi codes, phone numbers and posters, and
 * guessing at those would join people to trips they did not choose.
 *
 * The origin is deliberately ignored. A production QR scanned by a local build
 * should still work, and the code is validated regardless of where it came from.
 */
export function parseScannedCode(raw: string): string | null {
  const text = raw.trim();
  if (text.length === 0) return null;

  // A bare code, printed or shown on its own.
  const bare = normalizeShareCode(text);
  if (bare !== null) return bare;

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  // /t/<code> and /t/<code>/join, with or without a trailing slash.
  const segments = url.pathname.split("/").filter((s) => s.length > 0);
  if (segments[0] !== "t") return null;
  if (segments.length === 3 && segments[2] !== "join") return null;
  if (segments.length < 2 || segments.length > 3) return null;

  return normalizeShareCode(segments[1] ?? "");
}
