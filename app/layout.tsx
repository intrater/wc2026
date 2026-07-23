import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BottomNav } from "@/components/BottomNav";
import { isArchive } from "@/lib/archive";
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
// No themeColor: a static color can't match the drifting mesh gradient, so iOS
// painted a visibly darker strip behind the status bar. Without it, Safari
// samples the live page edge and the status bar blends with the gradient.
export const viewport: Viewport = {
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={cn("dark font-sans", geist.variable, tourney.variable)}>
      <body className="min-h-screen antialiased">
        {isArchive && (
          <p className="border-b border-border bg-card/80 px-4 py-1.5 text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Final standings · archived
          </p>
        )}
        {/* pb-28 keeps content clear of the fixed bottom tab bar */}
        <main className="mx-auto w-full max-w-3xl px-4 py-6 pb-28">{children}</main>
        <BottomNav />
      </body>
    </html>
  );
}
