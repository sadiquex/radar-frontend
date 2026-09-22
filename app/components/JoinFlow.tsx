"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PhoneFrame } from "./PhoneFrame";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Join, C, FONT, PrimaryButton, SecondaryButton } from "./Radar";
import { GoogleSignInButton } from "./GoogleSignInButton";
import { useAccount } from "../hooks/useAccount";
import { SHARE_CODE_ALPHABET } from "@/lib/shareCode";
import { data, getIdentity } from "@/lib/data";
import { joinOutcome } from "@/lib/joinOutcome";
import type { OccupiedTrip } from "@/lib/data/types";
import type { Trip } from "@/lib/types";

// Drives both link joins (/t/[code]/join, code prefilled) and manual joins (/join).
export function JoinFlow({ initialCode }: { initialCode?: string }) {
  const router = useRouter();
  const account = useAccount();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Set when the server refused because this device is riding somewhere else.
  // Carries the join we were part-way through so confirming can finish it.
  const [switching, setSwitching] = useState<{
    occupied: OccupiedTrip;
    pending: { code: string; name: string };
  } | null>(null);

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
      router.push(`/app/t/${target.shareCode}`);
    } catch (err) {
      const outcome = joinOutcome(err);
      if (outcome.kind === "switch") {
        // Hold the rider's typed name and code: after they confirm we join
        // with exactly what they already entered rather than sending them
        // back through the form.
        setSwitching({ occupied: outcome.occupied, pending: { code, name } });
      } else {
        setError(outcome.text);
      }
      setBusy(false);
    }
  };

  /** Leave the trip we are in, then join the one we were asked for. */
  const handleSwitch = async () => {
    if (!switching) return;
    const { occupied, pending } = switching;
    setSwitching(null);
    setBusy(true);
    setError(null);
    try {
      await data.leaveTrip(occupied.id, await getIdentity());
    } catch {
      // Leaving is the whole of the fix, so a failure here has to stop: going
      // on would hit the same refusal and read as the button doing nothing.
      setError("Couldn't leave your other trip. Check your connection.");
      setBusy(false);
      return;
    }
    await handleJoin(pending);
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
            onClick={() => router.push("/app")}
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
        onBack={() => router.push("/app")}
        onJoin={(input) => void handleJoin(input)}
        busy={busy}
        error={error ?? account.error}
        accountName={account.profile?.displayName ?? null}
        signInSlot={
          account.available && account.state === "signedOut" ? (
            <GoogleSignInButton onCredential={(idToken) => void account.signIn(idToken)} />
          ) : undefined
        }
      />
      {switching && (
        <SwitchTripSheet
          occupied={switching.occupied}
          joining={trip?.name ?? null}
          onConfirm={() => void handleSwitch()}
          onCancel={() => setSwitching(null)}
        />
      )}
    </PhoneFrame>
  );
}

/**
 * The one-trip-at-a-time confirm.
 *
 * Named rather than generic — "Leave Test Leg?" and not "Leave your other
 * trip?" — because the rider may not remember what they are still in, and the
 * whole reason the server sends the trip back is so this can say it.
 *
 * Leaving is the destructive half, so it is the *secondary* control here even
 * though it is the one that proceeds. Staying put is what a mis-scan at a
 * junction wants, and it is the safe default under a thumb.
 */
function SwitchTripSheet({
  occupied, joining, onConfirm, onCancel,
}: {
  occupied: OccupiedTrip;
  joining: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end">
      <button
        aria-label="Cancel"
        onClick={onCancel}
        className="absolute inset-0"
        style={{ background: C.scrim }}
      />
      <div
        className="relative rounded-t-[28px] px-6"
        style={{
          background: C.ground,
          borderTop: `1px solid ${C.line}`,
          paddingTop: 22,
          paddingBottom: "calc(var(--safe-b) + 16px)",
        }}
      >
        <h2
          style={{
            fontFamily: FONT.display, fontSize: 22, fontWeight: 500,
            letterSpacing: "-0.02em", color: C.text,
          }}
        >
          You&rsquo;re still in {occupied.name ?? "another trip"}
        </h2>
        <p
          style={{
            fontFamily: FONT.body, fontSize: 15, lineHeight: 1.55,
            color: C.muted, marginTop: 8,
          }}
        >
          You can only be in one trip at a time. Leaving means the others stop
          seeing where you are{joining === null ? "" : `, and you'll join ${joining} instead`}.
        </p>

        <div className="flex flex-col gap-3" style={{ marginTop: 22 }}>
          <PrimaryButton onClick={onCancel}>
            Stay in {occupied.name ?? "my trip"}
            <ArrowLeft size={20} />
          </PrimaryButton>
          <SecondaryButton onClick={onConfirm}>
            Leave and join
            <ArrowRight size={20} />
          </SecondaryButton>
        </div>
      </div>
    </div>
  );
}
