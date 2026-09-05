"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PhoneFrame } from "../../components/PhoneFrame";
import {
  Group, MemberView, MapView, Ended, Toast, MenuSheet, GlanceView,
  memberFromParticipant, C, FONT, type Member,
} from "../../components/Radar";
import { useGeolocation } from "../../hooks/useGeolocation";
import { useWakeLock } from "../../hooks/useWakeLock";
import { data, getIdentity, notifications, vapidPublicKey } from "@/lib/data";
import { enablePush, disablePush, pushSupported, needsHomeScreenInstall } from "@/lib/push";
import { serverNow } from "@/lib/serverTime";
import { computeStatuses } from "@/lib/status";
import { computeVerdict } from "@/lib/verdict";
import { diffStatuses } from "@/lib/notify";
import { startDemoConvoy } from "@/lib/demo";
import { buzz, hapticsSupported } from "@/lib/haptics";
import { normalizeChoice, resolveTheme, THEME_KEY, type ThemeChoice } from "@/lib/theme";
import { PRODUCT_NAME } from "@/lib/brand";
import type { Participant, StatusKey, Trip } from "@/lib/types";

type View = { kind: "group" } | { kind: "member"; id: string } | { kind: "map" } | { kind: "glance" };
type Load = "loading" | "ready" | "ended" | "unreachable";

export default function GroupPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();

  // clientId touches localStorage, so resolve it on the client only (avoids SSR crash).
  const [clientId, setClientId] = useState("");
  const [trip, setTrip] = useState<Trip | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [load, setLoad] = useState<Load>("loading");
  const [view, setView] = useState<View>({ kind: "group" });
  const [toast, setToast] = useState<{ text: string; status: StatusKey | null } | null>(null);
  // Server time, not this device's: every timestamp we compare against now
  // comes from the API, so a phone with a fast clock would otherwise decide
  // the whole group had been stationary for five minutes.
  const [now, setNow] = useState(() => serverNow());
  const [demoOn, setDemoOn] = useState(false);
  const [notifsOn, setNotifsOn] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [wantWake, setWantWake] = useState(true);
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>(() =>
    typeof window === "undefined"
      ? "system"
      : normalizeChoice(window.localStorage.getItem(THEME_KEY))
  );
  const leaving = useRef(false);
  const stopDemo = useRef<() => void>(() => {});
  const prevStatuses = useRef<Record<string, StatusKey> | null>(null);

  const flash = useCallback((text: string, status: StatusKey | null = null) => {
    setToast({ text, status });
    window.setTimeout(() => setToast(null), 2600);
  }, []);

  // Stream this device's real position into the trip once we're in.
  const geo = useGeolocation({
    tripId: trip?.id ?? null,
    participantId: clientId,
    enabled: load === "ready",
    // Locally a write could never be refused, so nothing caught it. Over a
    // network the trip can end under us mid-drive, and an unhandled rejection
    // inside watchPosition would just repeat on every fix.
    onTripUnavailable: () => {
      setTrip(null);
      setLoad("ended");
    },
  });

  // Glance mode forces the lock on: it exists to be stared at from a bar mount.
  const wake = useWakeLock(load === "ready" && (wantWake || view.kind === "glance"));

  const changeTheme = useCallback((choice: ThemeChoice) => {
    setThemeChoice(choice);
    try {
      if (choice === "system") window.localStorage.removeItem(THEME_KEY);
      else window.localStorage.setItem(THEME_KEY, choice);
    } catch { /* private mode — the choice still applies for this session */ }
  }, []);

  // Applies every choice, not just "system": an earlier version returned early
  // for explicit choices and left the attribute wherever it happened to be.
  // The media listener is only attached while actually following the system.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      document.documentElement.setAttribute(
        "data-theme",
        resolveTheme(themeChoice === "system" ? null : themeChoice, mq.matches)
      );
    apply();
    if (themeChoice !== "system") return;
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [themeChoice]);

  useEffect(() => {
    let cancelled = false;
    let unsub = () => {};

    void (async () => {
      try {
        const id = await getIdentity();
        if (cancelled) return;
        setClientId(id);

        const found = await data.getTripByCode(code);
        if (cancelled) return;
        if (!found) {
          setLoad("ended");
          return;
        }

        // You must be a participant to view the group — sends creator + link
        // visitors through the name step exactly once.
        const roster = await data.listParticipants(found.id);
        if (cancelled) return;
        if (!roster.some((p) => p.id === id)) {
          router.replace(`/t/${found.shareCode}/join`);
          return;
        }

        const refresh = async () => {
          try {
            // Re-check liveness (expiry, or ended on another device).
            const live = await data.getTripById(found.id);
            if (cancelled) return;
            if (!live) {
              setTrip(null);
              setLoad("ended");
              return;
            }
            const list = await data.listParticipants(found.id);
            if (cancelled) return;
            setParticipants(list);
          } catch {
            // Mid-trip connectivity comes and goes. Hold the last known
            // positions rather than blanking the screen someone is riding by.
          }
        };

        setTrip(found);
        setParticipants(roster);
        setLoad("ready");
        unsub = data.subscribe(found.id, () => {
          if (!leaving.current) void refresh();
        });
      } catch {
        // Reaching the trip failed for a reason that is not "it is over".
        if (!cancelled) setLoad("unreachable");
      }
    })();

    return () => {
      cancelled = true;
      unsub();
    };
  }, [code, router]);

  // Tick so time-based status (stopped, last-seen) stays fresh without new positions.
  useEffect(() => {
    if (load !== "ready") return;
    const t = setInterval(() => setNow(serverNow()), 15_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => () => stopDemo.current(), []);

  const destination = useMemo(
    () =>
      trip?.destinationLat != null && trip?.destinationLng != null
        ? { lat: trip.destinationLat, lng: trip.destinationLng }
        : null,
    [trip?.destinationLat, trip?.destinationLng]
  );

  const statuses = useMemo(
    () => computeStatuses(participants, destination, now),
    [participants, destination, now]
  );

  const members: Member[] = useMemo(
    () =>
      participants.map((p, i) => {
        const base = memberFromParticipant(p, clientId, now, i);
        const s = statuses[p.id];
        return s ? { ...base, status: s.status, kmLeft: s.kmLeft } : base;
      }),
    [participants, statuses, now, clientId]
  );

  const verdict = useMemo(
    () =>
      computeVerdict({
        participants,
        statuses,
        selfId: clientId,
        destinationName: trip?.destinationName ?? null,
        now,
      }),
    [participants, statuses, clientId, trip?.destinationName, now]
  );

  // Surface meaningful status changes — toast always, plus a buzz and a system
  // notification when alerts are on. You can't read a toast mid-stride.
  useEffect(() => {
    if (load !== "ready") return;
    const located = members.filter((m) => m.located);
    const cur: Record<string, StatusKey> = {};
    const names: Record<string, string> = {};
    for (const m of located) {
      cur[m.id] = m.status;
      names[m.id] = m.you ? "You" : m.name;
    }
    const prev = prevStatuses.current;
    if (prev) {
      // Tell the server about every transition this device noticed, so members
      // whose screens are off still hear about it. The server de-duplicates
      // across the group and renders the wording itself.
      //
      // The known hole in doing it client-side: if every screen in the group is
      // off, nobody is computing statuses, so nobody reports and nobody is
      // notified — exactly the case push exists for.
      if (trip) {
        for (const id of Object.keys(cur)) {
          if (id in prev && prev[id] !== cur[id]) {
            void notifications.report(trip.id, id, cur[id]);
          }
        }
      }

      const msgs = diffStatuses(prev, cur, names);
      if (msgs.length) {
        flash(msgs[0], verdict.status);
        if (notifsOn) {
          buzz(verdict.tone);
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            msgs.forEach((m) => new Notification(PRODUCT_NAME, { body: m }));
          }
        }
      }
    }
    prevStatuses.current = cur;
    // verdict is derived from members; including it would re-run on every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, load, notifsOn, flash]);

  if (load === "loading") {
    return (
      <PhoneFrame>
        <div
          className="grid place-items-center h-full"
          style={{ fontFamily: FONT.body, color: C.muted, fontSize: 15 }}
        >
          Loading…
        </div>
      </PhoneFrame>
    );
  }

  if (load === "unreachable") {
    return (
      <PhoneFrame>
        <div className="flex flex-col h-full items-center justify-center px-8 text-center gap-3">
          <div style={{ fontFamily: FONT.display, fontSize: 22, color: C.text }}>
            Can&rsquo;t reach this trip
          </div>
          <div style={{ fontFamily: FONT.body, fontSize: 14, color: C.muted }}>
            You may be offline. The trip is probably still running.
          </div>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-6 rounded-2xl"
            style={{
              background: C.text, color: C.ground,
              fontFamily: FONT.body, fontWeight: 600, minHeight: 52,
            }}
          >
            Try again
          </button>
        </div>
      </PhoneFrame>
    );
  }

  if (load === "ended" || !trip) {
    return (
      <PhoneFrame>
        <Ended memberCount={participants.length} onRestart={() => router.push("/")} />
      </PhoneFrame>
    );
  }

  const isCreator = trip.creatorId === clientId;
  const joinUrl =
    typeof window !== "undefined" ? `${window.location.origin}/t/${trip.shareCode}/join` : "";

  const toggleNotifs = async () => {
    if (notifsOn) {
      setNotifsOn(false);
      // Stop the group's pushes reaching a phone whose owner just said no.
      void disablePush().catch(() => undefined);
      void notifications.unsubscribe();
      return;
    }

    if (typeof Notification === "undefined") {
      // Haptics may still work even where notifications don't.
      setNotifsOn(true);
      flash(hapticsSupported() ? "Buzz alerts on" : "Alerts aren’t supported here");
      return;
    }

    // Web Push keeps working with the screen off, which is the case that
    // matters here. Where it is unavailable the in-tab toast and buzz remain,
    // so the toggle still does something rather than refusing.
    if (pushSupported() && vapidPublicKey !== "") {
      try {
        const keys = await enablePush(vapidPublicKey);
        if (keys !== null) {
          await notifications.subscribe(keys);
          setNotifsOn(true);
          flash("Alerts on, even with the screen off");
          return;
        }
        // Permission declined — fall through to the same message as below.
      } catch {
        // Registration or subscription failed. Tab-only alerts still work,
        // so degrade rather than leaving the bell doing nothing.
        const perm = Notification.permission;
        setNotifsOn(perm === "granted");
        flash(
          perm === "granted"
            ? "Alerts on while this screen is open"
            : "Allow notifications in your browser to enable alerts"
        );
        return;
      }
    }

    const perm =
      Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (perm === "granted") {
      setNotifsOn(true);
      flash(
        needsHomeScreenInstall()
          ? "Alerts on. Add Radar to your Home Screen for alerts with the screen off"
          : "Alerts on while this screen is open"
      );
    } else {
      flash("Allow notifications in your browser to enable alerts");
    }
  };

  const invite = async () => {
    setMenuOpen(false);
    if (navigator.share) {
      try {
        await navigator.share({ title: `Join my trip on ${PRODUCT_NAME}`, url: joinUrl });
        return;
      } catch {
        /* cancelled — fall through to copy */
      }
    }
    try {
      await navigator.clipboard.writeText(joinUrl);
      flash("Invite link copied");
    } catch {
      flash(`Share code: ${trip.shareCode}`);
    }
  };

  const startDemo = () => {
    setMenuOpen(false);
    if (demoOn) return;
    const origin = geo.position ?? { lat: 5.6037, lng: -0.187 };
    stopDemo.current = startDemoConvoy({ tripId: trip.id, origin, destination });
    setDemoOn(true);
    flash("Demo convoy added");
  };

  const leave = async () => {
    leaving.current = true;
    stopDemo.current();
    // Navigate regardless: the row is removed on a best-effort basis, and an
    // 8-hour expiry cleans up anything a lost connection leaves behind.
    try {
      await data.leaveTrip(trip.id, clientId);
    } catch {
      /* nothing the leaver can do about it */
    }
    router.push("/");
  };

  const end = async () => {
    leaving.current = true;
    stopDemo.current();
    try {
      await data.endTrip(trip.id);
    } catch {
      // Ending is the one action with consequences for everyone else, so a
      // failure has to be visible rather than faked.
      leaving.current = false;
      flash("Couldn't end the trip. Check your connection.");
      return;
    }
    setTrip(null);
    setLoad("ended");
  };

  const locationNotice =
    geo.status === "denied"
      ? ("denied" as const)
      : geo.status === "unsupported"
      ? ("unsupported" as const)
      : geo.status === "prompting"
      ? ("locating" as const)
      : null;

  return (
    <PhoneFrame>
      {toast && view.kind !== "glance" && (
        <Toast
          text={toast.text}
          tone={verdict.tone}
          status={toast.status}
          onClose={() => setToast(null)}
        />
      )}

      {view.kind === "group" && (
        <Group
          tripName={trip.name}
          destinationName={trip.destinationName}
          members={members}
          verdict={verdict}
          isCreator={isCreator}
          locationNotice={locationNotice}
          notifsOn={notifsOn}
          onToggleNotifs={toggleNotifs}
          onOpenMenu={() => setMenuOpen(true)}
          onSelectMember={(id) => setView({ kind: "member", id })}
          onOpenMap={() => setView({ kind: "map" })}
          onInvite={invite}
        />
      )}

      {view.kind === "member" && (
        <MemberView
          member={members.find((m) => m.id === view.id) ?? members[0]}
          onBack={() => setView({ kind: "group" })}
        />
      )}

      {view.kind === "map" && (
        <MapView
          members={members}
          rawMembers={participants}
          destination={destination}
          destinationName={trip.destinationName}
          onBack={() => setView({ kind: "group" })}
        />
      )}

      {view.kind === "glance" && (
        <GlanceView
          verdict={verdict}
          members={members}
          onExit={() => setView({ kind: "group" })}
        />
      )}

      <MenuSheet
        open={menuOpen}
        isCreator={isCreator}
        notifsOn={notifsOn}
        hapticsSupported={hapticsSupported()}
        wakeOn={wantWake}
        wakeSupported={wake.supported}
        themeChoice={themeChoice}
        canDemo={!demoOn && members.length <= 1}
        onClose={() => setMenuOpen(false)}
        onToggleNotifs={toggleNotifs}
        onToggleWake={() => setWantWake((v) => !v)}
        onChangeTheme={changeTheme}
        onGlance={() => { setMenuOpen(false); setView({ kind: "glance" }); }}
        onInvite={invite}
        onStartDemo={startDemo}
        onLeave={() => void leave()}
        onEnd={() => void end()}
      />
    </PhoneFrame>
  );
}
