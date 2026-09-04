"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PhoneFrame } from "./components/PhoneFrame";
import { Landing, Create, Share, memberFromParticipant, type Member } from "./components/Radar";
import { data, getIdentity } from "@/lib/data";
import { serverNow } from "@/lib/serverTime";
import type { Trip } from "@/lib/types";

type Step = "landing" | "create" | "share";

export default function Home() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("landing");
  const [trip, setTrip] = useState<Trip | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Only claim we'll hold the screen awake if this browser can actually do it.
  const [wakeSupported, setWakeSupported] = useState(false);

  useEffect(() => {
    setWakeSupported(typeof navigator !== "undefined" && "wakeLock" in navigator);
  }, []);

  // While on the Share screen, show people joining live.
  useEffect(() => {
    if (step !== "share" || !trip) return;
    let cancelled = false;

    const refresh = async () => {
      try {
        const [me, participants] = await Promise.all([
          getIdentity(),
          data.listParticipants(trip.id),
        ]);
        if (cancelled) return;
        setMembers(
          participants.map((p, i) => memberFromParticipant(p, me, serverNow(), i))
        );
      } catch {
        // The share code is already on screen and the trip exists; a failed
        // poll gives the creator nothing to act on.
      }
    };

    void refresh();
    const unsub = data.subscribe(trip.id, () => void refresh());
    return () => {
      cancelled = true;
      unsub();
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
        <Landing onStart={() => setStep("create")} onJoin={() => router.push("/join")} />
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
          members={members}
          onBack={() => setStep("create")}
          onOpen={() => router.push(`/t/${trip.shareCode}`)}
        />
      )}
    </PhoneFrame>
  );
}
