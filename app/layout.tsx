import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { BottomNav } from "@/components/BottomNav";
import { PullToRefresh } from "@/components/PullToRefresh";
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
        <PullToRefresh />
        {/* Colophon button — tablet/desktop only; a quiet </> circle that
            expands to its label on hover. Phones keep a clean viewport. */}
        <Link
          href="/how-its-built"
          aria-label="How it's built"
          className="group fixed right-4 top-4 z-20 hidden items-center rounded-full border border-white/15 bg-background/40 p-2 text-xs font-semibold text-muted-foreground shadow-2xl backdrop-blur-xl transition-colors hover:text-neon md:inline-flex"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4 shrink-0"
            aria-hidden
          >
            <path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />
          </svg>
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
