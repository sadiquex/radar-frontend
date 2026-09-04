"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PhoneFrame } from "./PhoneFrame";
import { Join, C, FONT } from "./Radar";
import { SHARE_CODE_ALPHABET } from "@/lib/shareCode";
import { data } from "@/lib/data";
import { getClientId } from "@/lib/clientId";
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
    const found = data.getTripByCode(initialCode);
    if (found) setTrip(found);
    else setNotFound(true);
  }, [initialCode]);

  const handleJoin = ({ code, name }: { code: string; name: string }) => {
    setBusy(true);
    setError(null);
    const target = trip ?? data.getTripByCode(code);
    if (!target) {
      setError("That code isn't an active trip.");
      setBusy(false);
      return;
    }
    data.joinTrip(target.id, getClientId(), name);
    router.push(`/t/${target.shareCode}`);
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
        onJoin={handleJoin}
        busy={busy}
        error={error}
      />
    </PhoneFrame>
  );
}
