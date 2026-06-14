"use client";

import { useEffect, useState } from "react";
import { formatKickoffTimeET } from "@/lib/matches/day";

/**
 * A kickoff (or update) time rendered in the visitor's own device timezone.
 *
 * The server can't know the device's timezone, so SSR — and the first client
 * render — show ET (the tournament's home zone), keeping hydration consistent.
 * After mount we swap to the device-local time. `withZone` appends the local zone
 * abbreviation (e.g. "3:00 PM PDT"), used where the time stands on its own.
 */
export function LocalTime({ iso, withZone = false }: { iso: string; withZone?: boolean }) {
  const [text, setText] = useState(() => formatKickoffTimeET(iso));

  useEffect(() => {
    setText(
      new Date(iso).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
        ...(withZone ? { timeZoneName: "short" } : null),
      }),
    );
  }, [iso, withZone]);

  return <span suppressHydrationWarning>{text}</span>;
}
