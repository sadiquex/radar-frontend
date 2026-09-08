"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { TripsScreen } from "../../components/Account";
import { useAccount, useOptimisticSignedIn } from "../../hooks/useAccount";
import { useHistory, useLiveTrips } from "../../hooks/useHistory";
import { liveOnly } from "@/lib/history";

/**
 * Every trip this account has been in.
 *
 * The live section and the history come from one request: `/v1/me/trips`
 * returns running trips tagged `kind: "live"` alongside the finished ones, so
 * the screen splits them rather than stitching two paginated sources together.
 * `useLiveTrips` is the fallback for the case where the running trips have
 * scrolled off the first page.
 */
export default function TripsPage() {
  const router = useRouter();
  const account = useAccount();
  const signedIn = useOptimisticSignedIn(account.state);

  const { trips, loading, hasMore, loadingMore, loadMore } = useHistory(signedIn);
  const { live } = useLiveTrips(signedIn);

  // Signed out there is no tab bar, so an empty history here would be a screen
  // with no way off it. Home is where sign-in lives.
  useEffect(() => {
    if (account.state === "signedOut") router.replace("/");
  }, [account.state, router]);

  // Prefer the page's own live rows; fall back to the dedicated endpoint so a
  // running trip never disappears just because it is old enough to be on
  // page two.
  const fromPage = liveOnly(trips);
  const running = fromPage.length > 0 ? fromPage : live;

  return (
    <TripsScreen
      trips={trips}
      live={running}
      loading={loading}
      hasMore={hasMore}
      loadingMore={loadingMore}
      now={Date.now()}
      onOpen={(tripId) => router.push(`/trips/${tripId}`)}
      onOpenLive={(shareCode) => router.push(`/t/${shareCode}`)}
      onLoadMore={() => void loadMore()}
    />
  );
}
