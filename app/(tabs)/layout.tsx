"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { PhoneFrame } from "../components/PhoneFrame";
import { TabBar, type TabKey } from "../components/TabBar";
import { TabBarContext, type TabBarControl } from "../components/TabBarContext";
import { useAccount, useOptimisticSignedIn } from "../hooks/useAccount";

/**
 * The signed-in shell.
 *
 * A route group rather than three independent pages, so `PhoneFrame` is
 * mounted once and switching tabs does not tear down and rebuild the frame.
 *
 * `/t/[code]`, `/join` and `/trips/[tripId]` are deliberately outside it: the
 * group view is a full-bleed instrument with its own bottom action bar, and
 * the trip detail is a leaf with its own Back.
 */

const TAB_FOR_PATH = (pathname: string): TabKey => {
  if (pathname.startsWith("/trips")) return "trips";
  if (pathname.startsWith("/you")) return "you";
  return "home";
};

export default function TabsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const account = useAccount();
  const [hidden, setHidden] = useState(false);

  // Optimistic, from a cached flag, so the bar is the right shape on the very
  // first paint. Waiting for /v1/auth/me makes every cold load shift the page
  // up under whoever is reading it.
  const signedIn = useOptimisticSignedIn(account.state);

  const control = useMemo<TabBarControl>(() => ({ setHidden }), []);
  const show = signedIn && account.available && !hidden;

  return (
    <TabBarContext.Provider value={control}>
      <PhoneFrame>
        {children}
        {show && <TabBar active={TAB_FOR_PATH(pathname)} />}
      </PhoneFrame>
    </TabBarContext.Provider>
  );
}
