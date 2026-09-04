import type { Metadata, Viewport } from "next";
import { Archivo, Signika, DM_Mono } from "next/font/google";
import { THEME_BOOTSTRAP } from "@/lib/theme";
import "./globals.css";

// Radar is an instrument you read at speed, so the type comes from transport
// signage rather than from web apps: high x-height, open apertures, and forms
// that stay distinct at an angle and in glare.
//
// Variables are named by ROLE, not by face. The previous --font-bricolage /
// --font-inter names became lies the moment the faces changed.

// Archivo — squarish, tightly fitted grotesque. Carries every headline and,
// now, every numeral: tabular figures give column alignment in any face, so
// the big numbers no longer need to sit in a code mono to line up.
const display = Archivo({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

// Signika — drawn specifically for signage and wayfinding, with weight
// adjustments that keep small text open. Reads at 13px in glare.
const body = Signika({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

// DM Mono — reserved for small uppercase tracked labels, where a readout voice
// earns its place. Not variable, and it stops at 500: nothing may ask it for a
// heavier weight or the browser synthesises a smeared faux-bold.
const mono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Radar",
  description:
    "Temporary location sharing for groups moving together. No accounts, no downloads.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // viewportFit "cover" is what makes env(safe-area-inset-*) non-zero, so the
  // header clears the notch and the action bar clears the home indicator.
  viewportFit: "cover",
  // Without this the soft keyboard overlays the viewport instead of resizing
  // it, and bottom-anchored CTAs on Create/Join get pushed out of reach.
  interactiveWidget: "resizes-content",
  // Deliberately no maximumScale / userScalable: pinch-zoom stays available.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5F3EE" },
    { media: "(prefers-color-scheme: dark)", color: "#0E1116" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Runs before first paint so the right theme is already on <html>.
            Without it, a dark-mode user sees a white flash on every load. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
