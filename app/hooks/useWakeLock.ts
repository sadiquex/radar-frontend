"use client";

import { useEffect, useRef, useState } from "react";

interface WakeLockSentinelLike {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: "release", listener: () => void): void;
}

/**
 * Holds the screen awake while a trip is live.
 *
 * The Create screen used to warn "browsers pause location when the screen is
 * off". This is the fix rather than the apology: geolocation stops being
 * delivered once the screen sleeps, which is exactly when a group needs it.
 *
 * The browser releases the lock itself whenever the page is hidden, so it has
 * to be re-acquired on visibilitychange — acquiring once is not enough.
 */
export function useWakeLock(enabled: boolean): { active: boolean; supported: boolean } {
  const [active, setActive] = useState(false);
  const supported =
    typeof navigator !== "undefined" && "wakeLock" in navigator;
  const sentinel = useRef<WakeLockSentinelLike | null>(null);

  useEffect(() => {
    if (!supported) return;

    let cancelled = false;

    const release = async () => {
      const held = sentinel.current;
      sentinel.current = null;
      setActive(false);
      if (held && !held.released) {
        try { await held.release(); } catch { /* already gone */ }
      }
    };

    const acquire = async () => {
      if (cancelled || !enabled) return;
      if (document.visibilityState !== "visible") return;
      if (sentinel.current && !sentinel.current.released) return;
      try {
        const lock = (await (
          navigator as Navigator & { wakeLock: { request(t: "screen"): Promise<WakeLockSentinelLike> } }
        ).wakeLock.request("screen"));
        if (cancelled) {
          try { await lock.release(); } catch { /* ignore */ }
          return;
        }
        sentinel.current = lock;
        setActive(true);
        lock.addEventListener("release", () => {
          if (!cancelled) setActive(false);
        });
      } catch {
        // Denied, or not permitted in this context. Not an error worth showing.
        setActive(false);
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    if (enabled) void acquire();
    else void release();

    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void release();
    };
  }, [enabled, supported]);

  return { active, supported };
}
