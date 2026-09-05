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

export interface AccountClient {
  /** The current account, or null. Never throws. */
  me(): Promise<AccountProfile | null>;
  /** Sends a Google credential to be verified server-side. Throws on refusal. */
  signInWithGoogle(idToken: string): Promise<AccountProfile>;
  /** Detaches the account from this device. Never throws. */
  signOut(): Promise<void>;
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
};
