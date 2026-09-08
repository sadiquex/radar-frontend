"use client";

import { useRouter } from "next/navigation";
import { Home, Route, User } from "lucide-react";
import { C, FONT } from "./Radar";

export type TabKey = "home" | "trips" | "you";

const TABS: { key: TabKey; href: string; label: string; icon: typeof Home }[] = [
  { key: "home", href: "/", label: "Home", icon: Home },
  { key: "trips", href: "/trips", label: "Trips", icon: Route },
  { key: "you", href: "/you", label: "You", icon: User },
];

/**
 * The signed-in shell's navigation.
 *
 * Rendered only for a signed-in person, and never on `/t/[code]` — the group
 * view is a full-bleed instrument with its own bottom action bar, and a second
 * strip across the bottom of it would both crowd the controls and invite a
 * mis-tap onto a different screen mid-ride.
 *
 * Buttons rather than `<Link>`: these are app navigation between three client
 * routes, and the prefetch-on-viewport behaviour of a link is pointless for a
 * bar that is permanently in the viewport.
 */
export function TabBar({ active }: { active: TabKey }) {
  const router = useRouter();

  return (
    <nav
      className="gt-tabbar absolute left-0 right-0 bottom-0 z-30"
      aria-label="Sections"
      style={{
        background: C.ground,
        borderTop: `1px solid ${C.line}`,
        // The bar sits on the home indicator otherwise. Works only because
        // app/layout.tsx sets viewportFit: "cover".
        paddingBottom: "var(--safe-b)",
      }}
    >
      {TABS.map(({ key, href, label, icon: Icon }) => {
        const on = key === active;
        return (
          <button
            key={key}
            onClick={() => router.push(href)}
            aria-current={on ? "page" : undefined}
            className="flex-1 flex flex-col items-center justify-center gap-1"
            style={{
              // 52 plus the safe-area inset clears the 44px touch-target floor
              // with room for the label underneath.
              minHeight: 52,
              paddingTop: 8,
              paddingBottom: 8,
              color: on ? C.text : C.muted,
              fontFamily: FONT.body,
              fontSize: 12,
              fontWeight: on ? 600 : 400,
            }}
          >
            <Icon size={20} strokeWidth={on ? 2.2 : 1.8} />
            {label}
          </button>
        );
      })}
    </nav>
  );
}

/**
 * The height the tab bar occupies, for screens that scroll underneath it.
 *
 * A `flex-1` scroll container needs this as bottom padding or its last row
 * sits permanently behind the bar — the same class of problem as the
 * `min-h-0` rule every scroller in `Radar.tsx` carries.
 */
export const TAB_BAR_SPACE = "calc(var(--safe-b) + 68px)";
