"use client";

import { useState } from "react";
import {
  ArrowLeft, ArrowRight, ChevronRight, Flag, MapPin, Monitor, Moon, Smartphone,
  Sun, Trash2, Users,
} from "lucide-react";
import {
  C, FONT, Eyebrow, Glyph, PrimaryButton, SecondaryButton, Row, Switch, STATUS,
} from "./Radar";
import { LiveMap } from "./LiveMap";
import { TAB_BAR_SPACE } from "./TabBar";
import type { AccountDevice } from "@/lib/data/account";
import type { LiveTripEntry, TripEntry } from "@/lib/data/history";
import type { ThemeChoice } from "@/lib/theme";
import {
  arrivalSummary, formatDay, formatDuration, formatRemaining, groupByMonth,
  outcomeOf, tripTitle,
} from "@/lib/history";

// Safe-area composites, matching Radar.tsx. Mobile is the tuned case, so every
// screen edge goes through one of these rather than a bare padding value.
const PAD_T = "calc(var(--safe-t) + 14px)";

// ─── Shared pieces ──────────────────────────────────────────────────────────

const ScreenTitle = ({ children }: { children: React.ReactNode }) => (
  <h1
    style={{
      fontFamily: FONT.display, fontSize: 28, lineHeight: 1.1,
      letterSpacing: "-0.03em", color: C.text, fontWeight: 500,
    }}
  >
    {children}
  </h1>
);

const Empty = ({ title, body }: { title: string; body: string }) => (
  // A fixed min-height rather than flex-1: the scroll container this sits in is
  // `overflow-y-auto`, not a flex column, so flex-1 would resolve to nothing and
  // leave the message pinned to the top of an otherwise blank screen.
  <div
    className="flex flex-col items-center justify-center text-center px-4"
    style={{ minHeight: 260 }}
  >
    <div style={{ fontFamily: FONT.display, fontSize: 18, color: C.text, fontWeight: 500 }}>
      {title}
    </div>
    <p
      style={{
        fontFamily: FONT.body, fontSize: 14, color: C.muted, marginTop: 8,
        maxWidth: 280, lineHeight: 1.5,
      }}
    >
      {body}
    </p>
  </div>
);

/**
 * A running trip, offered for resumption.
 *
 * The highest-value row on the dashboard: before this existed, closing the tab
 * lost the trip unless you still had the link somewhere.
 */
export const LiveTripCard = ({
  trip, now, onOpen,
}: { trip: LiveTripEntry; now: number; onOpen: () => void }) => (
  <button
    onClick={onOpen}
    className="w-full rounded-2xl flex items-center gap-3 text-left px-4 transition-transform active:scale-[0.99]"
    style={{
      minHeight: 68,
      background: STATUS.arrived.soft,
      border: `1.5px solid ${C.arrived}`,
    }}
  >
    <span
      aria-hidden
      className="gtpulse"
      style={{ width: 9, height: 9, borderRadius: 999, background: C.arrived, flexShrink: 0 }}
    />
    <span className="flex-1 min-w-0">
      <span
        className="block truncate"
        style={{ fontFamily: FONT.body, fontSize: 16, fontWeight: 600, color: C.text }}
      >
        {tripTitle(trip)}
      </span>
      <span
        className="block tnum"
        style={{ fontFamily: FONT.body, fontSize: 13, color: C.muted, marginTop: 1 }}
      >
        {trip.memberCount} {trip.memberCount === 1 ? "person" : "people"} ·{" "}
        {formatRemaining(trip.expiresAt, now)}
      </span>
    </span>
    <ChevronRight size={20} style={{ color: C.muted, flexShrink: 0 }} />
  </button>
);

/**
 * One finished trip in a list.
 *
 * The outcome is a glyph, not a colour, for the reason every status in this app
 * is: five states that all pass contrast on one ground sit in a narrow
 * luminance band and collide in greyscale and for colourblind readers.
 */
export const TripRow = ({
  trip, now, onOpen,
}: { trip: TripEntry; now: number; onOpen: () => void }) => {
  const outcome = outcomeOf(trip);
  const when = trip.kind === "live" ? trip.startedAt : trip.finishedAt;

  return (
    <button
      onClick={onOpen}
      className="w-full flex items-center gap-3 text-left"
      style={{ minHeight: 60, borderTop: `1px solid ${C.line}` }}
    >
      <span
        aria-hidden
        style={{
          flexShrink: 0, width: 24, display: "grid", placeItems: "center",
          color: outcome === null ? C.faint : STATUS[outcome].color,
        }}
      >
        {outcome === null ? <Flag size={15} /> : <Glyph s={outcome} size={13} />}
      </span>
      <span className="flex-1 min-w-0">
        <span
          className="block truncate"
          style={{ fontFamily: FONT.body, fontSize: 16, fontWeight: 500, color: C.text }}
        >
          {tripTitle(trip)}
        </span>
        <span
          className="block"
          style={{ fontFamily: FONT.body, fontSize: 13, color: C.muted, marginTop: 1 }}
        >
          {trip.kind === "finishing"
            ? "Wrapping up"
            : trip.kind === "past"
              ? (arrivalSummary(trip.finishers) ?? `${trip.finishers.length} on the trip`)
              : "Running now"}
        </span>
      </span>
      <span
        className="tnum"
        style={{ fontFamily: FONT.body, fontSize: 13, color: C.muted, flexShrink: 0 }}
      >
        {formatDay(when, now)}
      </span>
    </button>
  );
};

// ─── Screen: Trips ──────────────────────────────────────────────────────────

export const TripsScreen = ({
  trips, live, loading, hasMore, loadingMore, now, onOpen, onOpenLive, onLoadMore,
}: {
  trips: TripEntry[];
  live: LiveTripEntry[];
  loading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  now: number;
  onOpen: (tripId: string) => void;
  onOpenLive: (shareCode: string) => void;
  onLoadMore: () => void;
}) => {
  const months = groupByMonth(trips, now);

  return (
    <div className="flex flex-col h-full" style={{ paddingTop: PAD_T }}>
      <div className="px-6" style={{ paddingBottom: 14 }}>
        <ScreenTitle>Your trips</ScreenTitle>
      </div>

      {/* min-h-0 or this refuses to shrink and pushes the tab bar out of frame. */}
      <div
        className="flex-1 min-h-0 overflow-y-auto px-6"
        style={{ paddingBottom: TAB_BAR_SPACE }}
      >
        {live.length > 0 && (
          <div style={{ marginBottom: 22 }}>
            <Eyebrow tone={C.arrived}>LIVE NOW</Eyebrow>
            <div className="flex flex-col gap-2" style={{ marginTop: 8 }}>
              {live.map((t) => (
                <LiveTripCard
                  key={t.tripId}
                  trip={t}
                  now={now}
                  onOpen={() => onOpenLive(t.shareCode)}
                />
              ))}
            </div>
          </div>
        )}

        {loading && (
          <div style={{ fontFamily: FONT.body, fontSize: 14, color: C.muted }}>Loading…</div>
        )}

        {!loading && months.length === 0 && live.length === 0 && (
          <Empty
            title="No trips yet"
            body="Trips you take while signed in show up here. Nothing is kept for trips taken signed out."
          />
        )}

        {months.map((group) => (
          <div key={group.heading} style={{ marginBottom: 20 }}>
            <Eyebrow>{group.heading.toUpperCase()}</Eyebrow>
            <div style={{ marginTop: 6 }}>
              {group.trips.map((t) => (
                <TripRow key={t.tripId} trip={t} now={now} onOpen={() => onOpen(t.tripId)} />
              ))}
            </div>
          </div>
        ))}

        {hasMore && (
          <button
            onClick={onLoadMore}
            disabled={loadingMore}
            style={{
              fontFamily: FONT.body, fontSize: 14, color: C.muted,
              minHeight: 44, width: "100%",
            }}
          >
            {loadingMore ? "Loading…" : "Show older trips"}
          </button>
        )}
      </div>
    </div>
  );
};

// ─── Screen: one trip ───────────────────────────────────────────────────────

export const TripDetail = ({
  trip, now, onBack, onForget, busy = false, error,
}: {
  trip: TripEntry;
  now: number;
  onBack: () => void;
  onForget: () => void;
  busy?: boolean;
  error?: string | null;
}) => {
  const [confirming, setConfirming] = useState(false);

  const finished = trip.kind === "live" ? null : trip.finishedAt;
  const hasPin =
    trip.kind !== "live" && trip.destinationLat !== null && trip.destinationLng !== null;

  return (
    <div className="flex flex-col h-full" style={{ paddingTop: PAD_T }}>
      <div className="px-6 flex items-center gap-3" style={{ paddingBottom: 12 }}>
        <button
          onClick={onBack}
          aria-label="Back"
          style={{ color: C.text, minHeight: 44, minWidth: 44, marginLeft: -10 }}
          className="grid place-items-center"
        >
          <ArrowLeft size={22} />
        </button>
        <Eyebrow>{trip.wasCreator ? "YOU STARTED THIS" : "YOU JOINED"}</Eyebrow>
      </div>

      <div
        className="flex-1 min-h-0 overflow-y-auto px-6"
        style={{ paddingBottom: "calc(var(--safe-b) + 24px)" }}
      >
        <ScreenTitle>{tripTitle(trip)}</ScreenTitle>

        <div
          style={{
            fontFamily: FONT.body, fontSize: 14, color: C.muted, marginTop: 8, lineHeight: 1.5,
          }}
        >
          {formatDay(trip.startedAt, now)}
          {finished !== null && <> · {formatDuration(trip.startedAt, finished)}</>}
          {trip.kind === "past" && (
            <> · {trip.finishReason === "ended" ? "ended by the creator" : "expired"}</>
          )}
          {trip.kind === "live" && <> · running now</>}
        </div>

        {trip.kind !== "live" && trip.youLeftEarly && (
          <div
            style={{
              fontFamily: FONT.body, fontSize: 13, color: C.muted, marginTop: 6,
            }}
          >
            You left before it finished.
          </div>
        )}

        {/* The destination, and nothing else. There is no route line because no
            route was ever stored — and this is the one screen where somebody is
            most likely to go looking for one, so it says so rather than leaving
            an empty map looking broken. */}
        {hasPin && (
          <div style={{ marginTop: 20 }}>
            <Eyebrow>WHERE YOU WERE HEADED</Eyebrow>
            <div
              className="overflow-hidden rounded-2xl"
              style={{ height: 168, marginTop: 8, border: `1px solid ${C.line}` }}
            >
              <LiveMap
                markers={[]}
                destination={{ lat: trip.destinationLat!, lng: trip.destinationLng! }}
              />
            </div>
            <div
              style={{ fontFamily: FONT.body, fontSize: 12, color: C.muted, marginTop: 8 }}
            >
              {trip.destinationName !== null && <>{trip.destinationName}. </>}
              The destination only — nobody&rsquo;s route is kept once a trip ends.
            </div>
          </div>
        )}

        {!hasPin && trip.kind !== "live" && trip.destinationName !== null && (
          <div style={{ marginTop: 20 }}>
            <Eyebrow>DESTINATION</Eyebrow>
            <div
              style={{ fontFamily: FONT.body, fontSize: 16, color: C.text, marginTop: 6 }}
            >
              <MapPin size={14} style={{ display: "inline", marginRight: 6, color: C.muted }} />
              {trip.destinationName}
            </div>
          </div>
        )}

        <div style={{ marginTop: 24 }}>
          <Eyebrow>WHO FINISHED</Eyebrow>
          {trip.kind === "finishing" && (
            <p
              style={{
                fontFamily: FONT.body, fontSize: 14, color: C.muted, marginTop: 8, lineHeight: 1.5,
              }}
            >
              Still wrapping up. Who finished is recorded when the trip&rsquo;s location data is
              erased, which happens shortly after it ends.
            </p>
          )}
          {trip.kind === "live" && (
            <p
              style={{
                fontFamily: FONT.body, fontSize: 14, color: C.muted, marginTop: 8, lineHeight: 1.5,
              }}
            >
              This trip is still running.
            </p>
          )}
          {trip.kind === "past" && trip.finishers.length === 0 && (
            <p
              style={{
                fontFamily: FONT.body, fontSize: 14, color: C.muted, marginTop: 8, lineHeight: 1.5,
              }}
            >
              Nobody was still in the trip when it finished.
            </p>
          )}
          {trip.kind === "past" &&
            trip.finishers.map((f, i) => (
              <div
                key={`${f.name}-${i}`}
                className="flex items-center gap-3"
                style={{ minHeight: 48, borderTop: `1px solid ${C.line}` }}
              >
                <span className="flex-1" style={{ fontFamily: FONT.body, fontSize: 16, color: C.text }}>
                  {f.name}
                </span>
                {f.arrived === null ? (
                  <span style={{ fontFamily: FONT.body, fontSize: 13, color: C.muted }}>—</span>
                ) : (
                  <span
                    className="flex items-center gap-1.5"
                    style={{
                      fontFamily: FONT.body, fontSize: 13,
                      color: f.arrived ? C.arrived : C.muted,
                    }}
                  >
                    <Glyph s={f.arrived ? "arrived" : "behind"} size={12} />
                    {f.arrived ? "arrived" : "didn't arrive"}
                  </span>
                )}
              </div>
            ))}
        </div>

        {error !== null && error !== undefined && (
          <div
            style={{ fontFamily: FONT.body, fontSize: 14, color: C.behind, marginTop: 18 }}
            role="alert"
          >
            {error}
          </div>
        )}

        <div style={{ marginTop: 28 }}>
          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              className="flex items-center gap-2"
              style={{ fontFamily: FONT.body, fontSize: 14, color: C.muted, minHeight: 44 }}
            >
              <Trash2 size={15} />
              Remove from my history
            </button>
          ) : (
            <div
              className="rounded-2xl"
              style={{ background: C.sunken, border: `1px solid ${C.line}`, padding: 14 }}
            >
              <div
                style={{ fontFamily: FONT.body, fontSize: 14, color: C.text, lineHeight: 1.5 }}
              >
                Remove this trip from your history?
                {trip.kind === "live"
                  ? " You stay in the trip — this only forgets it."
                  : " If nobody else kept it, the record is deleted for good."}
              </div>
              <div className="flex gap-2" style={{ marginTop: 12 }}>
                <button
                  onClick={onForget}
                  disabled={busy}
                  className="flex-1 rounded-xl disabled:opacity-60"
                  style={{
                    minHeight: 44, background: C.behind, color: C.ground,
                    fontFamily: FONT.body, fontSize: 15, fontWeight: 600,
                  }}
                >
                  {busy ? "Removing…" : "Remove"}
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  className="flex-1 rounded-xl"
                  style={{
                    minHeight: 44, border: `1.5px solid ${C.lineStrong}`, color: C.text,
                    fontFamily: FONT.body, fontSize: 15, fontWeight: 600,
                  }}
                >
                  Keep it
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Screen: You ────────────────────────────────────────────────────────────

export const YouScreen = ({
  name, devices, themeChoice, notifsOn, hapticsSupported, busy, error,
  onRename, onChangeTheme, onToggleNotifs, onForgetDevice, onClearHistory, onSignOut,
}: {
  name: string;
  devices: AccountDevice[];
  themeChoice: ThemeChoice;
  notifsOn: boolean;
  hapticsSupported: boolean;
  busy: boolean;
  error: string | null;
  onRename: (name: string) => void;
  onChangeTheme: (c: ThemeChoice) => void;
  onToggleNotifs: () => void;
  onForgetDevice: (id: string) => void;
  onClearHistory: () => void;
  onSignOut: () => void;
}) => {
  const [draft, setDraft] = useState(name);
  const [clearing, setClearing] = useState(false);

  // The account arrives a round trip after this first renders, so `name` starts
  // as "" and `useState(name)` would capture that and never let go — the field
  // sat permanently empty. Adjusting state during render when a prop changes is
  // React's own answer to this; an effect would paint the empty field first.
  //
  // It also resets an in-flight edit if the name changes underneath, which only
  // happens right after a successful save, where the draft already matches.
  const [syncedName, setSyncedName] = useState(name);
  if (name !== syncedName) {
    setSyncedName(name);
    setDraft(name);
  }

  const trimmed = draft.trim();
  const dirty = trimmed !== name && trimmed.length >= 1 && trimmed.length <= 24;

  const themes: { key: ThemeChoice; icon: React.ReactNode; label: string }[] = [
    { key: "system", icon: <Monitor size={16} />, label: "Auto" },
    { key: "light", icon: <Sun size={16} />, label: "Light" },
    { key: "dark", icon: <Moon size={16} />, label: "Dark" },
  ];

  return (
    <div className="flex flex-col h-full" style={{ paddingTop: PAD_T }}>
      <div className="px-6" style={{ paddingBottom: 14 }}>
        <ScreenTitle>You</ScreenTitle>
      </div>

      <div
        className="flex-1 min-h-0 overflow-y-auto px-6"
        style={{ paddingBottom: TAB_BAR_SPACE }}
      >
        {/* ── Name ── */}
        <Eyebrow>YOUR NAME</Eyebrow>
        <div
          className="flex items-center gap-3"
          style={{ borderBottom: `1.5px solid ${C.lineStrong}`, paddingTop: 8, paddingBottom: 10 }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={24}
            aria-label="Your name"
            className="flex-1 bg-transparent outline-none"
            // 16px or larger, always: iOS Safari zooms the viewport on focus
            // below that, and a test enforces it.
            style={{ fontFamily: FONT.body, fontSize: 17, color: C.text, minHeight: 32 }}
          />
          {dirty && (
            <button
              onClick={() => onRename(trimmed)}
              disabled={busy}
              style={{
                fontFamily: FONT.body, fontSize: 15, fontWeight: 600,
                color: C.arrived, minHeight: 44, paddingInline: 4,
              }}
            >
              {busy ? "Saving…" : "Save"}
            </button>
          )}
        </div>
        <div style={{ fontFamily: FONT.body, fontSize: 12, color: C.muted, marginTop: 8 }}>
          Applies to trips from now on. Trips you have already taken keep the name you used.
        </div>

        {error !== null && (
          <div
            style={{ fontFamily: FONT.body, fontSize: 14, color: C.behind, marginTop: 12 }}
            role="alert"
          >
            {error}
          </div>
        )}

        {/* ── Preferences ── */}
        <div style={{ marginTop: 28 }}>
          <Eyebrow>PREFERENCES</Eyebrow>
          <div style={{ marginTop: 6 }}>
            <Row
              icon={<Sun size={18} />}
              label="Theme"
              detail="Follows your account to every device"
              right={
                <span className="flex gap-1" style={{ flexShrink: 0 }}>
                  {themes.map((t) => (
                    <button
                      key={t.key}
                      onClick={(e) => {
                        e.stopPropagation();
                        onChangeTheme(t.key);
                      }}
                      aria-label={t.label}
                      aria-pressed={themeChoice === t.key}
                      className="grid place-items-center rounded-lg"
                      style={{
                        width: 40, height: 40,
                        background: themeChoice === t.key ? C.text : "transparent",
                        color: themeChoice === t.key ? C.ground : C.muted,
                        border: `1px solid ${themeChoice === t.key ? C.text : C.line}`,
                      }}
                    >
                      {t.icon}
                    </button>
                  ))}
                </span>
              }
            />
            <Row
              icon={<Users size={18} />}
              label="Alerts"
              detail={
                hapticsSupported
                  ? "Buzz and notify when someone's status changes"
                  : "Notify when someone's status changes"
              }
              onClick={onToggleNotifs}
              right={<Switch on={notifsOn} />}
            />
          </div>
        </div>

        {/* ── Devices ── */}
        <div style={{ marginTop: 28 }}>
          <Eyebrow>YOUR DEVICES</Eyebrow>
          <div style={{ marginTop: 6 }}>
            {devices.map((d) => (
              <Row
                key={d.id}
                icon={<Smartphone size={18} />}
                label={d.current ? "This device" : "Another device"}
                detail={`Last used ${formatDay(d.lastSeenAt, Date.now())}`}
                right={
                  d.current ? undefined : (
                    <button
                      onClick={() => onForgetDevice(d.id)}
                      style={{
                        fontFamily: FONT.body, fontSize: 14, color: C.muted,
                        minHeight: 44, paddingInline: 6, flexShrink: 0,
                      }}
                    >
                      Sign out
                    </button>
                  )
                }
              />
            ))}
          </div>
          <div
            style={{ fontFamily: FONT.body, fontSize: 12, color: C.muted, marginTop: 10, lineHeight: 1.5 }}
          >
            Signing a device out unlinks it from your account. It keeps working and stays in any
            trip it has joined — only its future trips stop being added here.
          </div>
        </div>

        {/* ── History ── */}
        <div style={{ marginTop: 28 }}>
          <Eyebrow>YOUR HISTORY</Eyebrow>
          <p
            style={{
              fontFamily: FONT.body, fontSize: 13, color: C.muted, marginTop: 8, lineHeight: 1.55,
            }}
          >
            A trip you take while signed in leaves a record: its name, when it ran, where it was
            headed, and who finished. Never anybody&rsquo;s route, and never where anyone was.
            Trips taken signed out leave nothing at all.
          </p>
          {!clearing ? (
            <button
              onClick={() => setClearing(true)}
              className="flex items-center gap-2"
              style={{ fontFamily: FONT.body, fontSize: 14, color: C.muted, minHeight: 44, marginTop: 4 }}
            >
              <Trash2 size={15} />
              Clear all history
            </button>
          ) : (
            <div
              className="rounded-2xl"
              style={{ background: C.sunken, border: `1px solid ${C.line}`, padding: 14, marginTop: 10 }}
            >
              <div style={{ fontFamily: FONT.body, fontSize: 14, color: C.text, lineHeight: 1.5 }}>
                Remove every trip from your history? Records nobody else kept are deleted for
                good. You stay in any trip that is still running.
              </div>
              <div className="flex gap-2" style={{ marginTop: 12 }}>
                <button
                  onClick={() => {
                    setClearing(false);
                    onClearHistory();
                  }}
                  className="flex-1 rounded-xl"
                  style={{
                    minHeight: 44, background: C.behind, color: C.ground,
                    fontFamily: FONT.body, fontSize: 15, fontWeight: 600,
                  }}
                >
                  Clear everything
                </button>
                <button
                  onClick={() => setClearing(false)}
                  className="flex-1 rounded-xl"
                  style={{
                    minHeight: 44, border: `1.5px solid ${C.lineStrong}`, color: C.text,
                    fontFamily: FONT.body, fontSize: 15, fontWeight: 600,
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── What we keep ── */}
        <div
          className="rounded-2xl"
          style={{ background: C.sunken, border: `1px solid ${C.line}`, padding: 14, marginTop: 28 }}
        >
          <Eyebrow>WHAT YOUR ACCOUNT HOLDS</Eyebrow>
          <p
            style={{
              fontFamily: FONT.body, fontSize: 13, color: C.muted, marginTop: 8, lineHeight: 1.55,
            }}
          >
            An id from Google, the name above, and the trips you chose to keep. No email address.
            No location once a trip is over.
          </p>
        </div>

        <div style={{ marginTop: 24, marginBottom: 8 }}>
          <SecondaryButton onClick={onSignOut}>
            Sign out
            <ArrowRight size={20} />
          </SecondaryButton>
        </div>
      </div>
    </div>
  );
};

// ─── Home: the signed-in additions ──────────────────────────────────────────

/**
 * What Home shows above the two buttons once somebody is signed in.
 *
 * Deliberately not a replacement for the landing screen — `Landing` still owns
 * the marketing copy for signed-out visitors, and this sits in front of it
 * rather than forking it.
 */
export const HomeDashboard = ({
  name, live, recent, now, onStart, onJoin, onOpenLive, onOpenTrip, onSeeAll,
}: {
  name: string;
  live: LiveTripEntry[];
  recent: TripEntry[];
  now: number;
  onStart: () => void;
  onJoin: () => void;
  onOpenLive: (shareCode: string) => void;
  onOpenTrip: (tripId: string) => void;
  onSeeAll: () => void;
}) => (
  <div className="flex flex-col h-full" style={{ paddingTop: PAD_T }}>
    <div className="px-6" style={{ paddingBottom: 16 }}>
      <ScreenTitle>
        Welcome back,
        <br />
        {name}.
      </ScreenTitle>
    </div>

    <div
      className="flex-1 min-h-0 overflow-y-auto px-6"
      style={{ paddingBottom: TAB_BAR_SPACE }}
    >
      {live.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <Eyebrow tone={C.arrived}>LIVE NOW</Eyebrow>
          <div className="flex flex-col gap-2" style={{ marginTop: 8 }}>
            {live.map((t) => (
              <LiveTripCard
                key={t.tripId}
                trip={t}
                now={now}
                onOpen={() => onOpenLive(t.shareCode)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <PrimaryButton onClick={onStart}>
          Start a trip
          <ArrowRight size={20} />
        </PrimaryButton>
        <SecondaryButton onClick={onJoin}>
          Join with a code
          <ArrowRight size={20} />
        </SecondaryButton>
      </div>

      {recent.length > 0 && (
        <div style={{ marginTop: 26 }}>
          <Eyebrow>RECENT</Eyebrow>
          <div style={{ marginTop: 6 }}>
            {recent.map((t) => (
              <TripRow key={t.tripId} trip={t} now={now} onOpen={() => onOpenTrip(t.tripId)} />
            ))}
          </div>
          <button
            onClick={onSeeAll}
            className="flex items-center gap-1"
            style={{ fontFamily: FONT.body, fontSize: 14, color: C.muted, minHeight: 44 }}
          >
            All trips
            <ChevronRight size={15} />
          </button>
        </div>
      )}
    </div>
  </div>
);
