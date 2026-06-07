import Link from "next/link";
import { matchesHref } from "./href";

/**
 * "My teams only" toggle (U5). Rendered only for viewers with a submitted entry.
 * A plain Link toggle — preserves the selected ?date when flipping, replaces
 * history so Back doesn't step through filter states.
 */
export function MyTeamsFilter({ date, active }: { date: string | null; active: boolean }) {
  const href = matchesHref({ date, mine: !active });

  return (
    <div className="flex justify-center">
      <Link
        replace
        href={href}
        className={`rounded-full border px-3 py-1 text-xs font-bold transition-colors ${
          active
            ? "border-neon/60 bg-neon/15 text-neon"
            : "border-border bg-card text-muted-foreground hover:text-foreground"
        }`}
      >
        ⭐ My teams only{active ? " ✓" : ""}
      </Link>
    </div>
  );
}
