// No animation and no hooks live here — this is a client component only
// because it dots into `C`, `FONT` and `STATUS`, plain exported values from
// the client-only `Radar.tsx`. A server component cannot import those, so the
// boundary is inherited, not chosen. Don't remove this on the assumption it's
// dead weight; the build breaks without it.
"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { C, FONT, STATUS, Glyph, Mark } from "../Radar";
import { PRODUCT_NAME } from "@/lib/brand";
import type { StatusKey } from "@/lib/types";

/**
 * Act II, §2 onward: the static half of the landing page.
 *
 * Six sections with no state and nothing shared between them but the shell
 * helpers below, so they live in one file until one of them needs to change on
 * its own. Labels, glyphs and colours come from `STATUS` rather than being
 * retyped, so a rename in the app cannot leave the marketing page lying.
 */

const Shell = ({ children, tone = C.ground }: { children: React.ReactNode; tone?: string }) => (
  <section style={{ background: tone, color: C.text }}>
    <div className="mx-auto w-full max-w-[1200px] px-6" style={{ padding: "clamp(64px, 10vh, 120px) 24px" }}>
      {children}
    </div>
  </section>
);

const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <p
    style={{
      fontFamily: FONT.mono, fontSize: 12, fontWeight: 500,
      letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted,
    }}
  >
    {children}
  </p>
);

const H2 = ({ children }: { children: React.ReactNode }) => (
  <h2
    style={{
      fontFamily: FONT.display, fontWeight: 500, marginTop: 18,
      fontSize: "clamp(2rem, 4vw, 3.25rem)", lineHeight: 1.05, letterSpacing: "-0.03em",
    }}
  >
    {children}
  </h2>
);

const Body = ({ children }: { children: React.ReactNode }) => (
  <p
    style={{
      fontFamily: FONT.body, color: C.muted, marginTop: 20, maxWidth: "48ch",
      fontSize: "clamp(1rem, 1.2vw, 1.1875rem)", lineHeight: 1.55,
    }}
  >
    {children}
  </p>
);

// ─── §2 The five statuses ───────────────────────────────────────────────────
// The rules, not the app's own `hint` strings: those are written to fit a
// tooltip at phone width and read as shorthand out of that context.
const RULES: { key: StatusKey; rule: string }[] = [
  { key: "arrived", rule: "Within 100 metres of the destination." },
  { key: "ahead", rule: "More than 150 metres closer than the group's median." },
  { key: "behind", rule: "More than 150 metres further than the median." },
  { key: "with", rule: "Near a majority of the others — counted as neighbours, so one straggler cannot drag the average." },
  { key: "stopped", rule: "Hasn't moved 20 metres in five minutes." },
];

export const Statuses = () => (
  <Shell tone={C.sunken}>
    <Eyebrow>Five statuses</Eyebrow>
    <H2>Read at a glance, not decoded.</H2>

    <div className="grid gap-x-10 gap-y-7 md:grid-cols-2" style={{ marginTop: 44 }}>
      {RULES.map(({ key, rule }) => (
        <div key={key} className="flex items-start gap-4">
          <span
            className="grid place-items-center shrink-0"
            style={{
              width: 46, height: 46, borderRadius: 14,
              background: STATUS[key].soft, color: STATUS[key].color,
            }}
          >
            <Glyph s={key} size={18} />
          </span>
          <span>
            <span
              style={{ fontFamily: FONT.display, fontSize: 19, fontWeight: 600, letterSpacing: "-0.02em" }}
            >
              {STATUS[key].label}
            </span>
            <span
              className="block"
              style={{ fontFamily: FONT.body, fontSize: 15, color: C.muted, lineHeight: 1.5, marginTop: 4 }}
            >
              {rule}
            </span>
          </span>
        </div>
      ))}
    </div>

    <p
      style={{
        fontFamily: FONT.body, fontSize: 15, color: C.muted, marginTop: 42,
        borderTop: `1px solid ${C.line}`, paddingTop: 22, maxWidth: "62ch", lineHeight: 1.55,
      }}
    >
      Status is carried by a glyph, never by colour alone — five colours that all pass contrast on
      one background land in a narrow band of lightness, so they collide in greyscale and for
      colourblind riders. The glyph is the channel. Colour only reinforces it.
    </p>
  </Shell>
);

// ─── §3 Then it forgets ─────────────────────────────────────────────────────
const KEPT = ["Trip name", "When it ran", "Where it was headed", "Who finished"];
const GONE = [
  { label: "Every coordinate", note: "deleted" },
  { label: "The route taken", note: "never recorded" },
];

export const Forgets = () => (
  <Shell>
    <div className="grid gap-12 md:grid-cols-[1fr_0.9fr] md:items-start">
      <div>
        <Eyebrow>Eight hours</Eyebrow>
        <H2>Then it forgets.</H2>
        <Body>
          Eight hours after a trip starts, every rider&rsquo;s coordinates are deleted. Not archived. Not
          anonymised. Deleted.
        </Body>
        <p
          style={{
            fontFamily: FONT.display, fontSize: "clamp(1.125rem, 1.8vw, 1.5rem)",
            lineHeight: 1.35, letterSpacing: "-0.02em", marginTop: 26, maxWidth: "34ch",
          }}
        >
          There is no position-history table to keep them in.{" "}
          <span style={{ color: C.muted }}>
            Coordinates are overwritten in place, never appended.
          </span>
        </p>
      </div>

      <div
        style={{
          background: C.raised, border: `1px solid ${C.line}`,
          borderRadius: 18, padding: "clamp(22px, 2.6vw, 32px)",
        }}
      >
        <p
          style={{
            fontFamily: FONT.mono, fontSize: 12, fontWeight: 500, letterSpacing: "0.12em",
            textTransform: "uppercase", color: C.muted,
          }}
        >
          What a finished trip leaves behind
        </p>
        <p style={{ fontFamily: FONT.body, fontSize: 14, color: C.faint, marginTop: 8, lineHeight: 1.5 }}>
          And only if somebody in it was signed in, and therefore asked for a record. A trip whose
          riders were all anonymous is erased completely.
        </p>

        <div style={{ marginTop: 20 }}>
          {KEPT.map((label) => (
            <div
              key={label}
              className="flex items-center justify-between"
              style={{ padding: "11px 0", borderTop: `1px solid ${C.line}` }}
            >
              <span style={{ fontFamily: FONT.body, fontSize: 15 }}>{label}</span>
              <span style={{ fontFamily: FONT.body, fontSize: 14, color: C.muted }}>kept</span>
            </div>
          ))}
          {GONE.map(({ label, note }) => (
            <div
              key={label}
              className="flex items-center justify-between"
              style={{ padding: "11px 0", borderTop: `1px solid ${C.lineStrong}` }}
            >
              <span style={{ fontFamily: FONT.body, fontSize: 15, color: C.muted }}>{label}</span>
              <span style={{ fontFamily: FONT.body, fontSize: 14, fontWeight: 600, color: C.stopped }}>
                {note}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </Shell>
);

// ─── §3a Optional accounts ──────────────────────────────────────────────────
// The page cannot say "no account needed" and be true: Google sign-in exists.
// Saying so properly strengthens the privacy argument instead of weakening it —
// an optional account that stores no email is a better story than silence.
//
// Every claim here is checked against the code, not the docs:
//   `AccountProfile` in lib/data/account.ts is `{ displayName: string }`;
//   the `users` table is keyed on google_sub + display name with NO email column;
//   signInAvailable = BACKEND === "http" && googleClientId.length > 0.
//
// Sign-in is DESCRIBED, never offered as a call to action — the same posture the
// in-app landing screen takes, where it sits below the two things people came to
// do. That also keeps this honest while the OAuth app is in Testing mode.
const ACCOUNT_GIVES = [
  "A history of the trips you took.",
  "A name that follows you, instead of being typed into every trip.",
  "Settings that follow you between devices.",
];

export const Accounts = () => (
  <Shell tone={C.sunken}>
    <div className="grid gap-12 md:grid-cols-[0.95fr_1.05fr] md:items-start">
      <div>
        <Eyebrow>Optional accounts</Eyebrow>
        <H2>Signed in or not, it works the same.</H2>
        <Body>
          Radar needs no account. Starting a trip, joining one, the verdict, the map — all of it
          works with nobody signed in.
        </Body>
      </div>

      <div>
        <p
          style={{
            fontFamily: FONT.mono, fontSize: 12, fontWeight: 500, letterSpacing: "0.12em",
            textTransform: "uppercase", color: C.muted,
          }}
        >
          What signing in with Google adds
        </p>
        <div style={{ marginTop: 14 }}>
          {ACCOUNT_GIVES.map((line) => (
            <p
              key={line}
              style={{
                fontFamily: FONT.body, fontSize: 16, lineHeight: 1.5,
                padding: "12px 0", borderTop: `1px solid ${C.line}`,
              }}
            >
              {line}
            </p>
          ))}
        </div>
        <p
          style={{
            fontFamily: FONT.display, fontSize: "clamp(1.0625rem, 1.5vw, 1.375rem)",
            lineHeight: 1.4, letterSpacing: "-0.02em", marginTop: 26,
            borderTop: `1px solid ${C.lineStrong}`, paddingTop: 22,
          }}
        >
          It takes two fields from Google: an account identifier and a display name.{" "}
          <span style={{ color: C.muted }}>
            Not your email. Not your picture. There is no email column on the users table to put
            one in.
          </span>
        </p>
      </div>
    </div>
  </Shell>
);

// ─── §4 How it works ────────────────────────────────────────────────────────
const STEPS = [
  // Destination search shipped (DestinationSearch.tsx, GET /v1/geocode proxying
  // Photon), so "drop a pin" alone understates what Create actually does.
  { n: "01", title: "Start a trip", body: "Name it if you like, and set where you're headed — search for the place, or drop a pin on the map. Both optional." },
  { n: "02", title: "Share the code", body: "Six characters, a link, or a QR code. No 0 or O, no 1 or I, so nobody mishears it." },
  { n: "03", title: "Ride", body: "Everyone sees the same one-line verdict. Nobody installs anything." },
];

export const HowItWorks = () => (
  <Shell>
    <Eyebrow>How it works</Eyebrow>
    <H2>Three taps, then nothing to manage.</H2>

    <div className="grid gap-8 md:grid-cols-3" style={{ marginTop: 46 }}>
      {STEPS.map(({ n, title, body }) => (
        <div key={n} style={{ borderTop: `1px solid ${C.lineStrong}`, paddingTop: 20 }}>
          <span
            className="tnum"
            style={{ fontFamily: FONT.mono, fontSize: 13, letterSpacing: "0.12em", color: C.faint }}
          >
            {n}
          </span>
          <p style={{ fontFamily: FONT.display, fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", marginTop: 12 }}>
            {title}
          </p>
          <p style={{ fontFamily: FONT.body, fontSize: 15, color: C.muted, lineHeight: 1.55, marginTop: 8 }}>
            {body}
          </p>
        </div>
      ))}
    </div>
  </Shell>
);

// ─── §5 Craft ───────────────────────────────────────────────────────────────
const CRAFT = [
  { title: "Light by default", body: "A dark screen loses to reflected sunlight, so the light theme is the tuned one. Dark is there for night." },
  { title: "Signage type", body: "Archivo and Signika, drawn for wayfinding rather than for web apps. They hold at 13px in glare." },
  // The trailing caveat is load-bearing: the app only claims a wake lock when
  // `"wakeLock" in navigator`, so the landing page must not claim more.
  { title: "The screen stays awake", body: "Geolocation stops being delivered when the screen sleeps, which is exactly when the group needs it. Radar holds the screen on for the length of a trip, wherever the browser allows it." },
  { title: "Writes speed up as you do", body: "Every 20 seconds at rest, every 5 at 30 km/h. A cyclist covers 30 metres in under four seconds." },
];

export const Craft = () => (
  <Shell tone={C.sunken}>
    <Eyebrow>Built to be read at speed</Eyebrow>
    <H2>Designed for a phone on a handlebar.</H2>

    <div className="grid gap-x-10 gap-y-8 md:grid-cols-2" style={{ marginTop: 44 }}>
      {CRAFT.map(({ title, body }) => (
        <div key={title}>
          <p style={{ fontFamily: FONT.display, fontSize: 19, fontWeight: 600, letterSpacing: "-0.02em" }}>
            {title}
          </p>
          <p style={{ fontFamily: FONT.body, fontSize: 15, color: C.muted, lineHeight: 1.55, marginTop: 6, maxWidth: "44ch" }}>
            {body}
          </p>
        </div>
      ))}
    </div>
  </Shell>
);

// ─── §6 Close ───────────────────────────────────────────────────────────────
export const Close = () => (
  <Shell>
    <div className="grid place-items-center text-center">
      <H2>Start a trip.</H2>
      <Body>It takes about ten seconds, and it expires by itself.</Body>
      <div className="flex flex-wrap justify-center gap-3" style={{ marginTop: 32 }}>
        <Link
          href="/app"
          className="inline-flex items-center justify-center gap-2"
          style={{
            fontFamily: FONT.body, fontSize: 16, fontWeight: 600,
            background: C.text, color: C.ground, borderRadius: 14, padding: "0 24px", minHeight: 52,
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
            fontFamily: FONT.body, fontSize: 16, fontWeight: 600, color: C.text,
            border: `1px solid ${C.lineStrong}`, borderRadius: 14, padding: "0 24px", minHeight: 52,
          }}
        >
          Join with a code
        </Link>
      </div>
    </div>
  </Shell>
);

export const SiteFooter = () => (
  <footer style={{ background: C.ground, borderTop: `1px solid ${C.line}` }}>
    <div
      className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-4 px-6"
      style={{ paddingTop: 30, paddingBottom: "calc(30px + var(--safe-b))" }}
    >
      <span className="flex items-center gap-2">
        {/* Mark carries role="img" aria-label={PRODUCT_NAME}; without
            aria-hidden here, assistive tech announces the name twice back
            to back with the literal text node right after it. */}
        <span aria-hidden="true">
          <Mark size={18} />
        </span>
        <span style={{ fontFamily: FONT.display, fontSize: 15, fontWeight: 600, letterSpacing: "-0.02em" }}>
          {PRODUCT_NAME}
        </span>
        <span style={{ fontFamily: FONT.body, fontSize: 14, color: C.muted }}>
          — temporary location sharing for groups moving together.
        </span>
      </span>
      <span className="flex items-center gap-5">
        <Link href="/app" style={{ fontFamily: FONT.body, fontSize: 14, color: C.muted }}>
          Open {PRODUCT_NAME}
        </Link>
        <Link href="/join" style={{ fontFamily: FONT.body, fontSize: 14, color: C.muted }}>
          Join a trip
        </Link>
      </span>
    </div>
  </footer>
);
