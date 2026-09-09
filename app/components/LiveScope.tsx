"use client";

import { C, STATUS } from "./Radar";
import type { Contact } from "@/lib/pulse";

/**
 * The scope: Radar's own mark, at the size where it can carry a screen — and
 * now carrying the trips as well.
 *
 * With no contacts this is exactly the drawing that used to be the empty
 * state, and deliberately so: an empty scope is not a placeholder for missing
 * content, it *is* the content — nobody is out there right now. With contacts
 * it is the same instrument saying who is.
 *
 * Geometry is the full mark from `app/icon.svg`: two range rings, you, and
 * contacts on the field. Not a drawing invented for this screen.
 *
 * `aria-hidden`, because it restates the cards beneath it and those carry the
 * status as a word. Nothing here is the only channel for anything.
 */

/** The outer ring, in the 200-unit viewBox. Contacts never sit outside it. */
const R_OUTER = 88;

export function LiveScope({
  contacts = [],
  size = 176,
}: {
  contacts?: Contact[];
  size?: number | string;
}) {
  return (
    <div
      className="relative grid place-items-center shrink-0"
      style={{ width: size, height: size, aspectRatio: "1" }}
      aria-hidden
    >
      {/* The sweep sits under the rings so it reads as passing beneath them. */}
      <svg className="gt-sweep absolute inset-0 w-full h-full" viewBox="0 0 200 200">
        <defs>
          <linearGradient id="scope-sweep" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={C.arrived} stopOpacity="0" />
            <stop offset="100%" stopColor={C.arrived} stopOpacity="0.22" />
          </linearGradient>
        </defs>
        <path d="M100 100 L100 12 A88 88 0 0 1 188 100 Z" fill="url(#scope-sweep)" />
        <line x1="100" y1="100" x2="188" y2="100" stroke={C.arrived} strokeOpacity="0.5" strokeWidth="1.5" />
      </svg>

      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 200 200">
        {/* Two range rings, as the full mark has. */}
        <circle cx="100" cy="100" r="88" fill="none" stroke={C.lineStrong} strokeOpacity="0.55" strokeWidth="1.25" />
        <circle cx="100" cy="100" r="52" fill="none" stroke={C.lineStrong} strokeOpacity="0.35" strokeWidth="1.25" />
        {/* Cross-hairs, clipped to the outer ring, so the field reads as an
            instrument rather than a target. */}
        <line x1="100" y1="12" x2="100" y2="188" stroke={C.line} strokeOpacity="0.6" strokeWidth="1" />
        <line x1="12" y1="100" x2="188" y2="100" stroke={C.line} strokeOpacity="0.6" strokeWidth="1" />

        {/* You. */}
        <circle cx="100" cy="100" r="14" fill={C.arrived} fillOpacity="0.16" />
        <circle cx="100" cy="100" r="6.5" fill={C.arrived} />

        {contacts.length === 0 ? (
          /* An empty slot rather than a contact: nobody is out there, and this
             is where the first person will appear. Outlined, not filled, so it
             does not claim somebody is already on the ring — and present at all
             because a scope with nothing on it is a bullseye. */
          <circle
            className="gt-breathe"
            cx="152" cy="62" r="6.5"
            fill="none" stroke={C.ahead} strokeWidth="1.5" strokeDasharray="3 3"
          />
        ) : (
          contacts.map((c) => {
            const cx = 100 + Math.cos(c.angle) * R_OUTER * c.radius;
            const cy = 100 + Math.sin(c.angle) * R_OUTER * c.radius;
            // 6 at one member, 7 at two, saturating at 8 from three members
            // on: the size channel only needs to distinguish 1 / 2 / 3-or-more,
            // not read out the exact count, so it stops growing well before a
            // six-person convoy could swamp the field. Capped at 8, not
            // higher: a contact at radius 1 sits 88 units from the
            // centre of the 200x200 viewBox, whose cardinal-axis boundary is
            // only 100 units out, and the halo below adds another 3 — so the
            // dot must stay small enough that 88 + r + 3 never exceeds 100,
            // or the halo gets silently clipped by the SVG's edge. Shrink the
            // dot here, not the placement: radius 1 has to stay on the outer
            // ring, which is what "furthest out" means on this scope.
            const r = Math.min(8, 5 + c.memberCount);

            // Nobody located: the same outlined treatment as the empty state,
            // which already means "something belongs here and nobody is
            // confirmed on it yet".
            if (!c.located || c.status === null) {
              return (
                <circle
                  key={c.tripId} className="gt-breathe"
                  cx={cx} cy={cy} r={r}
                  fill="none" stroke={C.ahead} strokeWidth="1.5" strokeDasharray="3 3"
                />
              );
            }

            const tone = STATUS[c.status].color;
            return (
              <g key={c.tripId}>
                <circle cx={cx} cy={cy} r={r + 3} fill={tone} fillOpacity="0.15" />
                <circle cx={cx} cy={cy} r={r} fill={tone} />
              </g>
            );
          })
        )}
      </svg>
    </div>
  );
}
