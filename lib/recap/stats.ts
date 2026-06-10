// Deterministic day stats (U7). Every number the recap narrative may reference is
// computed here from DB rows — Claude only narrates. The output is stored in the
// publicly readable recaps.stats jsonb, so fields are strictly allowlisted:
// display_name (truncated), rank, totals, deltas — NEVER paid / user_id / email.
import type { RecapStats, MatchStage, MatchDecidedBy } from "@/lib/db/types";
import { businessDayOf, formatKickoffTimeET, isResolved } from "@/lib/matches/day";
import { movementFor, rankWithTies, type StandingRow } from "@/lib/standings/snapshot";

export const DISPLAY_NAME_MAX = 40; // bounds prompt-injection payload size too

export interface StatsMatchRow {
  fixture_id: number;
  stage: MatchStage | null;
  group_label: string | null;
  kickoff: string | null;
  status: string;
  home_team_id: number | null;
  away_team_id: number | null;
  home_goals: number | null;
  away_goals: number | null;
  decided_by: MatchDecidedBy | null;
}

export interface StatsTeam {
  id: number;
  name: string;
  flag: string;
}

export interface StatsEntryRow extends StandingRow {
  displayName: string;
}

export interface StatsScoreLine {
  entry_id: string;
  team_id: number;
  match_id: number | null;
  points: number;
  label: string;
  category: string;
}

export interface BuildStatsInput {
  day: string; // ET business day being recapped
  dayNumber: number;
  matches: StatsMatchRow[]; // ALL fixtures (dayNumber needs the full schedule? no — today's only; see buildDayNumber)
  teams: Map<number, StatsTeam>;
  entries: StatsEntryRow[]; // current standings (post-results)
  snapshots: Map<string, { rank: number; total: number }>; // start-of-day, by entry_id
  todaysLines: StatsScoreLine[]; // score_lines whose match is on `day`
}

/** Nth match day since the opener: distinct fixture-bearing ET days ≤ `day`. */
export function buildDayNumber(allKickoffs: Array<string | null>, day: string): number {
  const days = new Set<string>();
  for (const k of allKickoffs) {
    if (!k) continue;
    const d = businessDayOf(k);
    if (d <= day) days.add(d);
  }
  return days.size;
}

const trunc = (s: string) => (s.length > DISPLAY_NAME_MAX ? `${s.slice(0, DISPLAY_NAME_MAX - 1)}…` : s);

export function buildDayStats(input: BuildStatsInput): RecapStats {
  const { day, dayNumber, matches, teams, entries, snapshots, todaysLines } = input;

  const todays = matches.filter((m) => m.kickoff && businessDayOf(m.kickoff) === day);

  const results: RecapStats["results"] = todays
    .filter((m) => isResolved(m.status))
    .map((m) => {
      const home = m.home_team_id != null ? teams.get(m.home_team_id) : undefined;
      const away = m.away_team_id != null ? teams.get(m.away_team_id) : undefined;
      const postponed = !["FT", "AET", "PEN", "AWD", "WO"].includes(m.status);
      return {
        fixtureId: m.fixture_id,
        stage: m.stage,
        groupLabel: m.group_label,
        home: home ? { name: home.name, flag: home.flag, goals: m.home_goals ?? 0 } : null,
        away: away ? { name: away.name, flag: away.flag, goals: m.away_goals ?? 0 } : null,
        decidedBy: m.decided_by,
        ...(postponed ? { postponed: true } : {}),
      };
    });

  // Current ranks via the canonical comparator; movement vs the morning snapshot.
  const ranked = rankWithTies(entries);
  const nameByEntry = new Map(entries.map((e) => [e.entryId, trunc(e.displayName)]));
  const statEntries: RecapStats["entries"] = ranked.map((r) => {
    const move = movementFor({ rank: r.rank, total: r.total }, snapshots.get(r.entryId) ?? null);
    return {
      entryId: r.entryId,
      displayName: nameByEntry.get(r.entryId) ?? "Unknown",
      total: r.total,
      pointsToday: move.pointsToday,
      rank: r.rank,
      rankDelta: move.rankDelta,
    };
  });

  // Only genuine gainers — on a scoreless day nobody "had a day".
  const movers = statEntries.filter((e) => (e.pointsToday ?? 0) > 0);
  const topGainer =
    movers.length > 0
      ? movers.reduce((a, b) => ((b.pointsToday ?? 0) > (a.pointsToday ?? 0) ? b : a)).displayName
      : null;
  const fallers = statEntries.filter((e) => (e.rankDelta ?? 0) < 0);
  const biggestFaller =
    fallers.length > 0
      ? fallers.reduce((a, b) => ((b.rankDelta ?? 0) < (a.rankDelta ?? 0) ? b : a)).displayName
      : null;

  // Upsets + goal-bonus standouts from today's score lines (deduped per team/match).
  const upsetSeen = new Set<string>();
  const upsets: RecapStats["upsets"] = [];
  for (const l of todaysLines) {
    if (l.category !== "upset") continue;
    const key = `${l.team_id}:${l.match_id}`;
    if (upsetSeen.has(key)) continue;
    upsetSeen.add(key);
    upsets.push({
      teamName: teams.get(l.team_id)?.name ?? "Unknown",
      label: l.label,
      points: l.points,
    });
  }
  upsets.sort((a, b) => b.points - a.points);

  // Goal lines repeat per OWNING ENTRY — dedupe by (team, match) before summing.
  const goalSeen = new Set<string>();
  const goalsByTeam = new Map<number, number>();
  for (const l of todaysLines) {
    if (l.category !== "goal") continue;
    const key = `${l.team_id}:${l.match_id}`;
    if (goalSeen.has(key)) continue;
    goalSeen.add(key);
    const m = /(\d+)\s+goal/.exec(l.label);
    const count = m ? Number(m[1]) : l.points; // GOAL_BONUS_PER_GOAL = 1 → points ≈ goals
    goalsByTeam.set(l.team_id, (goalsByTeam.get(l.team_id) ?? 0) + count);
  }
  const goalBonusStandouts: RecapStats["goalBonusStandouts"] = [...goalsByTeam.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([teamId, goals]) => ({ teamName: teams.get(teamId)?.name ?? "Unknown", goals }));

  const lookAhead = buildLookAhead(matches, teams, day);

  return {
    dayNumber,
    results,
    entries: statEntries,
    topGainer,
    biggestFaller,
    upsets,
    goalBonusStandouts,
    topThree: statEntries.slice(0, 3).map((e) => e.displayName),
    ...(lookAhead ? { lookAhead } : {}),
  };
}

/**
 * The next fixture-bearing ET day after `day` (rest days skipped), so the
 * narrative's closing look-ahead line can name a real matchup. Public schedule
 * data only; undefined once no future fixtures remain (after the final).
 */
function buildLookAhead(
  matches: StatsMatchRow[],
  teams: Map<number, StatsTeam>,
  day: string,
): RecapStats["lookAhead"] {
  let nextDay: string | null = null;
  for (const m of matches) {
    if (!m.kickoff) continue;
    const d = businessDayOf(m.kickoff);
    if (d <= day) continue;
    if (nextDay === null || d < nextDay) nextDay = d;
  }
  if (nextDay === null) return undefined;

  const fixtures = matches
    .filter((m) => m.kickoff && businessDayOf(m.kickoff) === nextDay)
    .sort((a, b) => (a.kickoff ?? "").localeCompare(b.kickoff ?? ""))
    .map((m) => {
      const home = m.home_team_id != null ? teams.get(m.home_team_id) : undefined;
      const away = m.away_team_id != null ? teams.get(m.away_team_id) : undefined;
      return {
        home: home ? { name: home.name, flag: home.flag } : null,
        away: away ? { name: away.name, flag: away.flag } : null,
        stage: m.stage,
        groupLabel: m.group_label,
        kickoffET: formatKickoffTimeET(m.kickoff!),
      };
    });

  return { day: nextDay, fixtures };
}
