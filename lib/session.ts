// Identity without accounts, now server-issued. The device asks the API for an
// opaque token once and keeps it; the API derives the participant id from that
// token, so a client can never claim to be someone else.
//
// This replaces the locally generated `grouptrack:clientId` UUID. Trips already
// in a browser's localStorage are not migrated — they expire within 8 hours.

export const SESSION_KEY = "gt:session";

export interface Session {
  deviceId: string;
  token: string;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SessionDeps {
  storage: StorageLike;
  requestDevice: () => Promise<Session>;
}

function isSession(v: unknown): v is Session {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Partial<Session>;
  return typeof s.deviceId === "string" && s.deviceId.length > 0
    && typeof s.token === "string" && s.token.length > 0;
}

export function createSessionStore(deps: SessionDeps) {
  const { storage, requestDevice } = deps;

  // Private browsing and "block site data" make localStorage throw rather than
  // return null, so every access is guarded.
  function read(): Session | null {
    let raw: string | null = null;
    try {
      raw = storage.getItem(SESSION_KEY);
    } catch {
      return null;
    }
    if (raw === null) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      return isSession(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  function write(session: Session): void {
    try {
      storage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      /* in-memory only for this tab; still usable */
    }
  }

  let cached: Session | null = read();
  // Shared across concurrent callers: the group screen resolves identity while
  // the geolocation hook is already asking for it, and two devices would mean
  // joining as a stranger.
  let inFlight: Promise<Session> | null = null;

  return {
    peek: (): Session | null => cached,

    get(): Promise<Session> {
      if (cached !== null) return Promise.resolve(cached);
      inFlight ??= requestDevice()
        .then((session) => {
          cached = session;
          write(session);
          return session;
        })
        .finally(() => {
          // Clearing on failure too, so an offline first load can be retried.
          inFlight = null;
        });
      return inFlight;
    },

    clear(): void {
      cached = null;
      try {
        storage.removeItem(SESSION_KEY);
      } catch {
        /* nothing to do */
      }
    },
  };
}

export type SessionStore = ReturnType<typeof createSessionStore>;
