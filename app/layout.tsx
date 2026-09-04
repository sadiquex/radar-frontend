import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter, JetBrains_Mono } from "next/font/google";
import { THEME_BOOTSTRAP } from "@/lib/theme";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
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
      className={`${bricolage.variable} ${inter.variable} ${jetbrains.variable}`}
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
