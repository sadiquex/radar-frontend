import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

/**
 * Vitest runs in the node environment with no DOM, so `localStorage` and
 * `matchMedia` have to be stubbed — the same pattern `clientId.test.ts` uses,
 * and the same reason `vi.resetModules()` appears between cases.
 */
function memoryStorage(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    _map: m,
  };
}

/** A storage that throws on every access, as private mode does in some browsers. */
const hostileStorage = {
  getItem() {
    throw new Error("denied");
  },
  setItem() {
    throw new Error("denied");
  },
  removeItem() {
    throw new Error("denied");
  },
};

function stubEnv(storage: unknown, prefersDark = false) {
  const root = { attrs: {} as Record<string, string> };
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", {
    matchMedia: () => ({ matches: prefersDark }),
  });
  vi.stubGlobal("document", {
    documentElement: {
      setAttribute: (k: string, v: string) => void (root.attrs[k] = v),
      removeAttribute: (k: string) => void delete root.attrs[k],
    },
  });
  return root;
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const load = async () => import("../preferences");

describe("readLocalPreferences", () => {
  it("defaults to following the system, with alerts off", async () => {
    stubEnv(memoryStorage());
    const { readLocalPreferences } = await load();
    expect(readLocalPreferences()).toEqual({ theme: "system", notifications: false });
  });

  it("reads a stored choice", async () => {
    stubEnv(memoryStorage({ "gt:theme": "dark", "gt:notifs": "1" }));
    const { readLocalPreferences } = await load();
    expect(readLocalPreferences()).toEqual({ theme: "dark", notifications: true });
  });

  it("treats an unrecognised stored theme as system", async () => {
    stubEnv(memoryStorage({ "gt:theme": "sepia" }));
    const { readLocalPreferences } = await load();
    expect(readLocalPreferences().theme).toBe("system");
  });

  it("survives a browser that refuses storage entirely", async () => {
    stubEnv(hostileStorage);
    const { readLocalPreferences } = await load();
    expect(readLocalPreferences()).toEqual({ theme: "system", notifications: false });
  });
});

describe("writeLocalPreference", () => {
  it("removes the key for system rather than storing the word", async () => {
    // THEME_BOOTSTRAP treats anything that is not "light" or "dark" as system,
    // so an explicit "system" string would work by accident. Removing it keeps
    // the stored state and the bootstrap's reading of it identical.
    const storage = memoryStorage({ "gt:theme": "dark" });
    stubEnv(storage);
    const { writeLocalPreference } = await load();
    expect(writeLocalPreference({ theme: "system" }).theme).toBe("system");
    expect(storage._map.has("gt:theme")).toBe(false);
  });

  it("stores an explicit choice", async () => {
    const storage = memoryStorage();
    stubEnv(storage);
    const { writeLocalPreference } = await load();
    writeLocalPreference({ theme: "light" });
    expect(storage._map.get("gt:theme")).toBe("light");
  });

  it("leaves the field it was not given alone", async () => {
    const storage = memoryStorage({ "gt:theme": "dark" });
    stubEnv(storage);
    const { writeLocalPreference } = await load();
    expect(writeLocalPreference({ notifications: true })).toEqual({
      theme: "dark",
      notifications: true,
    });
  });

  it("applies for the session even when the write is refused", async () => {
    stubEnv(hostileStorage);
    const { writeLocalPreference } = await load();
    expect(() => writeLocalPreference({ theme: "dark" })).not.toThrow();
  });
});

describe("applyPreferences", () => {
  it("stamps an explicit choice on the root element", async () => {
    const root = stubEnv(memoryStorage());
    const { applyPreferences } = await load();
    applyPreferences({ theme: "light", notifications: false });
    expect(root.attrs["data-theme"]).toBe("light");
  });

  it("resolves system against the media query", async () => {
    const root = stubEnv(memoryStorage(), true);
    const { applyPreferences } = await load();
    applyPreferences({ theme: "system", notifications: false });
    expect(root.attrs["data-theme"]).toBe("dark");
  });

  it("applies every choice, not only system", async () => {
    // An earlier version of this logic returned early for explicit choices and
    // left the bootstrap's value wherever it happened to be, which made the
    // toggle look broken in one direction only.
    const root = stubEnv(memoryStorage(), true);
    const { applyPreferences } = await load();
    applyPreferences({ theme: "light", notifications: false });
    expect(root.attrs["data-theme"]).toBe("light");
  });
});

describe("adoptAccountPreferences", () => {
  it("takes on what the account carries", async () => {
    const storage = memoryStorage();
    const root = stubEnv(storage);
    const { adoptAccountPreferences } = await load();
    expect(adoptAccountPreferences({ theme: "dark", notifications: true })).toEqual({
      theme: "dark",
      notifications: true,
    });
    expect(root.attrs["data-theme"]).toBe("dark");
  });

  it("does not reset a browser from an account that has never been told anything", async () => {
    // A `{}` from the server means "no opinion", not "back to defaults".
    // Getting this wrong would wipe the theme of anyone who set it before
    // preferences existed, on their next sign-in.
    const storage = memoryStorage({ "gt:theme": "dark", "gt:notifs": "1" });
    stubEnv(storage);
    const { adoptAccountPreferences } = await load();
    expect(adoptAccountPreferences({})).toEqual({ theme: "dark", notifications: true });
  });

  it("overrides only the fields the account has an opinion about", async () => {
    const storage = memoryStorage({ "gt:theme": "dark", "gt:notifs": "1" });
    stubEnv(storage);
    const { adoptAccountPreferences } = await load();
    expect(adoptAccountPreferences({ theme: "light" })).toEqual({
      theme: "light",
      notifications: true,
    });
  });
});

describe("the signed-in flag", () => {
  it("round-trips", async () => {
    stubEnv(memoryStorage());
    const { wasSignedIn, rememberSignedIn } = await import("../accountFlag");
    expect(wasSignedIn()).toBe(false);
    rememberSignedIn(true);
    expect(wasSignedIn()).toBe(true);
    rememberSignedIn(false);
    expect(wasSignedIn()).toBe(false);
  });

  it("reads false rather than throwing where storage is blocked", async () => {
    // The shell renders from this on first paint; a throw here would take the
    // whole page down to avoid one layout shift.
    stubEnv(hostileStorage);
    const { wasSignedIn, rememberSignedIn } = await import("../accountFlag");
    expect(wasSignedIn()).toBe(false);
    expect(() => rememberSignedIn(true)).not.toThrow();
  });

  it("does not collide with the keys cross-tab sync matches on", async () => {
    // `subscribe` in lib/data/index.ts string-matches gt:trip:, gt:code: and
    // gt:participants:. A key that matched one of those would fan a storage
    // event out to every open tab on every sign-in.
    const { SIGNED_IN_KEY } = await import("../accountFlag");
    for (const prefix of ["gt:trip:", "gt:code:", "gt:participants:"]) {
      expect(SIGNED_IN_KEY.startsWith(prefix)).toBe(false);
    }
  });
});
