import type { Metadata } from "next";
import "./globals.css";
import { NavBar } from "@/components/NavBar";

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
        <NavBar />
        <main className="mx-auto w-full max-w-3xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
