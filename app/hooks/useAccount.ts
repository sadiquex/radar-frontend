"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { account, signInAvailable } from "@/lib/data";
import { forgetGoogleSession } from "@/lib/googleSignIn";
import { rememberSignedIn, wasSignedIn } from "@/lib/accountFlag";
import { adoptAccountPreferences } from "@/lib/preferences";
import type { AccountProfile, AccountPreferences } from "@/lib/data/account";

export type AccountState = "loading" | "signedOut" | "signedIn";

/**
 * The account behind this device.
 *
 * Everything about this is optional: with no API or no client id configured
 * the state settles on "signedOut" and every screen works exactly as it did
 * before accounts existed.
 */
export function useAccount() {
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [state, setState] = useState<AccountState>(signInAvailable ? "loading" : "signedOut");
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    if (!signInAvailable) return;

    void account.me().then((found) => {
      if (!alive.current) return;
      setProfile(found);
      setState(found === null ? "signedOut" : "signedIn");
      // Keeps the pre-hydration shell honest on the next load.
      rememberSignedIn(found !== null);
    });

    return () => {
      alive.current = false;
    };
  }, []);

  const signIn = useCallback(async (idToken: string) => {
    setError(null);
    try {
      const found = await account.signInWithGoogle(idToken);
      rememberSignedIn(true);
      // Take on whatever this account was set up with. This is the whole point
      // of storing preferences: a new phone should arrive configured.
      adoptAccountPreferences(await account.preferences());
      if (!alive.current) return;
      setProfile(found);
      setState("signedIn");
    } catch {
      if (!alive.current) return;
      // Sign-in is the one part of this the user is watching, so it says so.
      setError("Couldn't sign in. Try again.");
      setState("signedOut");
    }
  }, []);

  const signOut = useCallback(async () => {
    // Local state first: a UI stuck on "signed in" is worse than a row that
    // outlives the intent.
    setProfile(null);
    setState("signedOut");
    setError(null);
    rememberSignedIn(false);
    // Without this Google can hand the button the same account straight back.
    forgetGoogleSession();
    await account.signOut();
  }, []);

  /**
   * Renames the account.
   *
   * Honest about failing, like sign-in and for the same reason: the person is
   * watching a field they just typed into.
   */
  const rename = useCallback(async (displayName: string) => {
    const updated = await account.rename(displayName);
    if (!alive.current) return;
    setProfile(updated);
  }, []);

  return {
    profile,
    state,
    error,
    signIn,
    signOut,
    rename,
    available: signInAvailable,
  };
}

/**
 * What the shell should assume before `/auth/me` has answered.
 *
 * Read once, on the first client render. Reading it on every render would make
 * the tab bar flicker if anything else wrote the key mid-session.
 */
export function useOptimisticSignedIn(state: AccountState): boolean {
  const [cached] = useState<boolean>(() => wasSignedIn());
  return state === "loading" ? cached : state === "signedIn";
}

export type { AccountPreferences };
