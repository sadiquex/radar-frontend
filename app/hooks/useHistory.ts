"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { history, signInAvailable } from "@/lib/data";
import type { LiveTripEntry, TripEntry } from "@/lib/data/history";

/**
 * This account's trips.
 *
 * Mirrors `useAccount`: loads on mount, never throws, and settles to empty
 * when there is no account or no API. Every screen that uses it renders
 * correctly against an empty list, so a failed load degrades to the same
 * empty state a new account sees rather than to an error.
 */
export function useHistory(enabled: boolean) {
  const [trips, setTrips] = useState<TripEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled && signInAvailable);
  const [loadingMore, setLoadingMore] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    if (!enabled || !signInAvailable) {
      setTrips([]);
      setCursor(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const page = await history.list();
    if (!alive.current) return;
    setTrips(page.trips);
    setCursor(page.nextCursor);
    setLoading(false);
  }, [enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const loadMore = useCallback(async () => {
    if (cursor === null || loadingMore) return;
    setLoadingMore(true);
    const page = await history.list(cursor);
    if (!alive.current) return;
    // Appended rather than merged: the cursor guarantees each trip is visited
    // exactly once, so a de-duplicating merge would only mask a bug in it.
    setTrips((current) => [...current, ...page.trips]);
    setCursor(page.nextCursor);
    setLoadingMore(false);
  }, [cursor, loadingMore]);

  /**
   * Removes a trip locally first, then asks the server.
   *
   * The list is already on screen and the person just tapped delete; waiting a
   * round trip to reflect it reads as a dead button. On failure the row comes
   * back, which is the honest outcome and rare enough to be worth the flicker.
   */
  const forget = useCallback(async (tripId: string) => {
    const previous = trips;
    setTrips((current) => current.filter((t) => t.tripId !== tripId));
    try {
      await history.forget(tripId);
    } catch {
      if (alive.current) setTrips(previous);
      throw new Error("Couldn't remove that trip. Try again.");
    }
  }, [trips]);

  const forgetAll = useCallback(async () => {
    const previous = trips;
    setTrips([]);
    setCursor(null);
    try {
      await history.forgetAll();
    } catch {
      if (alive.current) setTrips(previous);
      throw new Error("Couldn't clear your history. Try again.");
    }
  }, [trips]);

  return { trips, loading, loadingMore, hasMore: cursor !== null, reload, loadMore, forget, forgetAll };
}

/**
 * The trips running right now.
 *
 * Separate from the paginated history because Home wants only these and must
 * not pay for a page of finished ones to find them. Refreshed on an interval
 * so a trip that ends elsewhere stops being offered as resumable.
 */
export function useLiveTrips(enabled: boolean) {
  const [live, setLive] = useState<LiveTripEntry[]>([]);
  const [loading, setLoading] = useState(enabled && signInAvailable);

  useEffect(() => {
    if (!enabled || !signInAvailable) {
      setLive([]);
      setLoading(false);
      return;
    }
    let cancelled = false;

    const refresh = async () => {
      const found = await history.live();
      if (cancelled) return;
      setLive(found);
      setLoading(false);
    };

    void refresh();
    // Polled, not subscribed: the live socket is per-trip and joining one for
    // every trip on a dashboard would be a connection each to answer a
    // question that changes every few hours.
    const timer = setInterval(() => void refresh(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled]);

  return { live, loading };
}
