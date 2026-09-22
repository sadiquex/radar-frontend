"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CornerDownLeft } from "lucide-react";
import { C, FONT, Mark } from "../Radar";
import { LiveScope } from "../LiveScope";
import type { Contact } from "@/lib/pulse";
import { PRODUCT_NAME } from "@/lib/brand";

/**
 * Act I: the scope.
 *
 * Dark whatever theme the visitor is in, via `.gt-night` — the app's own
 * audited dark palette, not a second one. The argument the page makes is that
 * Radar is an instrument, and an instrument's glow does not read on the cream
 * ground the app defaults to. Act II crosses back to that ground, which is the
 * honest thing to do: it is what you actually get.
 */

/**
 * Contacts arriving on the ring, one at a time — the page joining its own trip.
 * Angles are arbitrary and only have to be stable; `memberCount` drives the dot
 * size inside LiveScope, which saturates at three.
 */
const ARRIVALS: Contact[] = [
  { tripId: "l-1", radius: 0.86, angle: -0.95, status: "ahead", memberCount: 1, located: true },
  { tripId: "l-2", radius: 0.52, angle: 2.15, status: "with", memberCount: 2, located: true },
  { tripId: "l-3", radius: 0.93, angle: 3.85, status: "behind", memberCount: 1, located: true },
  { tripId: "l-4", radius: 0.3, angle: 5.42, status: "arrived", memberCount: 3, located: true },
];

const ARRIVAL_MS = 900;

export function Hero() {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    // Reduced motion gets the finished field rather than an empty one: the
    // global CSS override collapses durations, but this is a JS timer and
    // would otherwise still tick.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(ARRIVALS.length);
      return;
    }
    if (shown >= ARRIVALS.length) return;
    const timer = setTimeout(() => setShown((n) => n + 1), ARRIVAL_MS);
    return () => clearTimeout(timer);
  }, [shown]);

  return (
    <section
      className="gt-night relative"
      style={{ background: C.ground, color: C.text }}
    >
      <div className="mx-auto w-full max-w-[1200px] px-6">
        <nav className="flex items-center justify-between" style={{ paddingTop: 28 }}>
          <span className="flex items-center gap-2">
            {/* Mark carries role="img" aria-label={PRODUCT_NAME}; without
                aria-hidden here, assistive tech announces the name twice
                back to back with the literal text node right after it. */}
            <span aria-hidden="true">
              <Mark size={20} />
            </span>
            <span style={{ fontFamily: FONT.display, fontWeight: 600, fontSize: 17, letterSpacing: "-0.02em" }}>
              {PRODUCT_NAME}
            </span>
          </span>
          <Link
            href="/app"
            style={{ fontFamily: FONT.body, fontSize: 15, color: C.muted, padding: "12px 4px" }}
          >
            <span className="gt-cta-new">Open the app</span>
            <span className="gt-cta-returning">Open {PRODUCT_NAME}</span>
          </Link>
        </nav>

        <div className="grid items-center gap-12 min-[900px]:grid-cols-[1.1fr_0.9fr]" style={{ padding: "clamp(48px, 9vh, 104px) 0" }}>
          <div>
            <p
              style={{
                fontFamily: FONT.mono, fontSize: 12, fontWeight: 500,
                letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted,
              }}
            >
              Temporary location sharing
            </p>

            <h1
              style={{
                fontFamily: FONT.display, fontWeight: 500,
                fontSize: "clamp(2.75rem, 6vw, 4.5rem)", lineHeight: 0.98,
                letterSpacing: "-0.04em", marginTop: 20,
              }}
            >
              Know where<br />everyone is.<br />
              <span style={{ color: C.muted }}>Without the calls.</span>
            </h1>

            <p
              style={{
                fontFamily: FONT.body, color: C.muted, marginTop: 24, maxWidth: "46ch",
                fontSize: "clamp(1rem, 1.2vw, 1.1875rem)", lineHeight: 1.55,
              }}
            >
              For groups moving together — a run club, a cycling group, a convoy, a hiking
              party. Join from a link in seconds, with nothing to install. Every trip expires in
              8 hours.
            </p>

            <div className="flex flex-wrap gap-3" style={{ marginTop: 34 }}>
              <Link
                href="/app"
                className="inline-flex items-center justify-center gap-2"
                style={{
                  fontFamily: FONT.body, fontSize: 16, fontWeight: 600,
                  background: C.text, color: C.ground,
                  borderRadius: 14, padding: "0 24px", minHeight: 52,
                }}
              >
                <span className="gt-cta-new">Start a trip</span>
                <span className="gt-cta-returning">Open {PRODUCT_NAME}</span>
                <ArrowRight size={19} />
              </Link>
              <Link
                href="/join"
                className="inline-flex items-center justify-center gap-2"
                style={{
                  fontFamily: FONT.body, fontSize: 16, fontWeight: 600,
                  color: C.text, border: `1px solid ${C.lineStrong}`,
                  borderRadius: 14, padding: "0 24px", minHeight: 52,
                }}
              >
                Join with a code
                <CornerDownLeft size={19} />
              </Link>
            </div>

            {/* Not "no account needed". Google sign-in exists and `signInAvailable`
                is true whenever the API and a client id are configured; claiming
                otherwise misrepresents the product. The accounts section in
                Sections.tsx carries the full story. */}
            <p style={{ fontFamily: FONT.body, fontSize: 13, color: C.faint, marginTop: 18 }}>
              Nothing to install. An account is optional.
            </p>
          </div>

          <div className="grid place-items-center">
            <LiveScope contacts={ARRIVALS.slice(0, shown)} size="min(420px, 78vw)" />
          </div>
        </div>

        <p
          style={{
            fontFamily: FONT.display, fontWeight: 500,
            fontSize: "clamp(1.5rem, 3.2vw, 2.5rem)", lineHeight: 1.15,
            letterSpacing: "-0.03em", color: C.text,
            borderTop: `1px solid ${C.line}`, paddingTop: 32, paddingBottom: 56, maxWidth: "20ch",
          }}
        >
          A map full of pins <span style={{ color: C.muted }}>answers nothing.</span>
        </p>
      </div>

      {/* The horizon: the cut from night to the daylight ground the app uses. */}
      <div style={{ height: 1, background: C.arrived, opacity: 0.55 }} />
    </section>
  );
}
