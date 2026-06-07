import Link from "next/link";

const DAY_LABEL = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "long",
  month: "long",
  day: "numeric",
});

function labelFor(day: string): string {
  // day is an ET calendar date; noon UTC is unambiguously that date in ET.
  return DAY_LABEL.format(new Date(`${day}T12:00:00-04:00`));
}

function hrefFor(day: string | null, mine: boolean): string {
  const q = new URLSearchParams();
  if (day) q.set("date", day);
  if (mine) q.set("mine", "1");
  const qs = q.toString();
  return qs ? `/matches?${qs}` : "/matches";
}

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

  const arrow = "flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card font-bold";

  return (
    <nav className="flex items-center justify-between gap-2" aria-label="Match day">
      {prev ? (
        <Link replace href={hrefFor(prev, mine)} className={arrow} aria-label="Previous day">
          ‹
        </Link>
      ) : (
        <span className={`${arrow} opacity-30`} aria-hidden>
          ‹
        </span>
      )}

      <div className="text-center">
        <div className="font-display text-lg font-extrabold">
          {labelFor(selected)}
          {isToday && <span className="ml-2 rounded bg-neon/15 px-1.5 py-0.5 align-middle text-xs font-bold text-neon">Today</span>}
        </div>
        {selected !== defaultDay && (
          <Link replace href={hrefFor(null, mine)} className="text-xs font-semibold text-neon hover:underline">
            {defaultDay === today ? "Jump to today" : "Jump to next match day"}
          </Link>
        )}
      </div>

      {next ? (
        <Link replace href={hrefFor(next, mine)} className={arrow} aria-label="Next day">
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
