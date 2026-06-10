import type { ReactNode } from "react";

/** The neon accent word inside a PageTitle (by convention, the last word). */
export function TitleAccent({ children }: { children: ReactNode }) {
  return <span className="text-neon text-glow">{children}</span>;
}

/**
 * The one page heading: identical size, case, and placement on every page so
 * the tabs feel like one app. Wrap the accent word in <TitleAccent>.
 */
export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <header className="pt-2 text-center">
      <h1 className="font-display text-4xl font-extrabold uppercase leading-[0.95] sm:text-5xl">
        {children}
      </h1>
      {sub && <p className="mt-2 text-sm text-muted-foreground">{sub}</p>}
    </header>
  );
}
