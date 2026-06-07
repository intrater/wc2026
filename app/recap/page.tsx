import { createClient } from "@/lib/supabase/server";
import { checkPoolAccess } from "@/lib/auth/poolAccess";
import { redirect } from "next/navigation";
import type { Recap, RecapStats } from "@/lib/db/types";
import { formatBusinessDayLabel } from "@/lib/matches/day";

export const dynamic = "force-dynamic";

/**
 * Daily recap feed (U8). Newest first; the most recent day is expanded, prior days
 * collapse behind <details> (no client JS). Recaps are immutable once published —
 * see plan Scope Boundaries. Email delivery is U9 (deferred).
 */
export default async function RecapPage() {
  const access = await checkPoolAccess();
  if (access === "signin") redirect("/login");
  if (access === "no-entry") redirect("/not-entered");

  const supabase = await createClient();
  const { data } = await supabase
    .from("recaps")
    .select("business_day, stats, narrative, created_at")
    .order("business_day", { ascending: false });

  const recaps = (data ?? []) as Array<Pick<Recap, "business_day" | "stats" | "narrative" | "created_at">>;

  return (
    <div className="space-y-5">
      <header className="pt-2 text-center">
        <h1 className="text-3xl font-extrabold">
          Daily <span className="text-neon text-glow">Recap</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          What happened, who moved, and who's talking trash tomorrow.
        </p>
      </header>

      {recaps.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">
          The first recap drops after the first match day ends. ⚽️
        </p>
      ) : (
        <div className="space-y-3">
          {recaps.map((r, i) => (
            <RecapCard key={r.business_day} recap={r} expanded={i === 0} />
          ))}
        </div>
      )}
    </div>
  );
}

function hookFor(stats: RecapStats): string {
  if (stats.upsets.length > 0) {
    const u = stats.upsets[0];
    return `${u.teamName} shocker (+${u.points})`;
  }
  if (stats.topGainer) return `${stats.topGainer} had a day`;
  if (stats.topThree.length > 0) return `${stats.topThree[0]} leads the pool`;
  return "Full results inside";
}

function RecapCard({
  recap,
  expanded,
}: {
  recap: Pick<Recap, "business_day" | "stats" | "narrative">;
  expanded: boolean;
}) {
  const stats = recap.stats;
  const label = formatBusinessDayLabel(recap.business_day);

  return (
    <details
      open={expanded}
      className="group overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
    >
      <summary className="flex cursor-pointer list-none items-baseline justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="font-display text-lg font-extrabold">Day {stats.dayNumber}</span>
          <span className="ml-2 text-xs text-muted-foreground">{label}</span>
        </span>
        <span className="text-right text-xs font-semibold text-neon">{hookFor(stats)}</span>
      </summary>

      <div className="space-y-4 border-t border-border px-4 py-4">
        {recap.narrative ? (
          <p className="whitespace-pre-line text-sm leading-relaxed">{recap.narrative}</p>
        ) : (
          <p className="text-sm italic text-muted-foreground">
            The robot pundit is speechless tonight — here's the box score:
          </p>
        )}

        <StatsDigest stats={stats} />
      </div>
    </details>
  );
}

/** Deterministic digest under the narrative — the numbers, always trustworthy. */
function StatsDigest({ stats }: { stats: RecapStats }) {
  const movers = stats.entries
    .filter((e) => e.pointsToday != null && e.pointsToday > 0)
    .slice(0, 5);

  return (
    <div className="space-y-3 text-sm">
      <section>
        <h3 className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
          Results
        </h3>
        <ul className="space-y-0.5">
          {stats.results.map((r) => (
            <li key={r.fixtureId} className="tabular-nums">
              {r.postponed ? (
                <span className="text-muted-foreground">
                  {r.home?.flag} {r.home?.name} vs {r.away?.flag} {r.away?.name} — postponed
                </span>
              ) : (
                <>
                  {r.home?.flag} {r.home?.name}{" "}
                  <span className="font-extrabold">
                    {r.home?.goals}–{r.away?.goals}
                  </span>{" "}
                  {r.away?.name} {r.away?.flag}
                  {r.decidedBy === "penalties" && (
                    <span className="ml-1 text-xs text-muted-foreground">(pens)</span>
                  )}
                  {r.decidedBy === "extra_time" && (
                    <span className="ml-1 text-xs text-muted-foreground">(aet)</span>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      </section>

      {movers.length > 0 && (
        <section>
          <h3 className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Movers
          </h3>
          <ul className="space-y-0.5">
            {movers.map((e) => (
              <li key={e.entryId} className="flex justify-between tabular-nums">
                <span className="font-semibold">{e.displayName}</span>
                <span>
                  <span className="font-extrabold text-neon">+{e.pointsToday}</span>
                  {e.rankDelta != null && e.rankDelta !== 0 && (
                    <span
                      className={`ml-2 text-xs font-bold ${e.rankDelta > 0 ? "text-neon" : "text-destructive"}`}
                    >
                      {e.rankDelta > 0 ? `▲${e.rankDelta}` : `▼${Math.abs(e.rankDelta)}`}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {stats.upsets.length > 0 && (
        <section>
          <h3 className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Upsets
          </h3>
          <ul className="space-y-0.5">
            {stats.upsets.map((u, i) => (
              <li key={i}>
                <span className="font-semibold">{u.teamName}</span>{" "}
                <span className="text-muted-foreground">{u.label}</span>{" "}
                <span className="font-extrabold text-neon">+{u.points}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {stats.topThree.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Top of the pool: {stats.topThree.map((n, i) => `${i + 1}. ${n}`).join("  ·  ")}
        </p>
      )}
    </div>
  );
}
