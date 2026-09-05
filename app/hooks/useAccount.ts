"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { account, signInAvailable } from "@/lib/data";
import { forgetGoogleSession } from "@/lib/googleSignIn";
import type { AccountProfile } from "@/lib/data/account";

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
    });

    return () => {
      alive.current = false;
    };
  }, []);

  const signIn = useCallback(async (idToken: string) => {
    setError(null);
    try {
      const found = await account.signInWithGoogle(idToken);
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
    // Without this Google can hand the button the same account straight back.
    forgetGoogleSession();
    await account.signOut();
  }, []);

  return { profile, state, error, signIn, signOut, available: signInAvailable };
}
