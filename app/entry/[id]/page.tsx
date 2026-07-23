import Link from "next/link";
import { checkPoolAccess } from "@/lib/auth/poolAccess";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadTeamMap } from "@/lib/views/data";
import { TIER_LABELS } from "@/lib/tiers/labels";
import { getPhase } from "@/lib/state/phase";
import type { ReactNode } from "react";
import { businessDayOf, todayBusinessDay, cardStateFor, isLive, isTerminal } from "@/lib/matches/day";
import { summarizeTeamMatches, type TeamMatchRow, type TeamMatchSummary } from "@/lib/matches/teamSummary";
import type { TeamInfo } from "@/lib/views/data";
import { PageTitle } from "@/components/PageTitle";
import { LocalTime } from "@/components/LocalTime";
import { BUCKET_LABEL } from "@/lib/outlook/rationale";
import { isArchive } from "@/lib/archive";

export const dynamic = "force-dynamic";

// Row shape loaded once for the whole entry page: the summary fields plus the extra
// goal columns cardStateFor() needs for the Today/Next banner.
type EntryMatchRow = TeamMatchRow & {
  fixture_id: number;
  ht_home_goals: number | null;
  ht_away_goals: number | null;
};

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
  const [{ data: picks }, { data: score }, { data: lines }, { data: outlook }] = await Promise.all([
    supabase.from("picks").select("tier_no, team_id").eq("entry_id", id).order("tier_no"),
    supabase.from("scores").select("total, group_stage_total").eq("entry_id", id).maybeSingle(),
    supabase.from("score_lines").select("team_id, match_id, points, label, category").eq("entry_id", id),
    supabase.from("entry_outlook").select("bucket, clinched, win_share, rationale").eq("entry_id", id).maybeSingle(),
  ]);

  if (!picks || picks.length === 0) {
    return (
      <div className="space-y-3 pt-6 text-center">
        <PageTitle>{entry.display_name}</PageTitle>
        <p className="text-muted-foreground">This roster is hidden until the tournament kicks off.</p>
        <Link href="/" className="text-sm font-semibold text-neon hover:underline">Back to leaderboard</Link>
      </div>
    );
  }

  // group lines by team
  const linesByTeam = new Map<number, { matchId: number | null; points: number; label: string }[]>();
  const ptsByTeam = new Map<number, number>();
  for (const l of lines ?? []) {
    if (!linesByTeam.has(l.team_id)) linesByTeam.set(l.team_id, []);
    linesByTeam.get(l.team_id)!.push({ matchId: l.match_id, points: l.points, label: l.label });
    ptsByTeam.set(l.team_id, (ptsByTeam.get(l.team_id) ?? 0) + l.points);
  }
  // Independently re-add the per-team totals shown below, so the page can prove the
  // breakdown reconciles to the stored total (and therefore to the leaderboard).
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const grandTotal = r2(picks.reduce((s, p) => s + (ptsByTeam.get(p.team_id) ?? 0), 0));
  const reconciles = score != null && grandTotal === r2(score.total);

  // Once locked, load every fixture involving a picked team — once for the whole page,
  // shared by the Today/Next banner and the per-team record line. Pre-lock there are no
  // results worth showing, so we skip the query entirely.
  const phase = await getPhase();
  const teamIds = picks.map((p) => p.team_id);
  let matchRows: EntryMatchRow[] = [];
  if (phase.isLocked && teamIds.length > 0) {
    const { data } = await supabase
      .from("matches")
      .select(
        "fixture_id, kickoff, status, home_team_id, away_team_id, home_goals, away_goals, live_home_goals, live_away_goals, ht_home_goals, ht_away_goals, live_elapsed, winner_team_id, decided_by",
      )
      .or(`home_team_id.in.(${teamIds.join(",")}),away_team_id.in.(${teamIds.join(",")})`)
      .order("kickoff", { ascending: true });
    matchRows = data ?? [];
  }
  const summaryByTeam = new Map<number, TeamMatchSummary>(
    teamIds.map((id) => [id, summarizeTeamMatches(id, matchRows)]),
  );
  const today = todayBusinessDay();

  // Knockout phase: which teams are still alive (advanced + not knocked out). Used to dim
  // eliminated teams and float the live ones to the top.
  const knockoutTeams = new Set<number>();
  const knockoutLosers = new Set<number>();
  if (phase.isLocked) {
    const { data: ko } = await supabase
      .from("matches")
      .select("stage, status, home_team_id, away_team_id, winner_team_id")
      .not("stage", "is", null)
      .neq("stage", "group");
    for (const m of ko ?? []) {
      for (const t of [m.home_team_id, m.away_team_id]) if (t != null) knockoutTeams.add(t);
      if (isTerminal(m.status) && m.winner_team_id != null) {
        for (const t of [m.home_team_id, m.away_team_id]) if (t != null && t !== m.winner_team_id) knockoutLosers.add(t);
      }
    }
  }
  const knockoutPhase = knockoutTeams.size > 0;
  const isAlive = (teamId: number) => !knockoutPhase || (knockoutTeams.has(teamId) && !knockoutLosers.has(teamId));
  // Float still-alive teams to the top; keep tier order within each group (stable sort).
  const orderedPicks = knockoutPhase
    ? [...picks].sort((a, b) => (isAlive(b.team_id) ? 1 : 0) - (isAlive(a.team_id) ? 1 : 0))
    : picks;

  return (
    <div className="space-y-5">
      <div className="text-center">
        <PageTitle>{entry.display_name}</PageTitle>
        {score && (
          <p className="mt-3">
            <span className="text-4xl font-extrabold tabular-nums text-neon text-glow">{score.total}</span>
            <span className="ml-1.5 text-sm text-muted-foreground">pts</span>
          </p>
        )}
        {/* The outlook is a live-tournament forecast — stale (and possibly wrong)
            once the trophy is lifted, so the archive drops it. */}
        {!isArchive && outlook && (
          <p className="mx-auto mt-3 max-w-sm text-xs leading-relaxed text-muted-foreground">
            <span className="font-semibold uppercase tracking-[0.14em] text-foreground">
              {outlook.clinched ? "Clinched" : BUCKET_LABEL[outlook.bucket as string] ?? ""}
            </span>
            {outlook.rationale && <> — {stripEmoji(outlook.rationale)}</>}{" "}
            <Link href="/how-its-built#chance-to-win" className="whitespace-nowrap text-neon hover:underline">
              how it works
            </Link>
          </p>
        )}
      </div>

      <TodayAndNext rows={matchRows} teamIds={teamIds} teamMap={teamMap} isLocked={phase.isLocked} />

      <div className="space-y-2">
        {orderedPicks.map((p) => {
          const team = teamMap.get(p.team_id);
          const teamLines = linesByTeam.get(p.team_id) ?? [];
          const total = ptsByTeam.get(p.team_id) ?? 0;
          const out = knockoutPhase && !isAlive(p.team_id);
          // This team's finished fixtures in kickoff order → game numbers (gm 1, gm 2…),
          // each tagged with its outcome so a scoreless loss still shows as "gm N: loss (0)".
          const orderedGames = matchRows
            .filter((m) => (m.home_team_id === p.team_id || m.away_team_id === p.team_id) && isTerminal(m.status))
            .map((m) => {
              const isHome = m.home_team_id === p.team_id;
              const my = (isHome ? m.home_goals : m.away_goals) ?? 0;
              const opp = (isHome ? m.away_goals : m.home_goals) ?? 0;
              const outcome: "W" | "D" | "L" =
                my > opp ? "W" : my < opp ? "L" : m.decided_by === "penalties" ? (m.winner_team_id === p.team_id ? "W" : "L") : "D";
              return { fixtureId: m.fixture_id, outcome };
            });
          const log = buildGameLog(teamLines, orderedGames);
          return (
            <div key={p.tier_no} className={`rounded-xl border border-border bg-card p-3 shadow-sm transition-opacity ${out ? "opacity-45" : ""}`}>
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">{team?.flag}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="font-semibold">{team?.name}</span>
                    {out && (
                      <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                        Out
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-muted-foreground">Tier {p.tier_no} · {TIER_LABELS[p.tier_no]}</span>
                  <TeamStatusLine summary={summaryByTeam.get(p.team_id)} teamMap={teamMap} today={today} />
                </span>
                <span className="text-lg font-bold tabular-nums">{total}</span>
              </div>
              {log.items.length > 0 ? (
                <div className="mt-2 border-t border-border/60 pt-1.5 text-xs leading-relaxed text-muted-foreground">
                  {log.items.map((it, i) => (
                    <span key={i}>
                      {i > 0 && <span className="opacity-40"> · </span>}
                      {it.label}
                      {it.pts !== 0 && <span className="tabular-nums text-foreground/90"> +{it.pts}</span>}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="mt-2 border-t border-border/60 pt-1.5 text-xs text-muted-foreground">
                  No points yet
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="pb-2 text-center">
        <p className="text-sm">
          <Link href="/tiers" className="font-semibold text-neon hover:underline">
            Tier list · who picked each team →
          </Link>
        </p>
        {score != null && (
          <p className="mt-3 text-xs text-muted-foreground">
            All 12 teams add up to{" "}
            <span className="font-semibold tabular-nums text-foreground">{grandTotal}</span>
            {reconciles ? (
              <>
                {" "}— your exact total on the{" "}
                <Link href="/" className="text-neon hover:underline">leaderboard</Link>, scored by
                the same engine that ranks the pool.{" "}
                <Link href="/how-its-built" className="whitespace-nowrap text-neon hover:underline">how it&apos;s built</Link>
              </>
            ) : (
              <span className="text-destructive"> — recalculating…</span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

/** The stored outlook rationale embeds flag/lock emoji; this page renders it as plain prose. */
function stripEmoji(s: string): string {
  return s
    .replace(/[\p{Extended_Pictographic}\u{E0020}-\u{E007F}\u{FE0F}\u{200D}]/gu, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;])/g, "$1")
    .trim();
}

/** Drop the trailing "(+N)" some engine labels carry (e.g. "Upset draw (+2.5)"),
 *  since the point value is shown separately as "(N)" in the breakdown. */
function cleanLabel(label: string): string {
  return label.replace(/\s*\(\+?[\d.]+\)\s*$/, "");
}

const OUTCOME_WORD = { W: "win", D: "draw", L: "loss" } as const;

/**
 * Turn a team's finished games + point-earning score lines into a game-by-game log:
 *   "gm 1: win (2) · gm 2: win, 1 goal (3) · won group (3)"
 * Every played game is listed in order — a game that earned nothing shows its
 * outcome at (0), so the numbering never skips. Games with multiple point events
 * list them together. Group-placement bonuses (no match) appear after, unnumbered.
 */
function buildGameLog(
  lines: { matchId: number | null; points: number; label: string }[],
  orderedGames: { fixtureId: number; outcome: "W" | "D" | "L" }[],
): { items: { label: string; pts: number }[] } {
  const byMatch = new Map<number, { points: number; label: string }[]>();
  const placement: { label: string; pts: number }[] = [];
  for (const l of lines) {
    if (l.matchId == null) {
      placement.push({ label: cleanLabel(l.label).toLowerCase(), pts: l.points });
      continue;
    }
    (byMatch.get(l.matchId) ?? byMatch.set(l.matchId, []).get(l.matchId)!).push({ points: l.points, label: l.label });
  }

  const items: { label: string; pts: number }[] = [];
  orderedGames.forEach((g, idx) => {
    const ls = byMatch.get(g.fixtureId);
    const parts = ls && ls.length > 0
      ? ls.map((x) => cleanLabel(x.label).toLowerCase()).join(", ")
      : OUTCOME_WORD[g.outcome];
    const pts = (ls ?? []).reduce((s, x) => s + x.points, 0);
    items.push({ label: `gm ${idx + 1}: ${parts}`, pts });
  });
  items.push(...placement);
  return { items };
}

const NEXT_DAY = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
});

function opponentLabel(oppId: number | null, teamMap: Map<number, TeamInfo>): string {
  const opp = oppId != null ? teamMap.get(oppId) : undefined;
  return opp ? `${opp.flag} ${opp.name}` : "opponent";
}

/**
 * Forward-looking one-liner under a picked team: a live score while it's on the pitch,
 * else a "today / next" nudge. Past results aren't shown here — the game-by-game
 * breakdown below already lists every game (wins, draws, and losses). Renders nothing
 * pre-lock or when there's nothing upcoming.
 */
function TeamStatusLine({
  summary,
  teamMap,
  today,
}: {
  summary: TeamMatchSummary | undefined;
  teamMap: Map<number, TeamInfo>;
  today: string;
}) {
  if (!summary) return null;
  const { played, live, nextKickoff } = summary;

  let ahead: ReactNode = null;
  if (nextKickoff) {
    ahead =
      businessDayOf(nextKickoff) === today
        ? <>Plays today <LocalTime iso={nextKickoff} /></>
        : `Next ${NEXT_DAY.format(new Date(nextKickoff))}`;
  } else if (played === 0 && !live) {
    ahead = "Yet to play";
  }

  if (!live && !ahead) return null;

  return (
    <span className="mt-0.5 block text-xs text-muted-foreground">
      {live ? (
        <span className="font-semibold text-neon">
          ● Live vs {opponentLabel(live.oppId, teamMap)} {live.my}–{live.opp}
          {live.elapsed != null ? ` ${live.elapsed}′` : ""}
        </span>
      ) : (
        ahead
      )}
    </span>
  );
}

/**
 * Which of this entry's teams play today, and the next upcoming fixture (U6) —
 * the "know who to root against" line. Hidden pre-lock (the tournament hasn't
 * started; an owner viewing their own roster pre-lock shouldn't see a stub).
 * Fixtures are loaded once by the page and shared with the per-team record lines.
 */
function TodayAndNext({
  rows,
  teamIds,
  teamMap,
  isLocked,
}: {
  rows: EntryMatchRow[];
  teamIds: number[];
  teamMap: Map<number, TeamInfo>;
  isLocked: boolean;
}) {
  if (!isLocked || teamIds.length === 0) return null;

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

  const describe = (m: (typeof rows)[number]): ReactNode => {
    const ours = [m.home_team_id, m.away_team_id].filter((id): id is number => id != null && mine.has(id));
    const opp = [m.home_team_id, m.away_team_id].find((id) => id != null && !mine.has(id!));
    const ourTeams = ours.map((id) => teamMap.get(id)).filter(Boolean) as TeamInfo[];
    const oppTeam = opp != null ? teamMap.get(opp) : undefined;
    const state = cardStateFor(m);
    const score: ReactNode =
      state.kind === "final"
        ? `${state.home}–${state.away} FT`
        : state.kind === "live"
          ? `LIVE${state.elapsed != null ? ` ${state.elapsed}′` : ""} ${state.home}–${state.away}`
          : state.kind === "halftime"
            ? `HT ${state.home}–${state.away}`
            : m.kickoff
              ? <LocalTime iso={m.kickoff} />
              : "TBD";
    const us = ourTeams.map((t) => `${t.flag} ${t.name}`).join(" & ");
    return ours.length === 2 ? (
      <>{us} — {score}</>
    ) : (
      <>{us} {oppTeam ? `vs ${oppTeam.flag} ${oppTeam.name}` : ""} · {score}</>
    );
  };

  return (
    <div className="rounded-xl border border-border bg-card p-3 text-sm shadow-sm">
      {todays.length > 0 && (
        <div>
          <p className={`text-[10px] font-bold uppercase tracking-[0.15em] ${todays.some((m) => isLive(m.status)) ? "text-neon" : "text-muted-foreground"}`}>
            Today
          </p>
          {todays.map((m) => (
            <p key={m.fixture_id} className="mt-0.5">
              {describe(m)}
            </p>
          ))}
        </div>
      )}
      {next?.kickoff && (
        <div className={todays.length > 0 ? "mt-2.5" : ""}>
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
            Next
          </p>
          <p className="mt-0.5">
            {describe(next)}{" "}
            <span className="text-muted-foreground">({NEXT_DAY.format(new Date(next.kickoff))})</span>
          </p>
        </div>
      )}
    </div>
  );
}
