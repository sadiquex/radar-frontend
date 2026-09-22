import type { Metadata } from "next";
import { Hero } from "./components/landing/Hero";
import { VerdictDemo } from "./components/landing/VerdictDemo";
import {
  Statuses, Forgets, Accounts, HowItWorks, Craft, Close, SiteFooter, PhotoBand,
} from "./components/landing/Sections";

const DESCRIPTION =
  "Temporary location sharing for groups moving together. One sentence and one number instead of a map full of pins. Join from a link in seconds, no install, and every trip expires in 8 hours.";

export const metadata: Metadata = {
  title: "Radar — Know where everyone is. Without the calls.",
  description: DESCRIPTION,
  openGraph: {
    title: "Radar — Know where everyone is. Without the calls.",
    description: DESCRIPTION,
    type: "website",
    images: [{ url: "/og.jpg", width: 1920, height: 1080, alt: "Radar" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Radar — Know where everyone is. Without the calls.",
    description: DESCRIPTION,
    images: ["/og.jpg"],
  },
};

/**
 * The landing page.
 *
 * A server component that assembles the acts. Anything importing token values
 * from `Radar.tsx` (`C`, `FONT`, `STATUS`) inherits its client boundary, since
 * a server component cannot dot into plain exported values from a client-only
 * module — that is why `Sections.tsx` carries "use client" despite having no
 * animation or hooks of its own. It inherits the root layout, so it gets the
 * fonts, the pre-paint theme bootstrap and the safe-area insets for free.
 */
export default function LandingPage() {
  return (
    <>
      <main>
        <Hero />
        {/* The crossing. Riders strung out unevenly down an open road — the
            situation the verdict engine exists to read — placed exactly where
            the night hero gives way to daylight, fading out of one ground and
            into the other. */}
        <PhotoBand
          src="/band-road.jpg"
          topScope="gt-night"
          height="clamp(300px, 42vh, 520px)"
          focal="center 34%"
        />
        {/* Act II is pinned to the daylight palette via `.gt-day` (see
            globals.css) regardless of the visitor's OS theme or an explicit
            dark choice: the two-act crossing from the dark hero into
            daylight is the page's whole argument, and it must not disappear
            for a dark-mode visitor. */}
        <div className="gt-day">
          <VerdictDemo />
          <Statuses />
          <Forgets />
          <Accounts />
          <HowItWorks />
          <Craft />
          {/* Arrival, before the last call to action. The top edge fades into
              `sunken` because Craft sits on it; the bottom into `ground`,
              which is what Close sits on. */}
          <PhotoBand src="/band-arrival.jpg" topSurface="sunken" height="clamp(200px, 28vh, 340px)" />
          <Close />
        </div>
      </main>
      {/* Same pinning for the footer, which stays outside <main> so it keeps
          its contentinfo landmark. */}
      <div className="gt-day">
        <SiteFooter />
      </div>
    </>
  );
}
