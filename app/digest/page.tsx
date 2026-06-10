import { createClient } from "@/lib/supabase/server";
import { checkPoolAccess } from "@/lib/auth/poolAccess";
import { getUserAndProfile } from "@/lib/auth/server";
import { getPhase } from "@/lib/state/phase";
import { redirect } from "next/navigation";
import type { Recap, RecapStats } from "@/lib/db/types";
import { formatBusinessDayLabel, todayBusinessDay } from "@/lib/matches/day";
import { buildDocket, type DocketItem, type DocketMatchRow } from "@/lib/digest/docket";
import { hookFor } from "@/lib/digest/email";
import { loadTeamMap } from "@/lib/views/data";
import { DigestToggle } from "./DigestToggle";

export const dynamic = "force-dynamic";

/**
 * Morning digest: today's docket up top, then the rolling daily feed (newest
 * first; the most recent day expanded, prior days collapse behind <details>,
 * no client JS). Day summaries are immutable once published. Subscribers can
 * opt in to the ~7am ET email here (lib/digest/send.ts).
 */
export default async function DigestPage() {
  const access = await checkPoolAccess();
  if (access === "signin") redirect("/login");
  if (access === "no-entry") redirect("/not-entered");

  const supabase = await createClient();
  const today = todayBusinessDay();
  const phase = await getPhase();
  const [{ data }, { data: matchRows }, teamMap, ctx] = await Promise.all([
    supabase
      .from("recaps")
      .select("business_day, stats, narrative, created_at")
      .order("business_day", { ascending: false }),
    supabase
      .from("matches")
      .select(
        "fixture_id, stage, group_label, kickoff, status, home_team_id, away_team_id, live_home_goals, live_away_goals",
      )
      .not("kickoff", "is", null),
    loadTeamMap(),
    getUserAndProfile(),
  ]);

  const recaps = (data ?? []) as Array<Pick<Recap, "business_day" | "stats" | "narrative" | "created_at">>;
  const docket = buildDocket((matchRows ?? []) as DocketMatchRow[], teamMap, today);

  return (
    <div className="space-y-5">
      <header className="text-center">
        <h1 className="font-display text-4xl font-extrabold">
          Morning <span className="text-neon text-glow">Digest</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          What happened, who moved, and what&apos;s on today&apos;s docket.
        </p>
      </header>

      {ctx?.profile && <DigestToggle initial={ctx.profile.digest_opt_in} />}

      <TodayCard docket={docket} today={today} preTournament={!phase.isLocked} />

      {recaps.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">
          The first digest drops after the first match day ends. ⚽️
        </p>
      ) : (
        <div className="space-y-3">
          {recaps.map((r, i) => (
            <DigestCard key={r.business_day} recap={r} expanded={i === 0} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Today's slate — always live-computed, never stored with a day's digest. */
function TodayCard({
  docket,
  today,
  preTournament,
}: {
  docket: DocketItem[];
  today: string;
  preTournament: boolean;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card px-4 py-3 shadow-xl">
      <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
        Today · {formatBusinessDayLabel(today)}
      </h2>
      {docket.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {preTournament
            ? "No games yet. Check back once the tournament kicks off. ⚽️"
            : "No matches today. Rest day. 😴"}
        </p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {docket.map((m) => (
            <li key={m.fixtureId} className="flex items-baseline justify-between gap-3 tabular-nums">
              <span>
                <span className="font-semibold">
                  {m.home ? `${m.home.flag} ${m.home.name}` : "TBD"}
                  {" vs "}
                  {m.away ? `${m.away.name} ${m.away.flag}` : "TBD"}
                </span>
                <span className="ml-2 text-xs text-muted-foreground">{m.contextLabel}</span>
              </span>
              {m.live ? (
                <span className="shrink-0 rounded bg-neon/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-neon">
                  ● {m.live.home}–{m.live.away}
                </span>
              ) : (
                <span className="shrink-0 text-xs text-muted-foreground">{m.kickoffET} ET</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DigestCard({
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
            The robot pundit is speechless tonight. Here&apos;s the box score:
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
