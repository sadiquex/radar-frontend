import type { Session } from "../session";

/**
 * The account behind this device, if any.
 *
 * Signing in is an upgrade on top of the anonymous device identity, so almost
 * everything here degrades to "no account" rather than to an error: the app
 * must work identically for someone who never signs in.
 *
 * The one exception is sign-in itself. The user is watching that, so it has to
 * be honest about failing.
 */
export interface AccountProfile {
  displayName: string;
}

/**
 * Settings that follow the account rather than the browser.
 *
 * Every field optional, and writes are merged server-side, so a tab that
 * predates a new setting cannot wipe it by saving the two it knows about.
 */
export interface AccountPreferences {
  theme?: "system" | "light" | "dark";
  notifications?: boolean;
  haptics?: boolean;
}

/**
 * A device signed in to this account.
 *
 * Three fields, and there will never be more: no user agent, no address, no
 * location. None of it is stored anywhere, and a "your devices" screen is not
 * a reason to start collecting it.
 */
export interface AccountDevice {
  id: string;
  createdAt: number;
  lastSeenAt: number;
  current: boolean;
}

export interface AccountClient {
  /** The current account, or null. Never throws. */
  me(): Promise<AccountProfile | null>;
  /** Sends a Google credential to be verified server-side. Throws on refusal. */
  signInWithGoogle(idToken: string): Promise<AccountProfile>;
  /** Detaches the account from this device. Never throws. */
  signOut(): Promise<void>;
  /**
   * Renames the account. Throws on refusal — the user is watching this one.
   *
   * Applies from the next trip onwards. Trips already taken keep the name they
   * were taken under, which is what actually happened.
   */
  rename(displayName: string): Promise<AccountProfile>;
  /** The devices on this account. Empty on any failure. */
  devices(): Promise<AccountDevice[]>;
  /**
   * Signs one device out of the account.
   *
   * Not eviction: that device keeps working and stays in every trip it has
   * joined. What stops is its future trips joining this history.
   */
  forgetDevice(deviceId: string): Promise<void>;
  /** Stored preferences. `{}` on any failure, so the local values keep winning. */
  preferences(): Promise<AccountPreferences>;
  /** Merges preferences into the account's. Never throws: the setting already applied locally. */
  savePreferences(patch: AccountPreferences): Promise<void>;
}

export interface AccountDeps {
  baseUrl: string;
  session: { get: () => Promise<Session> };
  fetchFn?: typeof fetch;
}

export function createAccountClient(deps: AccountDeps): AccountClient {
  const doFetch = deps.fetchFn ?? globalThis.fetch;

  async function send(path: string, init: { method: string; body?: unknown }): Promise<Response> {
    const { token } = await deps.session.get();
    return doFetch(`${deps.baseUrl}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
  }

  return {
    async me(): Promise<AccountProfile | null> {
      try {
        const res = await send("/v1/auth/me", { method: "GET" });
        if (!res.ok) return null;
        const body = (await res.json()) as { user: AccountProfile | null };
        return body.user ?? null;
      } catch {
        // A network blip must not block a screen that renders fine without
        // an account.
        return null;
      }
    },

    async signInWithGoogle(idToken: string): Promise<AccountProfile> {
      // The credential is deliberately not inspected here — only the server
      // can check who signed it and who it was minted for.
      const res = await send("/v1/auth/google", { method: "POST", body: { idToken } });
      if (!res.ok) throw new Error(`Sign-in failed (${res.status})`);
      const body = (await res.json()) as { user: AccountProfile };
      return body.user;
    },

    async signOut(): Promise<void> {
      // The caller clears its local state regardless: a UI stuck showing
      // "signed in" is worse than a row that outlives the intent.
      await send("/v1/auth/signout", { method: "POST" }).catch(() => undefined);
    },

    async rename(displayName: string): Promise<AccountProfile> {
      const res = await send("/v1/auth/me", { method: "PATCH", body: { displayName } });
      if (!res.ok) throw new Error(`Could not save that name (${res.status})`);
      const body = (await res.json()) as { user: AccountProfile };
      return body.user;
    },

    async devices(): Promise<AccountDevice[]> {
      try {
        const res = await send("/v1/me/devices", { method: "GET" });
        if (!res.ok) return [];
        const body = (await res.json()) as { devices?: AccountDevice[] };
        return body.devices ?? [];
      } catch {
        return [];
      }
    },

    async forgetDevice(deviceId: string): Promise<void> {
      const res = await send(`/v1/me/devices/${encodeURIComponent(deviceId)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`Could not sign that device out (${res.status})`);
    },

    async preferences(): Promise<AccountPreferences> {
      try {
        const res = await send("/v1/me/preferences", { method: "GET" });
        if (!res.ok) return {};
        const body = (await res.json()) as { preferences?: AccountPreferences };
        return body.preferences ?? {};
      } catch {
        return {};
      }
    },

    async savePreferences(patch: AccountPreferences): Promise<void> {
      // Deliberately silent. The setting has already been applied locally and
      // is already visible; a toast about a failed sync is noise about
      // something the person cannot act on.
      // Silent for the user — the setting has already applied and is already
      // visible — but not silent in the console. A bare `.catch(() => undefined)`
      // here hid a CORS preflight failure that stopped preferences syncing at
      // all, and nothing in the UI could have shown it.
      await send("/v1/me/preferences", { method: "PATCH", body: patch }).catch((err) => {
        console.warn("[radar] could not sync preferences", err);
      });
    },
  };
}

/** With no API configured there is nowhere to verify a credential. */
export const offlineAccount: AccountClient = {
  async me() {
    return null;
  },
  async signInWithGoogle(): Promise<AccountProfile> {
    throw new Error("Signing in is not available offline");
  },
  async signOut() {},
  async rename(): Promise<AccountProfile> {
    throw new Error("Renaming is not available offline");
  },
  async devices() {
    return [];
  },
  async forgetDevice() {},
  async preferences() {
    return {};
  },
  async savePreferences() {},
};
