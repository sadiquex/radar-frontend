"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PhoneFrame } from "./PhoneFrame";
import { Join, C, FONT } from "./Radar";
import { SHARE_CODE_ALPHABET } from "@/lib/shareCode";
import { data, getIdentity, ApiError } from "@/lib/data";
import type { Trip } from "@/lib/types";

// Drives both link joins (/t/[code]/join, code prefilled) and manual joins (/join).
export function JoinFlow({ initialCode }: { initialCode?: string }) {
  const router = useRouter();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!initialCode) return;
    let cancelled = false;
    data
      .getTripByCode(initialCode)
      .then((found) => {
        if (cancelled) return;
        if (found) setTrip(found);
        else setNotFound(true);
      })
      .catch(() => {
        // A lookup that fails for some other reason is not a dead link, and
        // saying so would send people away from a trip that is running.
        if (!cancelled) setError("Couldn't reach that trip. Check your connection.");
      });
    return () => {
      cancelled = true;
    };
  }, [initialCode]);

  const handleJoin = async ({ code, name }: { code: string; name: string }) => {
    setBusy(true);
    setError(null);
    try {
      const target = trip ?? (await data.getTripByCode(code));
      if (!target) {
        setError("That code isn't an active trip.");
        setBusy(false);
        return;
      }
      await data.joinTrip(target.id, await getIdentity(), name);
      // Deliberately staying busy across the navigation, so the button cannot
      // be pressed a second time while the group screen mounts.
      router.push(`/t/${target.shareCode}`);
    } catch (err) {
      setError(joinErrorMessage(err));
      setBusy(false);
    }
  };

  if (notFound) {
    return (
      <PhoneFrame>
        <div className="flex flex-col h-full items-center justify-center px-8 text-center gap-3">
          <div style={{ fontFamily: FONT.display, fontSize: 22, color: C.text }}>Trip not found</div>
          <div style={{ fontFamily: FONT.body, fontSize: 14, color: C.muted }}>
            This link is invalid or the trip has ended.
          </div>
          <button
            onClick={() => router.push("/")}
            className="mt-4 px-6 rounded-2xl"
            style={{ background: C.text, color: C.ground, fontFamily: FONT.body, fontWeight: 600, minHeight: 52 }}
          >
            Start a new trip
          </button>
        </div>
      </PhoneFrame>
    );
  }

  return (
    <PhoneFrame>
      <Join
        alphabet={SHARE_CODE_ALPHABET}
        prefilledCode={trip?.shareCode ?? ""}
        tripName={trip?.name}
        onBack={() => router.push("/")}
        onJoin={(input) => void handleJoin(input)}
        busy={busy}
        error={error}
      />
    </PhoneFrame>
  );
}

function joinErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return "Couldn't join that trip. Try again.";
  switch (err.code) {
    case "trip_full":
      return "This trip is full.";
    case "ended":
    case "expired":
      return "That trip has already ended.";
    case "offline":
      return "You appear to be offline.";
    default:
      return "Couldn't join that trip. Try again.";
  }
}
