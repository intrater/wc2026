import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "World Cup 2026 Pool",
  description: "The annual World Cup fantasy pool — draft your tiers, chase the chaos.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <nav className="sticky top-0 z-10 border-b border-neutral-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-3 text-sm font-semibold">
            <Link href="/" className="text-[var(--color-pitch-dark)]">🏆 Pool</Link>
            <Link href="/matches" className="text-neutral-600 hover:text-neutral-900">Matches</Link>
            <Link href="/pick" className="text-neutral-600 hover:text-neutral-900">My Picks</Link>
            <Link href="/how-it-works" className="ml-auto text-neutral-600 hover:text-neutral-900">How it works</Link>
          </div>
        </nav>
        <main className="mx-auto w-full max-w-3xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
