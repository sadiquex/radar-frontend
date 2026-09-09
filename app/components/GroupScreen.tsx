"use client";

import {
  Bell, BellOff, ChevronRight, MapPin, MoreHorizontal, Navigation, Plus,
} from "lucide-react";
import {
  Avatar, C, FONT, Horizon, IconButton, PAD_T, STATUS, StatusPill,
  VerdictBlock, type LocationNotice, type Member,
} from "./Radar";
import { TAB_BAR_SPACE } from "./TabBar";
import { ATTENTION_ORDER } from "@/lib/pulse";
import type { Verdict } from "@/lib/verdict";

/**
 * The trip screen body: verdict, horizon strip and the member roster.
 *
 * Lives inside the `(tabs)` route group, so the signed-in shell's tab bar
 * renders beneath it — this screen no longer carries a bottom action bar of
 * its own. The "Group" button that used to sit there rendered with
 * `aria-current="page"` and no `onClick`: a button that did nothing, because
 * the group is the screen you're already on. Map survives as a floating
 * pill instead, because it is the one action here that isn't "look at the
 * tab bar and see you're on Group already."
 */
export function GroupScreen({
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
}) {
  const anyLocated = members.some((m) => m.located);
  const totalKm = Math.max(1, ...members.filter((m) => m.located).map((m) => m.kmLeft));

  // Same attention order Home ranks trips by, so a stopped rider leads the
  // roster here too rather than sitting alphabetically. `located` — not
  // `status` — is what carries "no position yet": Member.status is
  // non-nullable, so a member who hasn't shared a position can't be compared
  // against a status at all; they rank last instead.
  const rank = (m: Member) =>
    m.located ? ATTENTION_ORDER.indexOf(m.status) : ATTENTION_ORDER.length;
  const shown = [...members].sort((a, b) => rank(a) - rank(b));

  return (
    <div className="flex flex-col h-full relative">
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

      <div
        className="flex-1 min-h-0 overflow-y-auto px-6 no-scrollbar"
        style={{ paddingTop: 8, paddingBottom: TAB_BAR_SPACE }}
      >
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
                        style={{ fontFamily: FONT.display, fontSize: 12, fontWeight: 600, color: C.muted }}
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
      </div>

      {/* Bottom right and above the tab bar: this is used one-handed on a
          bike, and the top of a tall phone is not reachable with a thumb. */}
      <button
        onClick={onOpenMap}
        className="absolute rounded-full flex items-center gap-2 transition-transform active:scale-[0.96]"
        style={{
          right: 20, bottom: `calc(${TAB_BAR_SPACE} + 8px)`, zIndex: 20,
          minHeight: 48, paddingLeft: 18, paddingRight: 20,
          background: C.text, color: C.ground,
          fontFamily: FONT.body, fontSize: 15, fontWeight: 600,
          boxShadow: "0 6px 20px rgba(0,0,0,0.28)",
        }}
      >
        <Navigation size={18} /> Map
      </button>
    </div>
  );
}
