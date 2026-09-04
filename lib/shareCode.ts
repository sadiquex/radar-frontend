// Crockford-ish alphabet: no 0/O/1/I to avoid read-aloud and typing confusion.
export const SHARE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const SHARE_CODE_LENGTH = 6;

const SHARE_CODE_RE = new RegExp(`^[${SHARE_CODE_ALPHABET}]{${SHARE_CODE_LENGTH}}$`);

// Only used by the local (offline) data layer now — the server mints real codes
// from a CSPRNG, because on the internet the code is the only thing guarding a trip.
export function generateShareCode(length = SHARE_CODE_LENGTH): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    const idx = Math.floor(Math.random() * SHARE_CODE_ALPHABET.length);
    out += SHARE_CODE_ALPHABET[idx];
  }
  return out;
}

// The canonical form of a user-supplied code, or null if it could never be one.
// A pasted code arrives with whitespace, and the Join screen submits the field
// value as typed.
export function normalizeShareCode(input: string): string | null {
  const code = input.trim().toUpperCase();
  return SHARE_CODE_RE.test(code) ? code : null;
}
