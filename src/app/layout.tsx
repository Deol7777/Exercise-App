import type { Metadata, Viewport } from "next";
import { Figtree, Geist_Mono, Work_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

/**
 * Two faces, one job each (see references/). Figtree at 700–900 is the display
 * voice: headlines, exercise names, every statistic. Work Sans is everything a
 * person reads as a sentence. Mixing them up is the fastest way to lose the
 * look.
 */
const display = Figtree({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
});

const body = Work_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Exercise App",
  description: "A workout logger: record a training session set by set, then read it back as progress.",
};

/**
 * Designed for the phone first. `viewportFit: "cover"` is what lets the tab bar
 * paint into the home-indicator area instead of leaving a white strip under it.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F7F1F1",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
