"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { PhoneFrame } from "../components/PhoneFrame";
import { TabBar, type TabKey } from "../components/TabBar";
import { TabBarContext, type TabBarControl } from "../components/TabBarContext";
import { useAccount } from "../hooks/useAccount";
import { stampSignedIn } from "@/lib/accountFlag";

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
  if (pathname.startsWith("/repairs")) return "repairs";
  if (pathname.startsWith("/you")) return "you";
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
