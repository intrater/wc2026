import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { BottomNav } from "@/components/BottomNav";
import { Geist, Tourney } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});
const tourney = Tourney({subsets:['latin'],variable:'--font-tourney'});

export const metadata: Metadata = {
  title: "World Cup 2026 Pool",
  description: "The annual World Cup fantasy pool — draft your tiers, chase the chaos.",
};

// viewportFit: "cover" lets the bottom tab bar pad itself around the iPhone
// home indicator via env(safe-area-inset-bottom).
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#2d2a72",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={cn("dark font-sans", geist.variable, tourney.variable)}>
      <body className="min-h-screen antialiased">
        {/* Colophon button — a quiet 🤔 circle in the top-right that scrolls
            away with the page; expands to its label on hover (desktop). */}
        <Link
          href="/how-its-built"
          aria-label="How it's built"
          className="group absolute right-4 top-4 z-20 inline-flex items-center rounded-full border border-white/15 bg-background/40 px-2 py-1 text-xs font-semibold text-muted-foreground shadow-2xl backdrop-blur-xl transition-colors hover:text-neon"
        >
          <span className="text-base leading-none" aria-hidden>
            🤔
          </span>
          <span className="max-w-0 overflow-hidden whitespace-nowrap transition-[max-width,padding] duration-300 group-hover:max-w-36 group-hover:pl-2">
            How it&apos;s built
          </span>
        </Link>
        {/* pb-28 keeps content clear of the fixed bottom tab bar */}
        <main className="mx-auto w-full max-w-3xl px-4 py-6 pb-28">{children}</main>
        <BottomNav />
      </body>
    </html>
  );
}
