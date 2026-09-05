"use client";

import { useEffect, useRef, useState } from "react";
import { googleClientId } from "@/lib/data";
import { renderGoogleButton } from "@/lib/googleSignIn";
import { C, FONT } from "./Radar";

/**
 * Google's own rendered button.
 *
 * Not a custom one: Google's branding terms require theirs, and it handles the
 * credential flow across browsers where a hand-rolled button would need the
 * popup and FedCM paths written out.
 *
 * If the script cannot load — an extension, a captive portal, an offline phone
 * — this says so rather than leaving a button that does nothing. Every screen
 * offering it still works without signing in.
 */
export function GoogleSignInButton({
  onCredential,
}: {
  onCredential: (idToken: string) => void;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);
  const latest = useRef(onCredential);
  latest.current = onCredential;

  useEffect(() => {
    const parent = host.current;
    if (parent === null || googleClientId.length === 0) return;
    let cancelled = false;

    void renderGoogleButton({
      parent,
      clientId: googleClientId,
      onCredential: (idToken) => {
        if (!cancelled) latest.current(idToken);
      },
      onError: () => {
        if (!cancelled) setFailed(true);
      },
    }).catch(() => {
      if (!cancelled) setFailed(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return (
      <div style={{ fontFamily: FONT.body, fontSize: 13, color: C.muted, textAlign: "center" }}>
        Google sign-in is unavailable right now.
      </div>
    );
  }

  // Google renders into this; its own markup replaces nothing of ours.
  return <div ref={host} className="grid place-items-center" style={{ minHeight: 44 }} />;
}
