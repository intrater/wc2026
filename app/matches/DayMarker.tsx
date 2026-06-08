import { formatDayParts } from "@/lib/matches/day";

/**
 * Left-rail day marker for the continuous schedule view (U5): weekday abbreviation
 * over a circled date number, à la Google Calendar's schedule view. Today reads as a
 * filled neon disc; past days dim; future days get a hairline ring. Sticky so the
 * marker pins to the top of its day while a long match list scrolls past.
 */
export function DayMarker({ day, today }: { day: string; today: string }) {
  const { weekday, dayNum, month } = formatDayParts(day);
  const isToday = day === today;
  const isPast = day < today;

  const dateColor = isToday ? "text-neon" : isPast ? "text-muted-foreground" : "text-foreground";

  return (
    <div className="sticky top-4 flex w-9 shrink-0 flex-col items-start gap-0.5 self-start">
      <span
        className={`text-[11px] font-bold uppercase tracking-wide ${isToday ? "text-neon" : "text-muted-foreground"}`}
      >
        {weekday}
      </span>
      <span className={`text-2xl font-extrabold tabular-nums ${dateColor}`}>{dayNum}</span>
      {/* First day of a month earns a tiny month tag so long scrolls stay oriented. */}
      {dayNum === "1" && (
        <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{month}</span>
      )}
    </div>
  );
}
