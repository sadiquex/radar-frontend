import { Hero } from "./components/landing/Hero";
import { VerdictDemo } from "./components/landing/VerdictDemo";

/**
 * The landing page.
 *
 * A server component that assembles the acts; only the pieces that animate are
 * client components. It inherits the root layout, so it gets the fonts, the
 * pre-paint theme bootstrap and the safe-area insets for free.
 */
export default function LandingPage() {
  return (
    <main>
      <Hero />
      <VerdictDemo />
    </main>
  );
}
