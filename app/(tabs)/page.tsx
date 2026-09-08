"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Landing, Create, Share } from "../components/Radar";
import { HomeDashboard } from "../components/Account";
import { GoogleSignInButton } from "../components/GoogleSignInButton";
import { useAccount } from "../hooks/useAccount";
import { useHistory, useLiveTrips } from "../hooks/useHistory";
import { useHideTabBar } from "../components/TabBarContext";
import { data, getIdentity } from "@/lib/data";
import type { Trip } from "@/lib/types";

type Step = "landing" | "create" | "share";

/** How many finished trips the dashboard peeks at before "All trips". */
const RECENT_ROWS = 3;

export default function Home() {
  const router = useRouter();
  const account = useAccount();
  const tabBar = useHideTabBar();
  const [step, setStep] = useState<Step>("landing");
  const [trip, setTrip] = useState<Trip | null>(null);
  const [memberCount, setMemberCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Only claim we'll hold the screen awake if this browser can actually do it.
  const [wakeSupported, setWakeSupported] = useState(false);

  const signedIn = account.state === "signedIn";
  const { live } = useLiveTrips(signedIn);
  const { trips } = useHistory(signedIn);

  useEffect(() => {
    setWakeSupported(typeof navigator !== "undefined" && "wakeLock" in navigator);
  }, []);

  // Create and Share own the whole viewport — a form with a bottom CTA, and a
  // share code — so the shell's tab bar stands down for them.
  useEffect(() => {
    tabBar.setHidden(step !== "landing");
    return () => tabBar.setHidden(false);
  }, [step, tabBar]);

  // While on the Share screen, show people arriving.
  //
  // A count, by share code — not the roster. The creator has not been through
  // the name step yet, so they are not a member of their own trip and the
  // server will not show them who is in it. Asking for the roster here got a
  // 403 on every poll and the counter sat at zero forever.
  useEffect(() => {
    if (step !== "share" || !trip) return;
    let cancelled = false;

    const refresh = async () => {
      try {
        const count = await data.countMembers(trip.shareCode);
        if (!cancelled) setMemberCount(count);
      } catch {
        // The code is already on screen; a failed poll gives the creator
        // nothing to act on.
      }
    };

    void refresh();
    // Polled rather than subscribed: the live channel is member-only too.
    const timer = setInterval(() => void refresh(), 4_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [step, trip]);

  const handleCreate = async (input: {
    name?: string;
    destinationName?: string;
    destinationLat?: number;
    destinationLng?: number;
  }) => {
    setBusy(true);
    setError(null);
    try {
      const created = await data.createTrip(input, await getIdentity());
      setTrip(created);
      setStep("share");
    } catch {
      setError("Couldn't start the trip. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const shareUrl =
    trip && typeof window !== "undefined" ? `${window.location.origin}/t/${trip.shareCode}/join` : "";

  const recent = trips.filter((t) => t.kind !== "live").slice(0, RECENT_ROWS);

  return (
    <>
      {step === "landing" && account.profile !== null && (
        <HomeDashboard
          name={account.profile.displayName}
          live={live}
          recent={recent}
          now={Date.now()}
          onStart={() => setStep("create")}
          onJoin={() => router.push("/join")}
          onOpenLive={(shareCode) => router.push(`/t/${shareCode}`)}
          onOpenTrip={(tripId) => router.push(`/trips/${tripId}`)}
          onSeeAll={() => router.push("/trips")}
        />
      )}

      {/* The landing screen is still the whole of Home for anyone signed out,
          and for the moment before /auth/me answers on a cold load. */}
      {step === "landing" && account.profile === null && (
        <Landing
          onStart={() => setStep("create")}
          onJoin={() => router.push("/join")}
          account={{
            state: account.state,
            // Narrowed to null by the branch above; Landing owns the
            // signed-out state and never needs a name here.
            name: null,
            available: account.available,
            onSignOut: () => void account.signOut(),
            signInSlot: (
              <GoogleSignInButton onCredential={(idToken) => void account.signIn(idToken)} />
            ),
          }}
        />
      )}

      {step === "create" && (
        <Create
          onBack={() => setStep("landing")}
          onCreate={(input) => void handleCreate(input)}
          busy={busy}
          wakeSupported={wakeSupported}
          error={error}
        />
      )}
      {step === "share" && trip && (
        <Share
          shareCode={trip.shareCode}
          shareUrl={shareUrl}
          memberCount={memberCount}
          onBack={() => setStep("create")}
          onOpen={() => router.push(`/t/${trip.shareCode}`)}
        />
      )}
    </>
  );
}
