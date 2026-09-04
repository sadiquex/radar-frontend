"use client";

import { useEffect, useRef, useState } from "react";
import { data } from "@/lib/data";
import { estimateSpeedMps, shouldWritePosition, type LatLng } from "@/lib/geo";

export type GeoStatus = "idle" | "unsupported" | "prompting" | "granted" | "denied" | "error";

interface GeoState {
  status: GeoStatus;
  position: LatLng | null;
  error: string | null;
  /** Metres per second, for the caller and for the write cadence. */
  speedMps: number;
}

// Streams the current device position into the data layer for `participantId`,
// throttled by shouldWritePosition. Real browser geolocation — no backend needed.
export function useGeolocation({
  tripId,
  participantId,
  enabled,
}: {
  tripId: string | null;
  participantId: string;
  enabled: boolean;
}): GeoState {
  const [state, setState] = useState<GeoState>({
    status: "idle", position: null, error: null, speedMps: 0,
  });
  const lastWritten = useRef<LatLng | null>(null);
  const lastWriteAt = useRef<number>(0);
  const lastFix = useRef<{ pos: LatLng; at: number } | null>(null);

  useEffect(() => {
    if (!enabled || !tripId || !participantId) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState({ status: "unsupported", position: null, error: null, speedMps: 0 });
      return;
    }

    setState((s) => (s.status === "granted" ? s : { ...s, status: "prompting" }));

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const next: LatLng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const now = Date.now();

        // coords.speed is null on most desktops and unreliable on some Android
        // builds, so fall back to deriving it from the last two fixes.
        const reported = pos.coords.speed;
        const speedMps =
          reported != null && Number.isFinite(reported) && reported >= 0
            ? reported
            : lastFix.current
            ? estimateSpeedMps(lastFix.current.pos, next, now - lastFix.current.at)
            : 0;
        lastFix.current = { pos: next, at: now };

        setState({ status: "granted", position: next, error: null, speedMps });

        if (
          shouldWritePosition({
            prev: lastWritten.current,
            next,
            msSinceLastWrite: now - lastWriteAt.current,
            speedMps,
          })
        ) {
          data.updatePosition(tripId, participantId, next);
          lastWritten.current = next;
          lastWriteAt.current = now;
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setState({ status: "denied", position: null, error: "Location permission denied", speedMps: 0 });
        } else {
          setState({
            status: "error", position: null,
            error: err.message || "Location unavailable", speedMps: 0,
          });
        }
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 27_000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [enabled, tripId, participantId]);

  return state;
}
