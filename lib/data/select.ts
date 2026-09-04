// Which data layer to run against. Kept separate from the wiring so the
// decision is testable without a module-load side effect.

export type Backend = "http" | "local";

// Better to run offline than to fire every request at a value that could never
// be an origin — an unset variable in a .env file arrives as "", not undefined.
export function selectBackend(apiUrl: string | undefined): Backend {
  const raw = (apiUrl ?? "").trim();
  if (raw.length === 0) return "local";
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? "http" : "local";
  } catch {
    return "local";
  }
}

// Paths are always written with a leading slash, so the base must not end with one.
export function normalizeBaseUrl(apiUrl: string): string {
  return apiUrl.trim().replace(/\/+$/, "");
}
