import Link from "next/link";
import { checkPoolAccess } from "@/lib/auth/poolAccess";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth/server";
import { loadTeamMap, type TeamInfo } from "@/lib/views/data";
import { groupByDay, todayBusinessDay } from "@/lib/matches/day";
import { DayMarker } from "./DayMarker";
import { NowLine } from "./NowLine";
import { ScrollToNow } from "./ScrollToNow";
import { AutoRefresh } from "@/components/AutoRefresh";
import { PageTitle, TitleAccent } from "@/components/PageTitle";
import { MatchCard, type CalendarMatch, type ViewerPoints } from "./MatchCard";

export const dynamic = "force-dynamic";

/** One day's worth of matches: the rail marker on the left, the card stack on the right.
 * The "now" line is dropped in just before `nowBeforeId` when that match lives here. */
function DayRow({
  day,
  matches,
  today,
  nowBeforeId,
  teamMap,
  myTeamIds,
  pointsByMatch,
  hasEntry,
}: {
  day: string;
  matches: CalendarMatch[];
  today: string;
  nowBeforeId: number | null;
  teamMap: Map<number, TeamInfo>;
  myTeamIds: Set<number>;
  pointsByMatch: Map<number, ViewerPoints[]>;
  hasEntry: boolean;
}) {
  return (
    <div className="flex gap-3">
      <DayMarker day={day} today={today} />
      <div className="min-w-0 flex-1 space-y-3 pb-2">
        {matches.map((m) => (
          <div key={m.fixture_id}>
            {m.fixture_id === nowBeforeId && <NowLine />}
            <MatchCard
              match={m}
              teamMap={teamMap}
              myTeamIds={myTeamIds}
              viewerPoints={pointsByMatch.get(m.fixture_id) ?? []}
              showStake={hasEntry}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The match calendar (U5): every game in one continuous, Google-Calendar-style scroll.
 * Days run top to bottom, each tagged by a left-rail marker; a "now" line marks the next
 * kickoff and the view auto-scrolls there on load. `?mine=1` filters to the viewer's
 * picked teams.
 */
export default async function MatchesPage() {
  const access = await checkPoolAccess();
  if (access === "signin") redirect("/login");
  if (access === "no-entry") redirect("/not-entered");

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
      "fixture_id, stage, group_label, kickoff, status, home_goals, away_goals, home_team_id, away_team_id, live_home_goals, live_away_goals, ht_home_goals, ht_away_goals, live_elapsed, decided_by, venue_name, venue_city, updated_at",
    )
    .order("kickoff", { ascending: true });

  const rows: CalendarMatch[] = matches ?? [];
  if (rows.length === 0) {
    return (
      <div className="space-y-3 pt-8 text-center text-muted-foreground">
        <PageTitle sub={<>The full schedule, day by day, with live scores as they play.</>}>
          <TitleAccent>Matches</TitleAccent>
        </PageTitle>
        <p>The schedule appears once fixtures sync. ⚽️</p>
      </div>
    );
  }

  const today = todayBusinessDay();

  // Fixtures without a kickoff datetime (TBD knockout slots before the schedule
  // publishes) can't live on a day — surface them in a "Date TBD" section instead
  // of silently vanishing.
  const unplaced = rows.filter((m) => !m.kickoff);
  const days = groupByDay(rows);

  // Before the bracket publishes, the schedule is group-stage only and nothing is TBD.
  // Show a closing note so the list ending at the last group day reads as expected, not
  // broken. It clears itself once any knockout fixture syncs in (dated or Date-TBD).
  const bracketPending =
    unplaced.length === 0 && !rows.some((m) => m.stage && m.stage !== "group");

  // ---------- "now" anchor ----------
  // The next match that hasn't kicked off yet; the now-line renders right before it and
  // the view auto-scrolls there. Matches are already chronological, so the first future
  // kickoff across all days is the boundary (live + finished matches sit above it).
  const nowMs = Date.now();
  let nowBeforeId: number | null = null;
  for (const d of days) {
    const next = d.matches.find((m) => m.kickoff && new Date(m.kickoff).getTime() > nowMs);
    if (next) {
      nowBeforeId = next.fixture_id;
      break;
    }
  }

  return (
    <div className="space-y-3">
      <ScrollToNow />
      {/* Live scores tick over without a manual reload (60s, paused when hidden). */}
      <AutoRefresh />

      <PageTitle sub={<>The full schedule, day by day, with live scores as they play.</>}>
        <TitleAccent>Matches</TitleAccent>
      </PageTitle>

      {!user && (
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/login" className="font-semibold text-neon hover:underline">
            Sign in
          </Link>{" "}
          to see which of your teams are playing.
        </p>
      )}

      {days.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">No matches scheduled yet.</p>
      ) : (
        <div className="space-y-5">
          {days.map((d) => (
            <DayRow
              key={d.day}
              day={d.day}
              matches={d.matches}
              today={today}
              nowBeforeId={nowBeforeId}
              teamMap={teamMap}
              myTeamIds={myTeamIds}
              pointsByMatch={pointsByMatch}
              hasEntry={hasEntry}
            />
          ))}
        </div>
      )}

      <div id="schedule-end" />

      {bracketPending && (
        <p className="px-4 pt-3 text-center text-sm text-muted-foreground">
          The Round of 32 and knockout fixtures will be published once the group stage is
          complete.
        </p>
      )}

      {unplaced.length > 0 && (
        <section className="pt-2">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Date TBD
          </h2>
          <div className="space-y-3">
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
