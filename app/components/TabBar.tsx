"use client";

import { useRouter } from "next/navigation";
import { Home, Route, User, Wrench } from "lucide-react";
import { C, FONT } from "./Radar";

export type TabKey = "home" | "trips" | "repairs" | "you";

const TABS: { key: TabKey; href: string; label: string; icon: typeof Home }[] = [
  { key: "home", href: "/", label: "Home", icon: Home },
  { key: "trips", href: "/trips", label: "Trips", icon: Route },
  // Sits before "You" rather than after it: the first three are things you do,
  // the last is who you are, and a settings tab in the middle of that reads as
  // a mis-tap waiting to happen.
  { key: "repairs", href: "/repairs", label: "Repairs", icon: Wrench },
  { key: "you", href: "/you", label: "You", icon: User },
];

/**
 * The signed-in shell's navigation.
 *
 * Rendered for a signed-in person across the whole shell, including the group
 * view — which is reached often enough mid-trip that losing every other
 * section behind a Back was the worse trade. It stands down for the two views
 * that own the whole viewport: the map and glance mode.
 *
 * `active` is null inside a trip: none of the four sections is where you are.
 *
 * Buttons rather than `<Link>`: these are app navigation between three client
 * routes, and the prefetch-on-viewport behaviour of a link is pointless for a
 * bar that is permanently in the viewport.
 */
export function TabBar({ active }: { active: TabKey | null }) {
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
