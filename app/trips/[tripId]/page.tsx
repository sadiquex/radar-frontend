"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PhoneFrame } from "../../components/PhoneFrame";
import { TripDetail } from "../../components/Account";
import { C, FONT } from "../../components/Radar";
import { useAccount } from "../../hooks/useAccount";
import { history } from "@/lib/data";
import type { TripEntry } from "@/lib/data/history";

type Load = "loading" | "ready" | "missing";

/**
 * One trip in detail.
 *
 * A leaf, outside the (tabs) group: it has its own Back and, for a trip with a
 * destination, a map that wants the height. A tab bar under it would compete
 * with both.
 */
export default function TripDetailPage() {
  const router = useRouter();
  const params = useParams<{ tripId: string }>();
  const tripId = params?.tripId ?? "";
  const account = useAccount();
  const signedIn = account.state === "signedIn";

  const [trip, setTrip] = useState<TripEntry | null>(null);
  const [load, setLoad] = useState<Load>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (account.state === "signedOut") {
      router.replace("/");
      return;
    }
    if (!signedIn || tripId === "") return;
    let cancelled = false;

    void history.get(tripId).then((found) => {
      if (cancelled) return;
      // A live trip belongs on the group screen, which is the thing you
      // actually want when you tap a trip that is still running.
      if (found?.kind === "live") {
        router.replace(`/t/${found.shareCode}`);
        return;
      }
      setTrip(found);
      setLoad(found === null ? "missing" : "ready");
    });

    return () => {
      cancelled = true;
    };
  }, [tripId, signedIn, account.state, router]);

  const forget = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await history.forget(tripId);
      router.replace("/trips");
    } catch {
      setError("Couldn't remove that trip. Try again.");
      setBusy(false);
    }
  }, [tripId, router]);

  return (
    <PhoneFrame>
      {load === "loading" && (
        <div
          className="h-full grid place-items-center"
          style={{ fontFamily: FONT.body, fontSize: 14, color: C.muted }}
        >
          Loading…
        </div>
      )}

      {load === "missing" && (
        <div className="h-full grid place-items-center px-8 text-center">
          <div>
            <div style={{ fontFamily: FONT.display, fontSize: 20, color: C.text, fontWeight: 500 }}>
              Not in your trips
            </div>
            <p
              style={{
                fontFamily: FONT.body, fontSize: 14, color: C.muted,
                marginTop: 8, lineHeight: 1.5,
              }}
            >
              This trip is not one of yours, or you have already removed it.
            </p>
            <button
              onClick={() => router.replace("/trips")}
              style={{ fontFamily: FONT.body, fontSize: 15, color: C.text, minHeight: 44, marginTop: 12 }}
            >
              Back to your trips
            </button>
          </div>
        </div>
      )}

      {load === "ready" && trip !== null && (
        <TripDetail
          trip={trip}
          now={Date.now()}
          onBack={() => router.back()}
          onForget={() => void forget()}
          busy={busy}
          error={error}
        />
      )}
    </PhoneFrame>
  );
}
