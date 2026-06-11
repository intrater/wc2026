import Link from "next/link";
import { checkPoolAccess } from "@/lib/auth/poolAccess";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadTeamMap } from "@/lib/views/data";
import { TIER_LABELS } from "@/lib/tiers/labels";
import { getPhase } from "@/lib/state/phase";
import { businessDayOf, todayBusinessDay, cardStateFor, formatKickoffTimeET, isLive } from "@/lib/matches/day";
import type { TeamInfo } from "@/lib/views/data";
import { PageTitle } from "@/components/PageTitle";

export const dynamic = "force-dynamic";

export default async function EntryPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await checkPoolAccess();
  if (access === "signin") redirect("/login");
  if (access === "no-entry") redirect("/not-entered");

  const { id } = await params;
  const supabase = await createClient();
  const teamMap = await loadTeamMap();

  const { data: entry } = await supabase
    .from("entries")
    .select("id, display_name, paid")
    .eq("id", id)
    .maybeSingle();

  if (!entry) {
    return <div className="pt-10 text-center text-muted-foreground">Entry not found.</div>;
  }

  // picks are RLS-gated: visible to owner always, to everyone after lock
  const [{ data: picks }, { data: score }, { data: lines }] = await Promise.all([
    supabase.from("picks").select("tier_no, team_id").eq("entry_id", id).order("tier_no"),
    supabase.from("scores").select("total, group_stage_total").eq("entry_id", id).maybeSingle(),
    supabase.from("score_lines").select("team_id, points, label, category").eq("entry_id", id),
  ]);

  if (!picks || picks.length === 0) {
    return (
      <div className="space-y-3 pt-6 text-center">
        <PageTitle>{entry.display_name}</PageTitle>
        <div className="text-4xl">🔒</div>
        <p className="text-muted-foreground">This roster is hidden until the tournament kicks off.</p>
        <Link href="/" className="text-sm font-semibold text-neon hover:underline">Back to leaderboard</Link>
      </div>
    );
  }

  // group lines by team
  const linesByTeam = new Map<number, { points: number; label: string }[]>();
  const ptsByTeam = new Map<number, number>();
  for (const l of lines ?? []) {
    if (!linesByTeam.has(l.team_id)) linesByTeam.set(l.team_id, []);
    linesByTeam.get(l.team_id)!.push({ points: l.points, label: l.label });
    ptsByTeam.set(l.team_id, (ptsByTeam.get(l.team_id) ?? 0) + l.points);
  }

  return (
    <div className="space-y-5">
      <div className="text-center">
        <PageTitle sub={<>Every pick and every point, team by team.</>}>
          {entry.display_name}
        </PageTitle>
        {score && (
          <p className="mt-2 text-muted-foreground">
            <span className="text-3xl font-extrabold tabular-nums text-neon text-glow">{score.total}</span> pts
          </p>
        )}
      </div>

      <TodayAndNext teamIds={picks.map((p) => p.team_id)} teamMap={teamMap} />

      <div className="space-y-2">
        {picks.map((p) => {
          const team = teamMap.get(p.team_id);
          const teamLines = linesByTeam.get(p.team_id) ?? [];
          const total = ptsByTeam.get(p.team_id) ?? 0;
          return (
            <div key={p.tier_no} className="rounded-xl border border-border bg-card p-3 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{team?.flag}</span>
                <span className="flex-1">
                  <span className="block font-semibold">{team?.name}</span>
                  <span className="text-xs text-muted-foreground"><span className="font-mono text-neon">{String(p.tier_no).padStart(2, "0")}</span> · {TIER_LABELS[p.tier_no]}</span>
                </span>
                <span className="text-lg font-extrabold tabular-nums text-neon">{total}</span>
              </div>
              {teamLines.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 border-t border-border pt-1 text-xs text-muted-foreground">
                  {teamLines.map((l, i) => (
                    <span key={i}>+{l.points} {l.label}</span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const NEXT_DAY = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
});

/**
 * Which of this entry's teams play today, and the next upcoming fixture (U6) —
 * the "know who to root against" line. Hidden pre-lock (the tournament hasn't
 * started; an owner viewing their own roster pre-lock shouldn't see a stub).
 */
async function TodayAndNext({ teamIds, teamMap }: { teamIds: number[]; teamMap: Map<number, TeamInfo> }) {
  const phase = await getPhase();
  if (!phase.isLocked || teamIds.length === 0) return null;

  const supabase = await createClient();
  const idList = teamIds.join(",");
  const { data: matches } = await supabase
    .from("matches")
    .select(
      "fixture_id, kickoff, status, home_team_id, away_team_id, home_goals, away_goals, live_home_goals, live_away_goals, ht_home_goals, ht_away_goals, decided_by",
    )
    .or(`home_team_id.in.(${idList}),away_team_id.in.(${idList})`)
    .order("kickoff", { ascending: true });

  const rows = matches ?? [];
  const today = todayBusinessDay();
  const mine = new Set(teamIds);

  const todays = rows.filter((m) => m.kickoff && businessDayOf(m.kickoff) === today);
  const next = rows.find(
    (m) =>
      m.kickoff &&
      businessDayOf(m.kickoff) > today &&
      m.home_team_id != null &&
      m.away_team_id != null,
  );
  if (todays.length === 0 && !next) return null;

  const describe = (m: (typeof rows)[number]) => {
    const ours = [m.home_team_id, m.away_team_id].filter((id): id is number => id != null && mine.has(id));
    const opp = [m.home_team_id, m.away_team_id].find((id) => id != null && !mine.has(id!));
    const ourTeams = ours.map((id) => teamMap.get(id)).filter(Boolean) as TeamInfo[];
    const oppTeam = opp != null ? teamMap.get(opp) : undefined;
    const state = cardStateFor(m);
    const score =
      state.kind === "final"
        ? `${state.home}–${state.away} FT`
        : state.kind === "live" || state.kind === "halftime"
          ? `LIVE ${state.home}–${state.away}`
          : m.kickoff
            ? formatKickoffTimeET(m.kickoff)
            : "TBD";
    const us = ourTeams.map((t) => `${t.flag} ${t.name}`).join(" & ");
    return ours.length === 2
      ? `${us} — ${score}`
      : `${us} ${oppTeam ? `vs ${oppTeam.flag} ${oppTeam.name}` : ""} · ${score}`;
  };

  return (
    <div className="rounded-xl border border-border bg-card p-3 text-sm shadow-sm">
      {todays.length > 0 && (
        <div>
          <span className={`font-bold ${todays.some((m) => isLive(m.status)) ? "text-neon" : "text-muted-foreground"}`}>
            Today:
          </span>{" "}
          {todays.map((m) => describe(m)).join("  ·  ")}
        </div>
      )}
      {next?.kickoff && (
        <div className={todays.length > 0 ? "mt-1" : ""}>
          <span className="font-bold text-muted-foreground">Next:</span> {describe(next)}{" "}
          <span className="text-muted-foreground">({NEXT_DAY.format(new Date(next.kickoff))})</span>
        </div>
      )}
    </div>
  );
}
