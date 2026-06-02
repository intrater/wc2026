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
  if (now == null) return <span className={className}>⏳ Picks lock soon…</span>;
  if (now >= target) return <span className={className}>🔒 Picks are locked</span>;

  return <span className={className}>⏳ Picks lock in {remaining(target - now)}</span>;
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
