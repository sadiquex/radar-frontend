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
import { data } from "@/lib/data";
import { getClientId } from "@/lib/clientId";
import { computeStatuses } from "@/lib/status";
import { computeVerdict } from "@/lib/verdict";
import { diffStatuses } from "@/lib/notify";
import { startDemoConvoy } from "@/lib/demo";
import { buzz, hapticsSupported } from "@/lib/haptics";
import { normalizeChoice, resolveTheme, THEME_KEY, type ThemeChoice } from "@/lib/theme";
import { PRODUCT_NAME } from "@/lib/brand";
import type { Participant, StatusKey, Trip } from "@/lib/types";

type View = { kind: "group" } | { kind: "member"; id: string } | { kind: "map" } | { kind: "glance" };
type Load = "loading" | "ready" | "ended";

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
  const [now, setNow] = useState(() => Date.now());
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
    const id = getClientId();
    setClientId(id);

    const found = data.getTripByCode(code);
    if (!found) {
      setLoad("ended");
      return;
    }
    // You must be a participant to view the group — sends creator + link visitors
    // through the name step exactly once.
    const isMember = data.listParticipants(found.id).some((p) => p.id === id);
    if (!isMember) {
      router.replace(`/t/${found.shareCode}/join`);
      return;
    }

    const refresh = () => {
      const live = data.getTripById(found.id); // re-check liveness (expiry / ended elsewhere)
      if (!live) {
        setTrip(null);
        setLoad("ended");
        return;
      }
      setParticipants(data.listParticipants(found.id));
    };

    setTrip(found);
    setLoad("ready");
    refresh();
    const unsub = data.subscribe(found.id, () => {
      if (!leaving.current) refresh();
    });
    return unsub;
  }, [code, router]);

  // Tick so time-based status (stopped, last-seen) stays fresh without new positions.
  useEffect(() => {
    if (load !== "ready") return;
    const t = setInterval(() => setNow(Date.now()), 15_000);
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
      return;
    }
    if (typeof Notification === "undefined") {
      // Haptics may still work even where notifications don't.
      setNotifsOn(true);
      flash(hapticsSupported() ? "Buzz alerts on" : "Alerts aren’t supported here");
      return;
    }
    const perm =
      Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (perm === "granted") {
      setNotifsOn(true);
      flash("Alerts on");
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

  const leave = () => {
    leaving.current = true;
    stopDemo.current();
    data.leaveTrip(trip.id, clientId);
    router.push("/");
  };

  const end = () => {
    leaving.current = true;
    stopDemo.current();
    data.endTrip(trip.id);
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
        onLeave={leave}
        onEnd={end}
      />
    </PhoneFrame>
  );
}
