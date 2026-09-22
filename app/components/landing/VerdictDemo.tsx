"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { C, FONT, STATUS, Glyph } from "../Radar";
import { convoyAt, CONVOY_DESTINATION, CONVOY_TICKS, VIEWER_ID } from "@/lib/landing/convoy";
import { computeStatuses } from "@/lib/status";
import { computeVerdict } from "@/lib/verdict";

/**
 * Act II, §1: the engine, running.
 *
 * Nothing here is copy. The eyebrow, the headline, the metric and every status
 * word are `computeVerdict` and `computeStatuses` reading scripted coordinates
 * out of `lib/landing/convoy.ts` — the same two functions the trip screen
 * calls. If somebody retunes AHEAD_BEHIND_MARGIN_M, this page changes with it,
 * which is the point: a marketing claim that can go stale is a marketing claim
 * that will.
 *
 * `aria-hidden`, and deliberately not a live region. A headline that rewrites
 * itself every 600ms would be announced every 600ms. The static sentence
 * beside it carries the same information for a screen reader.
 */

const TICK_MS = 600;

/** The beat to hold on when motion is unwelcome: Ama adrift, the clearest one. */
const STILL_TICK = 18;

/** Fixed domain for the horizon, so the strip does not rescale under the dots. */
const HORIZON_KM = 3.6;

export function VerdictDemo() {
  const [tick, setTick] = useState(STILL_TICK);
  const [running, setRunning] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);

  // A setInterval driving a demo nobody is looking at is a battery cost, and
  // this page is mostly read on a phone.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const io = new IntersectionObserver(
      ([entry]) => setRunning(entry.isIntersecting),
      { threshold: 0.25 }
    );
    io.observe(host);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setTick((t) => (t + 1) % CONVOY_TICKS), TICK_MS);
    return () => clearInterval(timer);
  }, [running]);

  const { verdict, rows } = useMemo(() => {
    // One `now` for the whole frame, so every derived value on this paint
    // agrees — the convention HomeDashboard already follows.
    const now = Date.now();
    const participants = convoyAt(tick, now);
    const statuses = computeStatuses(
      participants,
      { lat: CONVOY_DESTINATION.lat, lng: CONVOY_DESTINATION.lng },
      now
    );
    return {
      verdict: computeVerdict({
        participants,
        statuses,
        selfId: VIEWER_ID,
        destinationName: CONVOY_DESTINATION.name,
        now,
      }),
      rows: participants.map((p, i) => ({
        id: p.id,
        name: p.displayName,
        slot: i % 8,
        status: statuses[p.id]?.status ?? "with",
        kmLeft: statuses[p.id]?.kmLeft ?? 0,
      })),
    };
  }, [tick]);

  return (
    <section style={{ background: C.ground, color: C.text }}>
      <div className="mx-auto w-full max-w-[1200px] px-6" style={{ padding: "clamp(64px, 10vh, 120px) 24px" }}>
        <div className="grid gap-12 md:grid-cols-[0.85fr_1.15fr] md:items-center">
          <div>
            <p
              style={{
                fontFamily: FONT.mono, fontSize: 12, fontWeight: 500,
                letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted,
              }}
            >
              The whole group, in one line
            </p>
            <h2
              style={{
                fontFamily: FONT.display, fontWeight: 500, marginTop: 18,
                fontSize: "clamp(2rem, 4vw, 3.25rem)", lineHeight: 1.05, letterSpacing: "-0.03em",
              }}
            >
              A map shows you dots.<br />
              <span style={{ color: C.muted }}>Radar tells you what they mean.</span>
            </h2>
            <p
              style={{
                fontFamily: FONT.body, color: C.muted, marginTop: 22, maxWidth: "42ch",
                fontSize: "clamp(1rem, 1.2vw, 1.1875rem)", lineHeight: 1.55,
              }}
            >
              Everyone&rsquo;s position reduced to one sentence and one number, because a rider at
              effort reads one field, not eight. This is the engine running, not a recording —
              four riders on the road to {CONVOY_DESTINATION.name}, with one falling back, catching
              up, and arriving.
            </p>
          </div>

          <div
            ref={hostRef}
            aria-hidden
            style={{
              background: C.raised, border: `1px solid ${C.line}`,
              borderRadius: 22, padding: "clamp(24px, 3vw, 38px)",
            }}
          >
            <p
              style={{
                fontFamily: FONT.mono, fontSize: 12, fontWeight: 500,
                letterSpacing: "0.14em", textTransform: "uppercase",
                color: verdict.status ? STATUS[verdict.status].color : C.muted,
              }}
            >
              {verdict.eyebrow}
            </p>

            <p
              style={{
                fontFamily: FONT.display, fontWeight: 500, marginTop: 10,
                fontSize: "clamp(1.6rem, 3vw, 2.4rem)", lineHeight: 1.1, letterSpacing: "-0.03em",
              }}
            >
              {verdict.headline}
            </p>

            {verdict.metric !== null && (
              <div className="flex items-baseline gap-3" style={{ marginTop: 18 }}>
                <span
                  className="tnum"
                  style={{
                    fontFamily: FONT.display, fontWeight: 600,
                    fontSize: "clamp(2.6rem, 5vw, 4rem)", lineHeight: 1, letterSpacing: "-0.04em",
                  }}
                >
                  {verdict.metric}
                </span>
                <span
                  style={{
                    fontFamily: FONT.mono, fontSize: 12, fontWeight: 500,
                    letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted,
                  }}
                >
                  {verdict.metricLabel}
                </span>
              </div>
            )}

            {/* The horizon: everyone's place along the road, left to right. */}
            <div style={{ marginTop: 34 }}>
              <div className="relative" style={{ height: 30 }}>
                <div
                  className="absolute left-0 right-0"
                  style={{ top: "50%", height: 2, background: C.line }}
                />
                {rows.map((r) => {
                  const x = Math.min(Math.max(1 - r.kmLeft / HORIZON_KM, 0), 1);
                  return (
                    <span
                      key={r.id}
                      className="absolute grid place-items-center"
                      style={{
                        left: `${x * 100}%`, top: "50%", transform: "translate(-50%,-50%)",
                        width: 22, height: 22, borderRadius: 999,
                        background: STATUS[r.status].color, color: C.raised,
                        transition: "left 560ms linear",
                      }}
                    >
                      <Glyph s={r.status} size={12} />
                    </span>
                  );
                })}
              </div>
              <div className="flex justify-between" style={{ marginTop: 6 }}>
                {["Start", CONVOY_DESTINATION.name].map((label) => (
                  <span
                    key={label}
                    style={{
                      fontFamily: FONT.mono, fontSize: 12, letterSpacing: "0.12em",
                      textTransform: "uppercase", color: C.faint,
                    }}
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 26, borderTop: `1px solid ${C.line}` }}>
              {rows.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-3"
                  style={{ padding: "13px 0", borderBottom: `1px solid ${C.line}` }}
                >
                  <span
                    className="grid place-items-center shrink-0"
                    style={{
                      width: 32, height: 32, borderRadius: 999,
                      background: `var(--c-av-${r.slot})`, color: `var(--c-av-${r.slot}-ink)`,
                      fontFamily: FONT.body, fontSize: 13, fontWeight: 600,
                    }}
                  >
                    {r.name.slice(0, 1)}
                  </span>
                  <span style={{ fontFamily: FONT.body, fontSize: 16, flex: 1 }}>{r.name}</span>
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full"
                    style={{
                      background: STATUS[r.status].soft, color: STATUS[r.status].color,
                      fontFamily: FONT.body, fontSize: 13, fontWeight: 600, padding: "5px 11px",
                    }}
                  >
                    <Glyph s={r.status} size={12} />
                    {STATUS[r.status].label}
                  </span>
                  <span
                    className="tnum"
                    style={{ fontFamily: FONT.body, fontSize: 14, color: C.muted, minWidth: 64, textAlign: "right" }}
                  >
                    {r.kmLeft.toFixed(1)} km
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* The demo is aria-hidden; this is what it says, said once. */}
        <p className="sr-only">
          A worked example: four riders heading to {CONVOY_DESTINATION.name}. One falls more than
          150 metres behind the group&rsquo;s median and the screen reads &ldquo;Ama is 1.4 km
          back&rdquo;. She catches up and it reads &ldquo;All together&rdquo;. One rider reaches the
          destination and it names him.
        </p>
      </div>
    </section>
  );
}
