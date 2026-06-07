import Link from "next/link";
import { matchesHref } from "./href";

/**
 * Segmented filter for the calendar (U5): All games ↔ My teams. Rendered only for
 * viewers with a submitted entry. Plain Links — preserve the selected ?date when
 * switching, replace history so Back doesn't step through filter states.
 */
export function MyTeamsFilter({ date, active }: { date: string | null; active: boolean }) {
  const cell = "flex-1 rounded-lg px-3 py-1.5 text-center text-sm font-bold transition-colors";
  const on = "bg-neon/15 text-neon";
  const off = "text-muted-foreground hover:text-foreground";

  return (
    <div className="mx-auto flex max-w-xs gap-1 rounded-xl border border-border bg-card p-1">
      <Link replace href={matchesHref({ date, mine: false })} className={`${cell} ${active ? off : on}`}>
        All games
      </Link>
      <Link replace href={matchesHref({ date, mine: true })} className={`${cell} ${active ? on : off}`}>
        ⭐ My teams
      </Link>
    </div>
  );
}
