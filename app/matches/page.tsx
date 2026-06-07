import Link from "next/link";
import { checkPoolAccess } from "@/lib/auth/poolAccess";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth/server";
import { loadTeamMap } from "@/lib/views/data";
import { groupByDay, todayBusinessDay } from "@/lib/matches/day";
import { DayNav } from "./DayNav";
import { MyTeamsFilter } from "./MyTeamsFilter";
import { MatchCard, type CalendarMatch, type ViewerPoints } from "./MatchCard";

export const dynamic = "force-dynamic";


/**
 * The match calendar (U5): every game, grouped by ET day. Default = today (or the
 * next day with matches). `?date=YYYY-MM-DD` selects a day, `?mine=1` filters to the
 * viewer's picked teams; the two params always preserve each other (see DayNav).
 */
export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; mine?: string }>;
}) {
  const access = await checkPoolAccess();
  if (access === "signin") redirect("/login");
  if (access === "no-entry") redirect("/not-entered");

  const params = await searchParams;
  const supabase = await createClient();
  const teamMap = await loadTeamMap();
  const user = await getUser();

  // Viewer's stake: picked teams + per-match score lines. Only a SUBMITTED entry
  // counts — a signed-in viewer with a draft entry is treated like signed-out.
  const myTeamIds = new Set<number>();
  const pointsByMatch = new Map<number, ViewerPoints[]>();
  let hasEntry = false;
  if (user) {
    const { data: entry } = await supabase
      .from("entries")
      .select("id, submitted_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (entry?.submitted_at) {
      hasEntry = true;
      const [{ data: picks }, { data: lines }] = await Promise.all([
        supabase.from("picks").select("team_id").eq("entry_id", entry.id),
        supabase
          .from("score_lines")
          .select("team_id, match_id, points, label")
          .eq("entry_id", entry.id)
          .not("match_id", "is", null), // group-placement bonuses have no match
      ]);
      for (const p of picks ?? []) myTeamIds.add(p.team_id);
      for (const l of lines ?? []) {
        const list = pointsByMatch.get(l.match_id!) ?? [];
        list.push({ teamId: l.team_id, points: Number(l.points), label: l.label });
        pointsByMatch.set(l.match_id!, list);
      }
    }
  }

  const { data: matches } = await supabase
    .from("matches")
    .select(
      "fixture_id, stage, group_label, kickoff, status, home_goals, away_goals, home_team_id, away_team_id, live_home_goals, live_away_goals, ht_home_goals, ht_away_goals, decided_by, updated_at",
    )
    .order("kickoff", { ascending: true });

  const rows: CalendarMatch[] = matches ?? [];
  if (rows.length === 0) {
    return (
      <div className="pt-10 text-center text-muted-foreground">
        <h1 className="mb-2 text-3xl font-extrabold text-foreground">Matches</h1>
        The schedule appears once fixtures sync. ⚽️
      </div>
    );
  }

  // ---------- day selection ----------
  // Fixtures without a kickoff datetime (TBD knockout slots before the schedule
  // publishes) can't live on a day — surface them in a "Date TBD" section instead
  // of silently vanishing (review finding).
  const unplaced = rows.filter((m) => !m.kickoff);
  const days = groupByDay(rows);
  const dayKeys = days.map((d) => d.day);
  const today = todayBusinessDay();
  const requested = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "") ? params.date! : null;

  const defaultDay =
    dayKeys.find((d) => d === today) ?? dayKeys.find((d) => d > today) ?? dayKeys[dayKeys.length - 1];
  const selectedDay = requested && dayKeys.includes(requested) ? requested : defaultDay;
  const dayIndex = dayKeys.indexOf(selectedDay);
  const dayMatches = days[dayIndex]?.matches ?? [];

  // ---------- my-teams filter ----------
  const mineOnly = params.mine === "1" && hasEntry;
  const involvesMine = (m: CalendarMatch) =>
    (m.home_team_id != null && myTeamIds.has(m.home_team_id)) ||
    (m.away_team_id != null && myTeamIds.has(m.away_team_id));
  const visible = mineOnly ? dayMatches.filter(involvesMine) : dayMatches;

  return (
    <div className="space-y-4">
      <header className="pt-2 text-center">
        <h1 className="text-3xl font-extrabold">Matches</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Live scores update every few minutes. Tap through the days to see the whole tournament.
        </p>
      </header>

      {!user && (
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/login" className="font-semibold text-neon hover:underline">
            Sign in
          </Link>{" "}
          to see which of your teams are playing.
        </p>
      )}

      <DayNav
        days={dayKeys}
        selected={selectedDay}
        today={today}
        defaultDay={defaultDay}
        mine={mineOnly}
      />

      {hasEntry && <MyTeamsFilter date={requested} active={mineOnly} />}

      {visible.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">
          {mineOnly ? "None of your teams play this day." : "No matches this day."}
        </p>
      ) : (
        <div className="space-y-2">
          {visible.map((m) => (
            <MatchCard
              key={m.fixture_id}
              match={m}
              teamMap={teamMap}
              myTeamIds={myTeamIds}
              viewerPoints={pointsByMatch.get(m.fixture_id) ?? []}
              showStake={hasEntry}
            />
          ))}
        </div>
      )}

      {unplaced.length > 0 && !mineOnly && (
        <section>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Date TBD
          </h2>
          <div className="space-y-2">
            {unplaced.map((m) => (
              <MatchCard
                key={m.fixture_id}
                match={m}
                teamMap={teamMap}
                myTeamIds={myTeamIds}
                viewerPoints={[]}
                showStake={hasEntry}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
