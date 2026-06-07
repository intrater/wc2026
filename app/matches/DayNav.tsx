import Link from "next/link";
import { formatBusinessDayLabel } from "@/lib/matches/day";
import { matchesHref } from "./href";

/**
 * Prev/next day navigation (U5). Links `replace` so the back button doesn't
 * accumulate day-steps; the `mine` filter is always preserved; "Today" omits
 * the date param entirely so the default takes over.
 */
export function DayNav({
  days,
  selected,
  today,
  defaultDay,
  mine,
}: {
  days: string[];
  selected: string;
  today: string;
  defaultDay: string;
  mine: boolean;
}) {
  const i = days.indexOf(selected);
  const prev = i > 0 ? days[i - 1] : null;
  const next = i >= 0 && i < days.length - 1 ? days[i + 1] : null;
  const isToday = selected === today;

  // Generous 48px tap target (iOS HIG min is 44px), large chevron, active feedback.
  const arrow =
    "flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-card text-2xl font-bold transition-colors hover:border-neon/50 hover:text-neon active:bg-accent/40";

  return (
    <nav className="flex items-center justify-between gap-2" aria-label="Match day">
      {prev ? (
        <Link replace href={matchesHref({ date: prev, mine })} className={arrow} aria-label="Previous day">
          ‹
        </Link>
      ) : (
        <span className={`${arrow} opacity-30`} aria-hidden>
          ‹
        </span>
      )}

      <div className="text-center">
        <div className="font-display text-lg font-extrabold">
          {formatBusinessDayLabel(selected)}
          {isToday && <span className="ml-2 rounded bg-neon/15 px-1.5 py-0.5 align-middle text-xs font-bold text-neon">Today</span>}
        </div>
        {selected !== defaultDay && (
          <Link replace href={matchesHref({ date: null, mine })} className="text-xs font-semibold text-neon hover:underline">
            {defaultDay === today ? "Jump to today" : "Jump to next match day"}
          </Link>
        )}
      </div>

      {next ? (
        <Link replace href={matchesHref({ date: next, mine })} className={arrow} aria-label="Next day">
          ›
        </Link>
      ) : (
        <span className={`${arrow} opacity-30`} aria-hidden>
          ›
        </span>
      )}
    </nav>
  );
}
