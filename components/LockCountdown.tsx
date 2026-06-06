"use client";

import { useEffect, useState } from "react";

/**
 * Live countdown to the pick lock. Renders "Picks lock in 9d 4h 12m" before the
 * deadline and "Picks are locked" after. `lockAt` is an ISO string (or null = not set).
 *
 * Renders a stable placeholder until mounted so the timezone-dependent label can't
 * cause a server/client hydration mismatch (server runs in UTC, client in local time).
 */
export function LockCountdown({ lockAt, className = "" }: { lockAt: string | null; className?: string }) {
  const target = lockAt ? new Date(lockAt).getTime() : null;
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!target) return null;
  if (now == null) return <Label className={className}>Picks lock soon…</Label>;
  if (now >= target) return <Label className={className}>Picks are locked</Label>;

  return <Label className={className}>Picks lock in {remaining(target - now)}</Label>;
}

function Label({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <LockIcon />
      <span>{children}</span>
    </span>
  );
}

/** Padlock glyph, sized to ride alongside the countdown text. */
function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0"
      aria-hidden="true"
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function remaining(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d}d ${h}h ${m}m ${s}s`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
