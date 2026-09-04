"use client";

import { C } from "./Radar";

/**
 * The app shell. Full screen on mobile — the tuned case — and a centred device
 * frame on desktop for development.
 *
 * Heights are 100dvh, never 100vh: on iOS Safari and Android Chrome the
 * dynamic toolbar makes 100vh taller than the visible viewport, which pushed
 * the Group screen's bottom action bar below the fold until you scrolled.
 */
export function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: C.ground, minHeight: "100dvh", position: "relative" }}>
      <div
        className="mx-auto md:my-8 relative overflow-hidden md:rounded-[36px] md:border"
        style={{
          maxWidth: 460,
          background: C.ground,
          color: C.text,
          borderColor: C.line,
        }}
      >
        {/* 100dvh on mobile (the tuned case); a fixed device height on desktop
            so the layout doesn't stretch to a tall monitor while developing. */}
        <div className="relative h-[100dvh] md:h-[calc(100dvh-4rem)] md:max-h-[880px]">
          {children}
        </div>
      </div>
    </div>
  );
}
