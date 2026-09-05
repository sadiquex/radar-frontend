"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PhoneFrame } from "./components/PhoneFrame";
import { Landing, Create, Share } from "./components/Radar";
import { GoogleSignInButton } from "./components/GoogleSignInButton";
import { useAccount } from "./hooks/useAccount";
import { data, getIdentity } from "@/lib/data";
import type { Trip } from "@/lib/types";

type Step = "landing" | "create" | "share";

export default function Home() {
  const router = useRouter();
  const account = useAccount();
  const [step, setStep] = useState<Step>("landing");
  const [trip, setTrip] = useState<Trip | null>(null);
  const [memberCount, setMemberCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Only claim we'll hold the screen awake if this browser can actually do it.
  const [wakeSupported, setWakeSupported] = useState(false);

  useEffect(() => {
    setWakeSupported(typeof navigator !== "undefined" && "wakeLock" in navigator);
  }, []);

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

  return (
    <PhoneFrame>
      {step === "landing" && (
        <Landing
          onStart={() => setStep("create")}
          onJoin={() => router.push("/join")}
          account={{
            state: account.state,
            name: account.profile?.displayName ?? null,
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
    </PhoneFrame>
  );
}
