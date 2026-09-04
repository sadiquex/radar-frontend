"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight, ArrowLeft, Share2, Copy, MapPin, Flag, Users, Bell, BellOff,
  Check, Plus, X, Navigation, ChevronRight, CornerDownLeft, Maximize2,
  MoreHorizontal, Sun, Moon, Monitor, Smartphone, AlertTriangle,
} from "lucide-react";
import type { Participant, StatusKey } from "@/lib/types";
import type { Verdict, VerdictTone } from "@/lib/verdict";
import type { ThemeChoice } from "@/lib/theme";
import { PRODUCT_NAME } from "@/lib/brand";
import { LiveMap, type MapMarker } from "./LiveMap";

// ─── View model ───────────────────────────────────────────────────────────────
// Screens render `Member`s (a presentation view of a Participant). `located` is
// false until a member has shared a position, and screens show a pre-tracking
// state rather than inventing a status.
export interface Member {
  id: string;
  name: string;
  you: boolean;
  located: boolean;
  kmLeft: number;
  status: StatusKey;
  seen: number; // seconds since last seen
  slot: number; // index into the theme's avatar palette
}

// Avatar colours are declared per theme in globals.css (--c-av-N / --c-av-N-ink)
// because the light theme needs dark fills with white ink and the dark theme
// needs pastels with dark ink. Slots are index-aligned so a person's colour
// survives a theme switch.
const AVATAR_SLOTS = 8;

export function slotForId(id: string): number {
  let h = 7;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % AVATAR_SLOTS;
}

export function memberFromParticipant(
  p: Participant,
  clientId: string,
  now: number = Date.now(),
  // Position in the trip's participant list. Preferred over hashing the id:
  // with 8 slots and 4 riders, hashing collides often enough that two people
  // get the same colour, which defeats telling them apart at a glance. The
  // list order is identical on every device because it is the stored array.
  index?: number
): Member {
  return {
    id: p.id,
    name: p.displayName,
    you: p.id === clientId,
    located: p.latitude != null && p.longitude != null,
    kmLeft: 0,
    status: p.status ?? "with",
    seen: Math.max(0, Math.floor((now - p.lastSeenAt) / 1000)),
    slot: index === undefined ? slotForId(p.id) : index % AVATAR_SLOTS,
  };
}

// ─── Design tokens ──────────────────────────────────────────────────────────
// Every value is a CSS custom property reference, so switching themes is one
// attribute on <html> with no React re-render and no flash. Values live in
// app/globals.css. See docs/superpowers/specs/2026-09-04-mobile-light-redesign-design.md
export const C = {
  ground: "var(--c-ground)",
  raised: "var(--c-raised)",
  sunken: "var(--c-sunken)",
  line: "var(--c-line)",
  lineStrong: "var(--c-line-strong)",
  text: "var(--c-text)",
  muted: "var(--c-muted)",
  // `faint` is NOT a text colour: at 3.84 on the light ground it clears the
  // 3:1 needed for non-text UI and nothing more. Labels use `muted`.
  faint: "var(--c-faint)",
  ahead: "var(--c-ahead)",
  behind: "var(--c-behind)",
  withg: "var(--c-withg)",
  stopped: "var(--c-stopped)",
  arrived: "var(--c-arrived)",
  scrim: "var(--c-scrim)",
};

export const FONT = {
  display: "var(--font-bricolage)",
  body: "var(--font-inter)",
  mono: "var(--font-mono)",
};

// Safe-area composites. Mobile is the tuned case, so every screen edge goes
// through one of these rather than a bare padding value.
const PAD_T = "calc(var(--safe-t) + 14px)";
const PAD_B = "calc(var(--safe-b) + 16px)";

// Colour alone cannot carry status: five statuses that all pass AA on one
// ground are forced into a narrow luminance band, so they collide in greyscale
// and for colourblind users. The glyph is the channel; colour reinforces it.
const STATUS: Record<
  StatusKey,
  { color: string; soft: string; glyph: string; label: string; hint: string }
> = {
  ahead:   { color: C.ahead,   soft: "var(--c-ahead-soft)",   glyph: "››", label: "Ahead",      hint: "Closer to the destination than the group" },
  behind:  { color: C.behind,  soft: "var(--c-behind-soft)",  glyph: "‹‹", label: "Behind",     hint: "Trailing the group" },
  with:    { color: C.withg,   soft: "var(--c-withg-soft)",   glyph: "∴",       label: "With group", hint: "Within 100m of the cluster" },
  stopped: { color: C.stopped, soft: "var(--c-stopped-soft)", glyph: "‖",       label: "Stopped",    hint: "No movement for 5+ min" },
  arrived: { color: C.arrived, soft: "var(--c-arrived-soft)", glyph: "✓",       label: "Arrived",    hint: "At the destination" },
};

const TONE_COLOR: Record<VerdictTone, string> = {
  alarm: C.stopped,
  attention: C.behind,
  info: C.ahead,
  calm: C.text,
  waiting: C.muted,
};

const fmtSeen = (s: number) =>
  s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`;

// ─── Small primitives ───────────────────────────────────────────────────────

// Every icon-only control is a 44px box. Bare 20px glyphs are unhittable with
// cold hands on a moving bike.
const IconButton = ({
  onClick, label, children, tone = C.muted, size = 44,
}: {
  onClick?: () => void;
  label: string;
  children: React.ReactNode;
  tone?: string;
  size?: number;
}) => (
  <button
    onClick={onClick}
    aria-label={label}
    className="grid place-items-center rounded-full shrink-0 transition-transform active:scale-[0.9]"
    style={{ width: size, height: size, color: tone }}
  >
    {children}
  </button>
);

const Glyph = ({ s, size = 12 }: { s: StatusKey; size?: number }) => (
  <span
    aria-hidden
    style={{ fontFamily: FONT.mono, fontWeight: 700, fontSize: size, lineHeight: 1 }}
  >
    {STATUS[s].glyph}
  </span>
);

const StatusPill = ({ s }: { s: StatusKey }) => (
  <span
    className="inline-flex items-center gap-1.5 rounded-full"
    style={{
      background: STATUS[s].soft,
      color: STATUS[s].color,
      border: `1px solid ${STATUS[s].color}`,
      padding: "3px 9px",
      fontSize: 12,
    }}
  >
    <Glyph s={s} size={11} />
    <span style={{ fontFamily: FONT.body, fontWeight: 600 }}>{STATUS[s].label}</span>
  </span>
);

const Avatar = ({ m, size = 42, ring = false }: { m: Member; size?: number; ring?: boolean }) => (
  <div
    className="grid place-items-center shrink-0"
    style={{
      width: size, height: size, borderRadius: 999,
      background: `var(--c-av-${m.slot})`,
      color: `var(--c-av-${m.slot}-ink)`,
      fontFamily: FONT.display,
      fontSize: Math.max(12, Math.round(size * 0.42)),
      fontWeight: 600,
      outline: ring ? `2px solid ${C.text}` : "none",
      outlineOffset: 2,
    }}
  >
    {m.name[0]?.toUpperCase() ?? "?"}
  </div>
);

// A status badge pinned to an avatar, for the horizon.
const AvatarWithStatus = ({ m, size = 32 }: { m: Member; size?: number }) => (
  <div style={{ position: "relative" }}>
    <Avatar m={m} size={size} ring={m.you} />
    {m.located && (
      <span
        className="grid place-items-center"
        style={{
          position: "absolute", top: -4, right: -4, width: 17, height: 17,
          borderRadius: 999, background: STATUS[m.status].color, color: C.ground,
        }}
      >
        <Glyph s={m.status} size={9} />
      </span>
    )}
  </div>
);

const PrimaryButton = ({
  onClick, children, disabled = false, tone,
}: {
  onClick?: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  tone?: string;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="w-full rounded-2xl flex items-center justify-between px-5 transition-transform active:scale-[0.98] disabled:opacity-60 disabled:active:scale-100"
    style={{
      minHeight: 56,
      background: tone ?? C.text,
      color: C.ground,
      fontFamily: FONT.body,
      fontWeight: 600,
      fontSize: 16,
    }}
  >
    {children}
  </button>
);

const SecondaryButton = ({
  onClick, children,
}: { onClick?: () => void; children: React.ReactNode }) => (
  <button
    onClick={onClick}
    className="w-full rounded-2xl flex items-center justify-between px-5 transition-transform active:scale-[0.98]"
    style={{
      minHeight: 56,
      background: "transparent",
      color: C.text,
      border: `1.5px solid ${C.lineStrong}`,
      fontFamily: FONT.body,
      fontWeight: 600,
      fontSize: 16,
    }}
  >
    {children}
  </button>
);

const Eyebrow = ({ children, tone = C.muted }: { children: React.ReactNode; tone?: string }) => (
  <div style={{ fontFamily: FONT.mono, fontSize: 12, color: tone, letterSpacing: "0.1em" }}>
    {children}
  </div>
);

const Field = ({
  label, children,
}: { label: string; children: React.ReactNode }) => (
  <label className="block">
    <Eyebrow>{label}</Eyebrow>
    <div
      className="flex items-center gap-3"
      style={{ borderBottom: `1.5px solid ${C.lineStrong}`, paddingTop: 8, paddingBottom: 10 }}
    >
      {children}
    </div>
  </label>
);

// ─── The signature: Group Horizon ───────────────────────────────────────────
const Horizon = ({
  members, total, destinationName,
}: { members: Member[]; total: number; destinationName: string | null }) => {
  const located = members.filter((m) => m.located);
  const sorted = [...located].sort((a, b) => b.kmLeft - a.kmLeft);

  // Two riders a few hundred metres apart land within an avatar's width of each
  // other, and their distance labels overprint into unreadable mush. Alternate
  // the label row for anyone closer than a label-width to the previous pin.
  const pct = (m: Member) =>
    Math.max(4, Math.min(88, (total > 0 ? 1 - m.kmLeft / total : 0) * 92));
  const LABEL_GAP_PCT = 11;
  const rows: number[] = [];
  sorted.forEach((m, i) => {
    const prev = i > 0 ? pct(sorted[i - 1]) : -Infinity;
    const prevRow = i > 0 ? rows[i - 1] : 1;
    rows.push(pct(m) - prev < LABEL_GAP_PCT && prevRow === 0 ? 1 : 0);
  });

  return (
    <div className="w-full" style={{ paddingTop: 10, paddingBottom: 4 }}>
      <div className="relative" style={{ height: 78 }}>
        <div
          className="absolute left-0 right-0"
          style={{
            top: 24, height: 2,
            background: `linear-gradient(90deg, ${C.line}, ${C.muted}, ${C.arrived})`,
          }}
        />
        <div
          className="absolute grid place-items-center"
          style={{
            right: 0, top: 12, width: 26, height: 26, borderRadius: 999,
            background: C.ground, border: `2px solid ${C.arrived}`, color: C.arrived,
          }}
        >
          <Flag size={12} />
        </div>
        {sorted.map((m, i) => (
          <div
            key={m.id}
            className="absolute transition-all duration-700"
            style={{ left: `${pct(m)}%`, top: 8, transform: "translateX(-50%)" }}
          >
            <div className="flex flex-col items-center">
              <AvatarWithStatus m={m} size={32} />
              <div
                className="tnum"
                style={{
                  fontFamily: FONT.mono, fontSize: 12, fontWeight: 500,
                  color: C.muted, whiteSpace: "nowrap",
                  marginTop: rows[i] === 1 ? 20 : 4,
                }}
              >
                {m.kmLeft < 0.5 ? "here" : m.kmLeft.toFixed(1)}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div
        className="flex items-center justify-between"
        style={{ fontFamily: FONT.mono, fontSize: 12, color: C.muted, letterSpacing: "0.08em" }}
      >
        <span>START</span>
        <span>{(destinationName ?? "DESTINATION").toUpperCase()}</span>
      </div>
    </div>
  );
};

// ─── The verdict ────────────────────────────────────────────────────────────
// The one thing to read. Largest type on the screen, at the top, because that
// is where the eye lands and a rider at effort reads one field, not eight.
const VerdictBlock = ({ verdict }: { verdict: Verdict }) => {
  const tone = TONE_COLOR[verdict.tone];
  return (
    <div>
      <Eyebrow tone={verdict.tone === "calm" || verdict.tone === "waiting" ? C.muted : tone}>
        {verdict.eyebrow}
      </Eyebrow>
      {/* Live region carries the headline only. The screen re-ticks every 15s
          and distances drift constantly, so including the metric would make a
          screen reader read the verdict aloud every few seconds. */}
      <h2
        aria-live="polite"
        style={{
          fontFamily: FONT.display, fontSize: 34, lineHeight: 1.03,
          letterSpacing: "-0.035em", color: C.text, fontWeight: 500, marginTop: 4,
        }}
      >
        {verdict.headline}
      </h2>
      {verdict.metric && (
        <div className="flex items-baseline gap-2" style={{ marginTop: 6 }}>
          <span
            className="tnum"
            style={{ fontFamily: FONT.mono, fontSize: 30, fontWeight: 700, color: tone, lineHeight: 1 }}
          >
            {verdict.metric}
          </span>
          <span
            style={{ fontFamily: FONT.mono, fontSize: 12, color: C.muted, letterSpacing: "0.08em" }}
          >
            {verdict.metricLabel}
          </span>
        </div>
      )}
    </div>
  );
};

// ─── Screen: Landing ────────────────────────────────────────────────────────
export const Landing = ({ onStart, onJoin }: { onStart: () => void; onJoin: () => void }) => (
  <div
    className="flex flex-col h-full px-6"
    style={{ paddingTop: PAD_T, paddingBottom: PAD_B }}
  >
    <div className="flex items-center gap-2">
      <div style={{ width: 8, height: 8, borderRadius: 999, background: C.behind }} />
      <span
        style={{ fontFamily: FONT.display, fontWeight: 600, letterSpacing: "-0.02em", color: C.text, fontSize: 16 }}
      >
        {PRODUCT_NAME}
      </span>
    </div>

    <div className="flex-1 flex flex-col justify-center">
      <div className="relative" style={{ height: 44, marginBottom: 28 }}>
        <div
          className="absolute left-0 right-0"
          style={{ top: "50%", height: 2, background: `linear-gradient(90deg, ${C.line}, ${C.muted}, ${C.arrived})` }}
        />
        {[0.12, 0.34, 0.5, 0.7, 0.94].map((t, i) => {
          const keys: StatusKey[] = ["behind", "stopped", "with", "ahead", "arrived"];
          return (
            <div
              key={i}
              className="absolute grid place-items-center"
              style={{
                left: `${t * 100}%`, top: "50%", transform: "translate(-50%,-50%)",
                width: 22, height: 22, borderRadius: 999,
                background: STATUS[keys[i]].color, color: C.ground,
              }}
            >
              <Glyph s={keys[i]} size={10} />
            </div>
          );
        })}
      </div>

      <h1
        style={{
          fontFamily: FONT.display, fontSize: 40, lineHeight: 1.02,
          letterSpacing: "-0.035em", color: C.text, fontWeight: 500,
        }}
      >
        Know where<br />everyone is.<br />
        <span style={{ color: C.muted }}>Without the calls.</span>
      </h1>

      <p
        style={{ fontFamily: FONT.body, color: C.muted, fontSize: 15, lineHeight: 1.5, marginTop: 20 }}
      >
        Temporary location sharing for groups moving together. No accounts. No app to install.
        Expires in 8 hours.
      </p>
    </div>

    <div className="flex flex-col gap-3">
      <PrimaryButton onClick={onStart}>
        Start a trip
        <ArrowRight size={20} />
      </PrimaryButton>
      <SecondaryButton onClick={onJoin}>
        Join with a code
        <CornerDownLeft size={20} />
      </SecondaryButton>
    </div>
  </div>
);

// ─── Screen: Create ─────────────────────────────────────────────────────────
export const Create = ({
  onBack, onCreate, busy = false, wakeSupported = false, error,
}: {
  onBack: () => void;
  onCreate: (input: {
    name?: string;
    destinationName?: string;
    destinationLat?: number;
    destinationLng?: number;
  }) => void;
  busy?: boolean;
  wakeSupported?: boolean;
  /** Set when creating the trip failed — a backend request can, unlike a
   *  localStorage write, so the button must be able to explain itself. */
  error?: string | null;
}) => {
  const [dest, setDest] = useState("");
  const [name, setName] = useState("");
  const [showMap, setShowMap] = useState(false);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4" style={{ paddingTop: PAD_T }}>
        <IconButton onClick={onBack} label="Back" tone={C.text}>
          <ArrowLeft size={22} />
        </IconButton>
      </div>

      {/* The CTA lives outside this scroller so the soft keyboard can never
          push it out of reach. */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 no-scrollbar">
        <h2
          style={{
            fontFamily: FONT.display, fontSize: 28, color: C.text, fontWeight: 500,
            letterSpacing: "-0.02em", marginTop: 8, marginBottom: 6,
            textWrap: "balance",
          } as React.CSSProperties}
        >
          New trip
        </h2>
        <p
          style={{ fontFamily: FONT.body, color: C.muted, fontSize: 15, marginBottom: 26, textWrap: "pretty" } as React.CSSProperties}
        >
          Both optional, but a destination unlocks the arrival status and the map.
        </p>

        <Field label="DESTINATION">
          <MapPin size={20} style={{ color: C.muted }} />
          <input
            value={dest}
            onChange={(e) => setDest(e.target.value)}
            placeholder="Where to?"
            className="flex-1 bg-transparent outline-none"
            /* 16px minimum: anything smaller and iOS Safari zooms on focus. */
            style={{ color: C.text, fontFamily: FONT.body, fontSize: 16 }}
          />
        </Field>

        <button
          onClick={() => setShowMap((v) => !v)}
          className="flex items-center gap-2 transition-transform active:scale-[0.97]"
          style={{
            fontFamily: FONT.body, fontSize: 14, minHeight: 44,
            color: pin ? C.arrived : C.muted, fontWeight: 500,
          }}
        >
          {pin ? <Check size={16} /> : <MapPin size={16} />}
          {pin ? "Destination pinned · tap to adjust" : "Pin the exact spot on a map"}
        </button>

        {showMap && (
          <div
            className="rounded-2xl overflow-hidden"
            style={{ height: 280, border: `1px solid ${C.line}`, marginBottom: 18 }}
          >
            <LiveMap markers={[]} destination={pin} onPick={setPin} className="h-full" />
          </div>
        )}

        <div style={{ marginTop: 20 }}>
          <Field label="TRIP NAME">
            <Users size={20} style={{ color: C.muted }} />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Call it something"
              className="flex-1 bg-transparent outline-none"
              style={{ color: C.text, fontFamily: FONT.body, fontSize: 16 }}
            />
          </Field>
        </div>

        <div
          className="rounded-2xl"
          style={{ background: C.raised, border: `1px solid ${C.line}`, padding: 16, marginTop: 24 }}
        >
          <div className="flex items-start gap-3">
            <Smartphone size={18} style={{ color: C.arrived, marginTop: 2, flexShrink: 0 }} />
            <div>
              <div style={{ fontFamily: FONT.body, fontSize: 15, color: C.text, fontWeight: 600, marginBottom: 4 }}>
                {wakeSupported ? "We'll keep your screen awake" : "Keep this tab open while moving"}
              </div>
              <div style={{ fontFamily: FONT.body, fontSize: 13, color: C.muted, lineHeight: 1.5 }}>
                {wakeSupported
                  ? "Browsers pause location when the screen sleeps, so the trip holds it awake while you move. You can turn that off any time."
                  : "This browser can't hold the screen awake, and location pauses when the screen is off. Add to home screen for the best result."}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6" style={{ paddingTop: 12, paddingBottom: PAD_B }}>
        {error && (
          <div
            className="flex items-start gap-2"
            style={{ fontFamily: FONT.body, fontSize: 14, color: C.stopped, marginBottom: 14 }}
            role="alert"
          >
            <AlertTriangle size={16} style={{ marginTop: 2, flexShrink: 0 }} />
            {error}
          </div>
        )}
        <PrimaryButton
          disabled={busy}
          onClick={() =>
            onCreate({
              name: name.trim() || undefined,
              destinationName: dest.trim() || undefined,
              destinationLat: pin?.lat,
              destinationLng: pin?.lng,
            })
          }
        >
          {busy ? "Creating…" : "Create trip"}
          <ArrowRight size={20} />
        </PrimaryButton>
      </div>
    </div>
  );
};

// ─── Screen: Share ──────────────────────────────────────────────────────────
export const Share = ({
  shareCode, shareUrl, members, onBack, onOpen,
}: {
  shareCode: string;
  shareUrl: string;
  members: Member[];
  onBack: () => void;
  onOpen: () => void;
}) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      /* clipboard may be blocked; the code is still on screen */
    }
    setCopied(true);
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      try { navigator.vibrate(20); } catch { /* ignore */ }
    }
    setTimeout(() => setCopied(false), 1600);
  };

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: `Join my trip on ${PRODUCT_NAME}`, url: shareUrl });
        return;
      } catch { /* cancelled — fall through to copy */ }
    }
    void copy();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4" style={{ paddingTop: PAD_T }}>
        <IconButton onClick={onBack} label="Back" tone={C.text}>
          <ArrowLeft size={22} />
        </IconButton>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 no-scrollbar">
        <h2
          style={{
            fontFamily: FONT.display, fontSize: 28, color: C.text, fontWeight: 500,
            letterSpacing: "-0.02em", marginTop: 8,
          }}
        >
          Share with the group
        </h2>
        <p style={{ fontFamily: FONT.body, color: C.muted, fontSize: 15, marginTop: 6 }}>
          Anyone with the link or code can join. Expires in 8 hours.
        </p>

        {/* The code is the hero: read it aloud, or tap to copy the link.
            (The old decorative QR looked scannable but never was, so it's gone.) */}
        <button
          onClick={copy}
          className="w-full rounded-2xl transition-transform active:scale-[0.99]"
          style={{
            background: C.raised, border: `1.5px solid ${C.lineStrong}`,
            padding: "22px 16px", marginTop: 26, textAlign: "center",
          }}
        >
          <Eyebrow>{copied ? "LINK COPIED" : "TRIP CODE · TAP TO COPY LINK"}</Eyebrow>
          <div
            className="tnum"
            style={{
              fontFamily: FONT.display, fontSize: 44, letterSpacing: "0.1em",
              color: C.text, fontWeight: 600, marginTop: 8, lineHeight: 1,
            }}
          >
            {shareCode}
          </div>
        </button>

        <div className="flex gap-3" style={{ marginTop: 14 }}>
          <button
            onClick={copy}
            className="flex-1 rounded-2xl flex items-center justify-center gap-2 transition-transform active:scale-[0.97]"
            style={{
              minHeight: 52, background: "transparent", color: C.text,
              border: `1.5px solid ${C.lineStrong}`, fontFamily: FONT.body, fontSize: 15, fontWeight: 600,
            }}
          >
            {copied ? <Check size={18} style={{ color: C.arrived }} /> : <Copy size={18} />}
            {copied ? "Copied" : "Copy link"}
          </button>
          <button
            onClick={share}
            className="flex-1 rounded-2xl flex items-center justify-center gap-2 transition-transform active:scale-[0.97]"
            style={{
              minHeight: 52, background: "transparent", color: C.text,
              border: `1.5px solid ${C.lineStrong}`, fontFamily: FONT.body, fontSize: 15, fontWeight: 600,
            }}
          >
            <Share2 size={18} /> Share
          </button>
        </div>

        <div style={{ marginTop: 28 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
            <Eyebrow>JOINED</Eyebrow>
            <span
              className="tnum"
              style={{ fontFamily: FONT.mono, fontSize: 12, color: C.muted }}
            >
              {members.length} {members.length === 1 ? "person" : "people"}
            </span>
          </div>
          <div className="flex items-center" style={{ borderTop: `1px solid ${C.line}`, paddingTop: 14 }}>
            {members.length === 0 ? (
              <span style={{ fontFamily: FONT.body, fontSize: 14, color: C.muted }}>
                Waiting for people to join…
              </span>
            ) : (
              <div className="flex" style={{ gap: 6 }}>
                {members.map((m) => (
                  <Avatar key={m.id} m={m} size={38} ring={m.you} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="px-6" style={{ paddingTop: 12, paddingBottom: PAD_B }}>
        <PrimaryButton onClick={onOpen}>
          Open group view
          <ArrowRight size={20} />
        </PrimaryButton>
      </div>
    </div>
  );
};

// ─── Screen: Join ───────────────────────────────────────────────────────────
export const Join = ({
  prefilledCode = "", tripName, alphabet, onBack, onJoin, busy = false, error,
}: {
  prefilledCode?: string;
  tripName?: string | null;
  alphabet: string;
  onBack: () => void;
  onJoin: (input: { code: string; name: string }) => void;
  busy?: boolean;
  error?: string | null;
}) => {
  const [code, setCode] = useState(prefilledCode);
  const [name, setName] = useState("");
  const codeLocked = prefilledCode.length > 0;
  const step = !code ? 0 : !name ? 1 : 2;

  // The trip is looked up in an effect, so on the first render prefilledCode is
  // still "" and useState captures that. Without this, arriving by link left
  // the code field empty *and* locked — the join button stayed on "Enter a
  // code" with no way to type one, which dead-ends every shared link.
  useEffect(() => {
    if (prefilledCode) setCode(prefilledCode);
  }, [prefilledCode]);

  // The share alphabet excludes 0/O/1/I on purpose, so anything outside it is
  // a typo. Filtering as they type beats failing after submit.
  const onCode = (raw: string) =>
    setCode(
      raw.toUpperCase().split("").filter((ch) => alphabet.includes(ch)).join("").slice(0, 6)
    );

  return (
    <div className="flex flex-col h-full">
      <div className="px-4" style={{ paddingTop: PAD_T }}>
        <IconButton onClick={onBack} label="Back" tone={C.text}>
          <ArrowLeft size={22} />
        </IconButton>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 no-scrollbar">
        <h2
          style={{
            fontFamily: FONT.display, fontSize: 28, color: C.text, fontWeight: 500,
            letterSpacing: "-0.02em", marginTop: 8, marginBottom: 28,
          }}
        >
          {tripName ? `Join "${tripName}"` : "Join a trip"}
        </h2>

        <Field label="TRIP CODE">
          <input
            value={code}
            onChange={(e) => onCode(e.target.value)}
            placeholder="e.g. KMS4F2"
            disabled={codeLocked}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={6}
            className="flex-1 bg-transparent outline-none disabled:opacity-70"
            style={{
              color: C.text, fontFamily: FONT.display, fontSize: 26,
              letterSpacing: "0.1em", fontWeight: 600,
            }}
          />
        </Field>

        {step >= 1 && (
          <div style={{ marginTop: 24 }}>
            <Field label="YOUR NAME">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="So the group knows who you are"
                autoFocus={codeLocked}
                className="flex-1 bg-transparent outline-none"
                style={{ color: C.text, fontFamily: FONT.body, fontSize: 16 }}
              />
            </Field>
          </div>
        )}

        {step >= 2 && (
          <div
            className="rounded-2xl"
            style={{ background: C.raised, border: `1px solid ${C.line}`, padding: 16, marginTop: 26 }}
          >
            <div className="flex items-start gap-3">
              <MapPin size={18} style={{ color: C.arrived, marginTop: 2, flexShrink: 0 }} />
              <div>
                <div style={{ fontFamily: FONT.body, fontSize: 15, color: C.text, fontWeight: 600, marginBottom: 4 }}>
                  Location sharing comes next
                </div>
                <div style={{ fontFamily: FONT.body, fontSize: 13, color: C.muted, lineHeight: 1.5 }}>
                  Shared only with people in this trip. Stops when the trip ends or you leave.
                  Nothing is stored after.
                </div>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div
            className="flex items-start gap-2"
            style={{ fontFamily: FONT.body, fontSize: 14, color: C.stopped, marginTop: 18 }}
            role="alert"
          >
            <AlertTriangle size={16} style={{ marginTop: 2, flexShrink: 0 }} />
            {error}
          </div>
        )}
      </div>

      <div className="px-6" style={{ paddingTop: 12, paddingBottom: PAD_B }}>
        <PrimaryButton
          disabled={step < 2 || busy}
          onClick={() => { if (step >= 2 && !busy) onJoin({ code, name: name.trim() }); }}
        >
          {busy ? "Joining…" : step === 0 ? "Enter a code" : step === 1 ? "Add your name" : "Join trip"}
          <ArrowRight size={20} />
        </PrimaryButton>
      </div>
    </div>
  );
};

// ─── Screen: Group ──────────────────────────────────────────────────────────
export type LocationNotice = "denied" | "unsupported" | "locating" | null;

// Anyone the group might need to act on. Members travelling with the pack are
// the uninteresting case and collapse into one line; a member with no position
// yet is genuinely worth surfacing, so they count as an outlier too.
function partition(members: Member[]) {
  const order: StatusKey[] = ["stopped", "behind", "arrived", "ahead"];
  const outliers = members
    .filter((m) => !m.located || m.status !== "with")
    .sort((a, b) => {
      if (a.located !== b.located) return a.located ? -1 : 1;
      return order.indexOf(a.status) - order.indexOf(b.status);
    });
  const together = members.filter((m) => m.located && m.status === "with");
  return { outliers, together };
}

export const Group = ({
  tripName, destinationName, members, verdict, isCreator,
  locationNotice = null, notifsOn = false,
  onToggleNotifs, onOpenMenu, onSelectMember, onOpenMap, onInvite,
}: {
  tripName: string | null;
  destinationName: string | null;
  members: Member[];
  verdict: Verdict;
  isCreator: boolean;
  locationNotice?: LocationNotice;
  notifsOn?: boolean;
  onToggleNotifs?: () => void;
  onOpenMenu: () => void;
  onSelectMember: (id: string) => void;
  onOpenMap: () => void;
  onInvite: () => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const anyLocated = members.some((m) => m.located);
  const { outliers, together } = partition(members);
  const totalKm = Math.max(1, ...members.filter((m) => m.located).map((m) => m.kmLeft));
  const shown = expanded ? [...outliers, ...together] : outliers;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 flex items-start justify-between" style={{ paddingTop: PAD_T }}>
        <div style={{ paddingLeft: 8, paddingTop: 4 }}>
          <div className="flex items-center gap-2">
            <div
              className="animate-pulse"
              style={{ width: 7, height: 7, borderRadius: 999, background: C.arrived }}
            />
            <span style={{ fontFamily: FONT.mono, fontSize: 12, color: C.muted, letterSpacing: "0.1em" }}>
              LIVE
            </span>
          </div>
          <div
            style={{
              fontFamily: FONT.display, fontSize: 17, color: C.muted,
              fontWeight: 500, letterSpacing: "-0.01em", marginTop: 1,
            }}
          >
            {tripName || "Your trip"}
          </div>
        </div>
        <div className="flex">
          <IconButton
            onClick={onToggleNotifs}
            label={notifsOn ? "Turn off alerts" : "Turn on alerts"}
            tone={notifsOn ? C.text : C.muted}
          >
            {notifsOn ? <Bell size={20} /> : <BellOff size={20} />}
          </IconButton>
          <IconButton onClick={onOpenMenu} label="Trip options" tone={C.text}>
            <MoreHorizontal size={22} />
          </IconButton>
        </div>
      </div>

      <div className="px-6" style={{ paddingTop: 12 }}>
        <VerdictBlock verdict={verdict} />
      </div>

      {locationNotice && (
        <div
          className="mx-6 rounded-xl flex items-center gap-2"
          style={{
            marginTop: 14, padding: "10px 12px",
            background: locationNotice === "denied" ? STATUS.stopped.soft : C.raised,
            border: `1px solid ${locationNotice === "denied" ? C.stopped : C.line}`,
          }}
        >
          <MapPin
            size={16}
            style={{ color: locationNotice === "denied" ? C.stopped : C.muted, flexShrink: 0 }}
          />
          <span
            style={{
              fontFamily: FONT.body, fontSize: 13, lineHeight: 1.4,
              color: locationNotice === "denied" ? C.text : C.muted,
            }}
          >
            {locationNotice === "locating" && "Finding your location…"}
            {locationNotice === "denied" && "Location is blocked. Enable it in your browser to share your position."}
            {locationNotice === "unsupported" && "This browser can’t share location."}
          </span>
        </div>
      )}

      {anyLocated && (
        <div className="px-6">
          <Horizon members={members} total={totalKm} destinationName={destinationName} />
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-6 no-scrollbar" style={{ paddingTop: 8 }}>
        {shown.map((m, i) => (
          <button
            key={m.id}
            onClick={() => onSelectMember(m.id)}
            className="gt-rise w-full flex items-center gap-3 text-left"
            style={{
              borderTop: `1px solid ${C.line}`,
              paddingTop: 13, paddingBottom: 13,
              animationDelay: `${i * 45}ms`,
            }}
          >
            <Avatar m={m} size={42} ring={m.you} />
            <div className="flex-1 min-w-0">
              <div style={{ fontFamily: FONT.body, fontSize: 17, color: C.text, fontWeight: 600 }}>
                {m.you ? "You" : m.name}
              </div>
              <div className="flex items-center gap-2" style={{ marginTop: 4 }}>
                {m.located ? (
                  <>
                    <StatusPill s={m.status} />
                    {m.kmLeft >= 0.5 && (
                      <span
                        className="tnum"
                        style={{ fontFamily: FONT.mono, fontSize: 12, color: C.muted }}
                      >
                        {m.kmLeft.toFixed(1)} km left
                      </span>
                    )}
                  </>
                ) : (
                  <span style={{ fontFamily: FONT.body, fontSize: 13, color: C.muted }}>
                    Joined · sharing location soon
                  </span>
                )}
              </div>
            </div>
            <ChevronRight size={20} style={{ color: C.faint }} />
          </button>
        ))}

        {!expanded && together.length > 0 && (
          <div
            style={{
              borderTop: `1px solid ${C.line}`,
              borderBottom: outliers.length === 0 ? `1px solid ${C.line}` : undefined,
              paddingTop: 14, paddingBottom: 14,
              fontFamily: FONT.body, fontSize: 15, color: C.muted, lineHeight: 1.5,
            }}
          >
            {outliers.length === 0
              ? "Nobody is ahead, behind or stopped."
              : `${together.length === 1 ? "1 rider is" : `${together.length} riders are`} with the group.`}
            <br />
            <button
              onClick={() => setExpanded(true)}
              style={{
                fontFamily: FONT.body, fontSize: 15, color: C.text,
                fontWeight: 600, textDecoration: "underline", minHeight: 44,
              }}
            >
              Show all {members.length} {members.length === 1 ? "rider" : "riders"}
            </button>
          </div>
        )}

        {expanded && (
          <button
            onClick={() => setExpanded(false)}
            className="w-full"
            style={{
              borderTop: `1px solid ${C.line}`, minHeight: 44,
              fontFamily: FONT.body, fontSize: 15, color: C.muted, fontWeight: 600,
            }}
          >
            Show only who needs attention
          </button>
        )}

        <button
          onClick={onInvite}
          className="w-full rounded-2xl flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
          style={{
            marginTop: 18, minHeight: 48, background: "transparent", color: C.muted,
            border: `1px dashed ${C.lineStrong}`, fontFamily: FONT.body, fontSize: 14, fontWeight: 500,
          }}
        >
          <Plus size={16} /> Invite more
        </button>
        <div style={{ height: 12 }} />
      </div>

      <div
        className="px-6 flex gap-3"
        style={{
          paddingTop: 12, paddingBottom: PAD_B,
          background: `linear-gradient(180deg, transparent, ${C.ground} 40%)`,
        }}
      >
        <button
          aria-current="page"
          className="flex-1 rounded-2xl flex items-center justify-center gap-2"
          style={{
            minHeight: 56, background: C.text, color: C.ground,
            fontFamily: FONT.body, fontSize: 16, fontWeight: 600,
          }}
        >
          <Users size={18} /> Group
        </button>
        <button
          onClick={onOpenMap}
          className="flex-1 rounded-2xl flex items-center justify-center gap-2 transition-transform active:scale-[0.97]"
          style={{
            minHeight: 56, background: "transparent", color: C.text,
            border: `1.5px solid ${C.lineStrong}`, fontFamily: FONT.body, fontSize: 16, fontWeight: 600,
          }}
        >
          <Navigation size={18} /> Map
        </button>
      </div>
    </div>
  );
};

// ─── Trip options sheet ─────────────────────────────────────────────────────
// Everything that isn't "look at the group" lives here — including End/Leave,
// which used to sit 5px from the Map button where a jolt could end the trip.
const Row = ({
  icon, label, detail, onClick, tone = C.text, right,
}: {
  icon: React.ReactNode;
  label: string;
  detail?: string;
  onClick?: () => void;
  tone?: string;
  right?: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    className="w-full flex items-center gap-3 text-left transition-colors"
    style={{ minHeight: 56, color: tone, borderTop: `1px solid ${C.line}` }}
  >
    <span style={{ flexShrink: 0, display: "grid", placeItems: "center", width: 24 }}>{icon}</span>
    <span className="flex-1">
      <span style={{ fontFamily: FONT.body, fontSize: 16, fontWeight: 500, display: "block" }}>
        {label}
      </span>
      {detail && (
        <span style={{ fontFamily: FONT.body, fontSize: 13, color: C.muted, display: "block", marginTop: 1 }}>
          {detail}
        </span>
      )}
    </span>
    {right}
  </button>
);

const Switch = ({ on }: { on: boolean }) => (
  <span
    aria-hidden
    style={{
      width: 44, height: 26, borderRadius: 999, flexShrink: 0,
      background: on ? C.arrived : C.sunken,
      border: `1px solid ${on ? C.arrived : C.lineStrong}`,
      position: "relative", transition: "background .15s",
    }}
  >
    <span
      style={{
        position: "absolute", top: 2, left: on ? 20 : 2,
        width: 20, height: 20, borderRadius: 999,
        background: on ? C.ground : C.text, transition: "left .15s",
      }}
    />
  </span>
);

export const MenuSheet = ({
  open, isCreator, notifsOn, hapticsSupported, wakeOn, wakeSupported, themeChoice,
  canDemo, onClose, onToggleNotifs, onToggleWake, onChangeTheme, onGlance, onInvite,
  onStartDemo, onLeave, onEnd,
}: {
  open: boolean;
  isCreator: boolean;
  notifsOn: boolean;
  hapticsSupported: boolean;
  wakeOn: boolean;
  wakeSupported: boolean;
  themeChoice: ThemeChoice;
  canDemo: boolean;
  onClose: () => void;
  onToggleNotifs: () => void;
  onToggleWake: () => void;
  onChangeTheme: (c: ThemeChoice) => void;
  onGlance: () => void;
  onInvite: () => void;
  onStartDemo: () => void;
  onLeave: () => void;
  onEnd: () => void;
}) => {
  const [confirming, setConfirming] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) { setConfirming(false); return; }
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const themes: { key: ThemeChoice; icon: React.ReactNode; label: string }[] = [
    { key: "system", icon: <Monitor size={16} />, label: "Auto" },
    { key: "light", icon: <Sun size={16} />, label: "Light" },
    { key: "dark", icon: <Moon size={16} />, label: "Dark" },
  ];

  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end" style={{ background: "rgba(0,0,0,.45)" }}>
      <button className="absolute inset-0" aria-label="Close options" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Trip options"
        tabIndex={-1}
        className="gt-sheet relative outline-none"
        style={{
          background: C.ground, borderTopLeftRadius: 26, borderTopRightRadius: 26,
          borderTop: `1px solid ${C.line}`, paddingBottom: PAD_B,
          maxHeight: "88%", overflowY: "auto",
        }}
      >
        <div className="flex items-center justify-between px-5" style={{ paddingTop: 14 }}>
          <span style={{ fontFamily: FONT.display, fontSize: 20, color: C.text, fontWeight: 500 }}>
            Trip options
          </span>
          <IconButton onClick={onClose} label="Close" tone={C.text}>
            <X size={22} />
          </IconButton>
        </div>

        <div className="px-5" style={{ paddingBottom: 8 }}>
          <div style={{ paddingTop: 10, paddingBottom: 10 }}>
            <Eyebrow>APPEARANCE</Eyebrow>
            <div className="flex gap-2" style={{ marginTop: 8 }}>
              {themes.map((t) => {
                const active = themeChoice === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => onChangeTheme(t.key)}
                    aria-pressed={active}
                    className="flex-1 rounded-xl flex items-center justify-center gap-1.5 transition-transform active:scale-[0.97]"
                    style={{
                      minHeight: 48,
                      background: active ? C.text : "transparent",
                      color: active ? C.ground : C.text,
                      border: `1.5px solid ${active ? C.text : C.lineStrong}`,
                      fontFamily: FONT.body, fontSize: 14, fontWeight: 600,
                    }}
                  >
                    {t.icon} {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <Row
            icon={<Maximize2 size={20} />}
            label="Glance mode"
            detail="Big type for a bar mount. Tap anywhere to exit."
            onClick={onGlance}
            right={<ChevronRight size={20} style={{ color: C.faint }} />}
          />
          <Row
            icon={notifsOn ? <Bell size={20} /> : <BellOff size={20} />}
            label="Alerts"
            detail={
              hapticsSupported
                ? "Notifications and a buzz when someone drops back."
                : "Notifications only — this device has no vibration."
            }
            onClick={onToggleNotifs}
            right={<Switch on={notifsOn} />}
          />
          <Row
            icon={<Smartphone size={20} />}
            label="Keep screen awake"
            detail={
              wakeSupported
                ? "Stops the browser pausing your location."
                : "Not supported in this browser."
            }
            onClick={wakeSupported ? onToggleWake : undefined}
            tone={wakeSupported ? C.text : C.muted}
            right={<Switch on={wakeOn && wakeSupported} />}
          />
          <Row
            icon={<Plus size={20} />}
            label="Invite more"
            onClick={onInvite}
            right={<ChevronRight size={20} style={{ color: C.faint }} />}
          />
          {canDemo && (
            <Row
              icon={<Navigation size={20} />}
              label="Preview with a demo convoy"
              detail="Scripted riders, so you can see it work solo."
              onClick={onStartDemo}
              right={<ChevronRight size={20} style={{ color: C.faint }} />}
            />
          )}

          {/* Destructive, last, and behind a confirm. */}
          <div style={{ marginTop: 16 }}>
            {confirming ? (
              <div
                className="rounded-2xl"
                style={{ background: STATUS.stopped.soft, border: `1px solid ${C.stopped}`, padding: 14 }}
              >
                <div style={{ fontFamily: FONT.body, fontSize: 15, color: C.text, fontWeight: 600 }}>
                  {isCreator ? "End this trip for everyone?" : "Leave this trip?"}
                </div>
                <div style={{ fontFamily: FONT.body, fontSize: 13, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
                  {isCreator
                    ? "Everyone stops sharing and the group view closes for all members."
                    : "You'll stop sharing your location and drop off the group's list."}
                </div>
                <div className="flex gap-2" style={{ marginTop: 12 }}>
                  <button
                    onClick={() => setConfirming(false)}
                    className="flex-1 rounded-xl"
                    style={{
                      minHeight: 48, border: `1.5px solid ${C.lineStrong}`, color: C.text,
                      fontFamily: FONT.body, fontSize: 15, fontWeight: 600,
                    }}
                  >
                    Keep going
                  </button>
                  <button
                    onClick={isCreator ? onEnd : onLeave}
                    className="flex-1 rounded-xl"
                    style={{
                      minHeight: 48, background: C.stopped, color: C.ground,
                      fontFamily: FONT.body, fontSize: 15, fontWeight: 600,
                    }}
                  >
                    {isCreator ? "End trip" : "Leave"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirming(true)}
                className="w-full rounded-2xl"
                style={{
                  minHeight: 52, border: `1.5px solid ${C.stopped}`, color: C.stopped,
                  fontFamily: FONT.body, fontSize: 15, fontWeight: 600,
                }}
              >
                {isCreator ? "End trip" : "Leave trip"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Screen: Glance ─────────────────────────────────────────────────────────
// Four elements, readable at arm's length on a bar mount. This is a second
// rendering of the verdict, not new logic.
export const GlanceView = ({
  verdict, members, onExit,
}: { verdict: Verdict; members: Member[]; onExit: () => void }) => {
  const tone = TONE_COLOR[verdict.tone];
  const subject = members.find((m) => m.id === verdict.subjectId);
  return (
    <button
      onClick={onExit}
      className="absolute inset-0 z-30 flex flex-col items-center text-center w-full"
      style={{ background: C.ground, paddingTop: PAD_T, paddingBottom: PAD_B }}
      aria-label="Exit glance mode"
    >
      <div className="w-full px-6 flex items-center gap-2">
        <span style={{ fontFamily: FONT.mono, fontSize: 12, color: tone, letterSpacing: "0.14em" }}>
          {verdict.eyebrow}
        </span>
      </div>

      <div className="flex-1 flex flex-col justify-center items-center px-4">
        {verdict.status && (
          <span style={{ color: tone }}>
            <Glyph s={verdict.status} size={30} />
          </span>
        )}
        <div
          style={{
            fontFamily: FONT.display, fontSize: 44, lineHeight: 1,
            letterSpacing: "-0.04em", color: C.text, fontWeight: 600,
            marginTop: 14, textTransform: "uppercase",
          }}
        >
          {subject ? (subject.you ? "YOU" : subject.name) : verdict.headline}
        </div>
        {verdict.metric ? (
          <>
            <div
              className="tnum"
              style={{
                fontFamily: FONT.mono, fontSize: 88, lineHeight: 0.92,
                letterSpacing: "-0.05em", color: tone, fontWeight: 700, marginTop: 10,
              }}
            >
              {verdict.metric}
            </div>
            <div
              style={{ fontFamily: FONT.mono, fontSize: 15, color: C.muted, letterSpacing: "0.14em", marginTop: 8 }}
            >
              {verdict.metricLabel}
            </div>
          </>
        ) : (
          subject && (
            <div style={{ fontFamily: FONT.body, fontSize: 17, color: C.muted, marginTop: 12 }}>
              {verdict.headline}
            </div>
          )
        )}
      </div>

      <div className="flex justify-center" style={{ gap: 8 }}>
        {members.map((m) => (
          <span
            key={m.id}
            style={{
              width: 16, height: 16, borderRadius: 999,
              background: `var(--c-av-${m.slot})`,
              outline: m.you ? `2px solid ${C.text}` : "none",
              outlineOffset: 2,
            }}
          />
        ))}
      </div>
      <div
        style={{ fontFamily: FONT.mono, fontSize: 12, color: C.muted, letterSpacing: "0.14em", marginTop: 22 }}
      >
        TAP ANYWHERE TO EXIT
      </div>
    </button>
  );
};

// ─── Screen: Member ─────────────────────────────────────────────────────────
const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-2xl" style={{ background: C.raised, border: `1px solid ${C.line}`, padding: 14 }}>
    <Eyebrow>{label}</Eyebrow>
    <div
      className="tnum"
      style={{ fontFamily: FONT.display, fontSize: 22, color: C.text, fontWeight: 600, marginTop: 4 }}
    >
      {value}
    </div>
  </div>
);

export const MemberView = ({ member, onBack }: { member: Member; onBack: () => void }) => {
  const m = member;
  return (
    <div className="flex flex-col h-full">
      <div className="px-4" style={{ paddingTop: PAD_T }}>
        <IconButton onClick={onBack} label="Back" tone={C.text}>
          <ArrowLeft size={22} />
        </IconButton>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 no-scrollbar">
        <div className="flex flex-col items-center text-center" style={{ marginTop: 10, marginBottom: 30 }}>
          <Avatar m={m} size={88} ring={m.you} />
          <h2
            style={{
              fontFamily: FONT.display, fontSize: 28, color: C.text, fontWeight: 500,
              letterSpacing: "-0.02em", marginTop: 16,
            }}
          >
            {m.you ? "You" : m.name}
          </h2>
          {m.located ? (
            <>
              <div style={{ marginTop: 10 }}><StatusPill s={m.status} /></div>
              <p style={{ fontFamily: FONT.body, fontSize: 14, color: C.muted, marginTop: 10 }}>
                {STATUS[m.status].hint}
              </p>
            </>
          ) : (
            <p style={{ fontFamily: FONT.body, fontSize: 14, color: C.muted, marginTop: 12 }}>
              Hasn&apos;t shared location yet
            </p>
          )}
        </div>

        {m.located && (
          <div className="grid grid-cols-2 gap-3" style={{ marginBottom: 26 }}>
            <Stat label="DIST TO DEST" value={m.kmLeft < 0.5 ? "0.0 km" : `${m.kmLeft.toFixed(1)} km`} />
            <Stat label="LAST PING" value={fmtSeen(m.seen)} />
          </div>
        )}

        <Eyebrow>ACTIVITY</Eyebrow>
        <div style={{ marginTop: 10, borderTop: `1px solid ${C.line}`, paddingTop: 14 }}>
          <div className="flex items-start gap-3">
            <span style={{ color: STATUS.with.color, marginTop: 2 }}><Glyph s="with" size={13} /></span>
            <div className="flex-1">
              <div style={{ fontFamily: FONT.body, fontSize: 15, color: C.text }}>Joined the group</div>
              <div style={{ fontFamily: FONT.mono, fontSize: 12, color: C.muted, marginTop: 2 }}>
                {fmtSeen(m.seen)}
              </div>
            </div>
          </div>
        </div>
        <div style={{ height: PAD_B }} />
      </div>
    </div>
  );
};

// ─── Screen: Map ─────────────────────────────────────────────────────────────
export const MapView = ({
  members, rawMembers, destination, destinationName, onBack,
}: {
  members: Member[];
  rawMembers: Participant[];
  destination: { lat: number; lng: number } | null;
  destinationName: string | null;
  onBack: () => void;
}) => {
  const byId = new Map(members.map((m) => [m.id, m]));
  const markers: MapMarker[] = rawMembers
    .filter((p) => p.latitude != null && p.longitude != null)
    .map((p) => {
      const m = byId.get(p.id);
      return {
        id: p.id,
        lat: p.latitude as number,
        lng: p.longitude as number,
        color: m ? `var(--c-av-${m.slot})` : C.muted,
        ink: m ? `var(--c-av-${m.slot}-ink)` : C.ground,
        label: (m?.name ?? p.displayName)[0]?.toUpperCase() ?? "?",
        you: m?.you,
      };
    });

  return (
    <div className="relative h-full">
      {/* Edge to edge: the old mx-4 inset donated ~32px of scarce width to a
          rounded corner. */}
      <LiveMap markers={markers} destination={destination} className="absolute inset-0" />

      <div
        className="absolute left-0 right-0 flex items-center justify-between px-4 z-10"
        style={{ top: 0, paddingTop: PAD_T }}
      >
        <div
          className="rounded-full"
          style={{ background: C.scrim, border: `1px solid ${C.line}`, backdropFilter: "blur(8px)" }}
        >
          <IconButton onClick={onBack} label="Back to group" tone={C.text}>
            <ArrowLeft size={22} />
          </IconButton>
        </div>
        {markers.length === 0 && (
          <div
            className="rounded-xl flex items-center gap-2"
            style={{
              background: C.scrim, border: `1px solid ${C.line}`,
              backdropFilter: "blur(8px)", padding: "10px 12px", marginLeft: 10,
            }}
          >
            <Navigation size={16} style={{ color: C.muted, flexShrink: 0 }} />
            <span style={{ fontFamily: FONT.body, fontSize: 13, color: C.muted }}>
              Pins appear once members share location.
            </span>
          </div>
        )}
      </div>

      <div
        className="absolute left-0 right-0 px-4 z-10"
        style={{ bottom: 0, paddingBottom: PAD_B }}
      >
        {destinationName && (
          <div
            className="rounded-2xl flex items-center justify-between"
            style={{
              background: C.scrim, border: `1px solid ${C.line}`,
              backdropFilter: "blur(8px)", padding: 14, marginBottom: 10,
            }}
          >
            <div>
              <Eyebrow>DESTINATION</Eyebrow>
              <div style={{ fontFamily: FONT.body, fontSize: 16, color: C.text, fontWeight: 600, marginTop: 2 }}>
                {destinationName}
              </div>
            </div>
            <Flag size={20} style={{ color: C.arrived }} />
          </div>
        )}
        <button
          onClick={onBack}
          className="w-full rounded-2xl flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
          style={{
            minHeight: 56, background: C.text, color: C.ground,
            fontFamily: FONT.body, fontSize: 16, fontWeight: 600,
          }}
        >
          <Users size={18} /> Back to group
        </button>
      </div>
    </div>
  );
};

// ─── Screen: Ended ──────────────────────────────────────────────────────────
export const Ended = ({
  memberCount, onRestart,
}: { memberCount: number; onRestart: () => void }) => (
  <div
    className="flex flex-col h-full px-6 items-center text-center"
    style={{ paddingTop: PAD_T, paddingBottom: PAD_B }}
  >
    <div className="flex-1 flex flex-col items-center justify-center">
      <div
        className="grid place-items-center"
        style={{
          width: 76, height: 76, borderRadius: 999,
          background: STATUS.arrived.soft, border: `1.5px solid ${C.arrived}`, color: C.arrived,
        }}
      >
        <Check size={34} />
      </div>
      <h2
        style={{
          fontFamily: FONT.display, fontSize: 28, color: C.text, fontWeight: 500,
          letterSpacing: "-0.02em", marginTop: 22,
        }}
      >
        Trip ended
      </h2>
      <p
        style={{ fontFamily: FONT.body, fontSize: 15, color: C.muted, marginTop: 8, maxWidth: 300, lineHeight: 1.5 }}
      >
        Locations have stopped updating. Trip data is no longer shared.
      </p>
      <div style={{ width: 180, marginTop: 26 }}>
        <Stat label="MEMBERS" value={String(memberCount)} />
      </div>
    </div>

    <PrimaryButton onClick={onRestart}>
      Start a new trip <ArrowRight size={20} />
    </PrimaryButton>
  </div>
);

// ─── Toast ──────────────────────────────────────────────────────────────────
export const Toast = ({
  text, tone = "info", status, onClose,
}: {
  text: string;
  tone?: VerdictTone;
  status?: StatusKey | null;
  onClose: () => void;
}) => (
  <div
    className="gt-rise absolute left-4 right-4 z-30 rounded-2xl flex items-center gap-3"
    style={{
      top: "calc(var(--safe-t) + 12px)",
      background: C.raised,
      border: `1px solid ${C.line}`,
      padding: 14,
      boxShadow: "0 10px 40px rgba(0,0,0,0.28)",
    }}
    role="status"
  >
    <span style={{ color: TONE_COLOR[tone], flexShrink: 0 }}>
      {status ? <Glyph s={status} size={15} /> : <Bell size={17} />}
    </span>
    <div className="flex-1" style={{ fontFamily: FONT.body, fontSize: 15, color: C.text, fontWeight: 500 }}>
      {text}
    </div>
    <IconButton onClick={onClose} label="Dismiss" tone={C.muted} size={32}>
      <X size={17} />
    </IconButton>
  </div>
);
