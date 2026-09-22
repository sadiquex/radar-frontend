"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { PhoneFrame } from "../../components/PhoneFrame";
import { TabBar, type TabKey } from "../../components/TabBar";
import { TabBarContext, type TabBarControl } from "../../components/TabBarContext";
import { useAccount } from "../../hooks/useAccount";
import { stampSignedIn } from "@/lib/accountFlag";

/**
 * The signed-in shell.
 *
 * A route group rather than three independent pages, so `PhoneFrame` is
 * mounted once and switching tabs does not tear down and rebuild the frame.
 *
 * `/app/t/[code]` lives inside this group too, so the shell — frame and tab bar —
 * stays mounted while you're in a trip; the page itself stands the bar down
 * for the map and for glance mode, the two views that own the whole viewport.
 * `/join` and `/app/trips/[tripId]` remain outside it: a join-by-code form and
 * a past-trip leaf, neither of which is one of the four sections.
 */

const TAB_FOR_PATH = (pathname: string): TabKey | null => {
  // A trip is not one of the four sections. Highlighting Home while you are
  // looking at a trip would claim you are somewhere you are not.
  if (pathname.startsWith("/app/t/")) return null;
  if (pathname.startsWith("/app/trips")) return "trips";
  if (pathname.startsWith("/app/repairs")) return "repairs";
  if (pathname.startsWith("/app/you")) return "you";
  return "home";
};

export default function TabsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const account = useAccount();
  const [hidden, setHidden] = useState(false);

  // The bar's *visibility* is CSS, decided pre-paint from a cached flag on
  // <html>; this only corrects that flag once /v1/auth/me has actually
  // answered. Branching the markup on it instead would mean the server renders
  // no <nav> and the client renders one — a hydration mismatch on every load,
  // which React resolves by throwing the whole server document away.
  useEffect(() => {
    if (account.state === "loading") return;
    stampSignedIn(account.state === "signedIn" && account.available);
  }, [account.state, account.available]);

  const control = useMemo<TabBarControl>(() => ({ setHidden }), []);

  return (
    <TabBarContext.Provider value={control}>
      <PhoneFrame>
        {children}
        {/* `hidden` is false on the first render on both sides, so this stays
            in step with the server; it only ever flips in response to a step
            change the user made. */}
        {!hidden && <TabBar active={TAB_FOR_PATH(pathname)} />}
      </PhoneFrame>
    </TabBarContext.Provider>
  );
}
