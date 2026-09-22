import type { Metadata } from "next";
import { Hero } from "./components/landing/Hero";
import { VerdictDemo } from "./components/landing/VerdictDemo";
import { Statuses, Forgets, Accounts, HowItWorks, Craft, Close, SiteFooter } from "./components/landing/Sections";

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
  twitter: { card: "summary_large_image", title: "Radar", description: DESCRIPTION, images: ["/og.jpg"] },
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
        <VerdictDemo />
        <Statuses />
        <Forgets />
        <Accounts />
        <HowItWorks />
        <Craft />
        <Close />
      </main>
      <SiteFooter />
    </>
  );
}
