// Per-team match summary for the entry/roster page (U6).
//
// The score-lines breakdown only shows point-earning events, so a team that played
// and lost is invisible. This pure helper rolls a team's fixtures into its actual
// results (opponent + scoreline + outcome), its live state if it's on the pitch now,
// and its soonest upcoming kickoff — the "how did Australia do" line.
import { isLive, isTerminal } from "@/lib/matches/day";
import type { MatchDecidedBy } from "@/lib/db/types";

export interface TeamMatchRow {
  status: string;
  kickoff: string | null;
  home_team_id: number | null;
  away_team_id: number | null;
  home_goals: number | null;
  away_goals: number | null;
  live_home_goals: number | null;
  live_away_goals: number | null;
  live_elapsed: number | null;
  winner_team_id: number | null;
  decided_by: MatchDecidedBy | null;
}

/** A finished match from this team's perspective. Goals are reg+ET (excludes shootout). */
export interface TeamResult {
  oppId: number | null;
  my: number;
  opp: number;
  outcome: "W" | "D" | "L";
  pens: boolean; // level after ET, decided on penalties
}

export interface TeamMatchSummary {
  /** Terminal results in kickoff order. */
  results: TeamResult[];
  played: number;
  /** Set only while a fixture is in progress; goals are from this team's perspective. */
  live: { oppId: number | null; my: number; opp: number; elapsed: number | null } | null;
  /** ISO kickoff of the soonest not-yet-started fixture (today or future); null if none. */
  nextKickoff: string | null;
}

const UPCOMING = new Set(["NS", "TBD"]);

/**
 * Summarize one team's fixtures. `matches` may include fixtures the team isn't in
 * (the caller queries by a roster-wide team list) — those are skipped. A penalty
 * shootout counts toward the team that advanced (winner_team_id), since a level
 * reg+ET score would otherwise read as a draw.
 */
export function summarizeTeamMatches(teamId: number, matches: TeamMatchRow[]): TeamMatchSummary {
  const results: TeamResult[] = [];
  let live: TeamMatchSummary["live"] = null;
  let nextKickoff: string | null = null;

  for (const m of matches) {
    const isHome = m.home_team_id === teamId;
    const isAway = m.away_team_id === teamId;
    if (!isHome && !isAway) continue;
    const oppId = isHome ? m.away_team_id : m.home_team_id;

    if (isTerminal(m.status)) {
      const my = (isHome ? m.home_goals : m.away_goals) ?? 0;
      const opp = (isHome ? m.away_goals : m.home_goals) ?? 0;
      let outcome: TeamResult["outcome"];
      let pens = false;
      if (my > opp) outcome = "W";
      else if (my < opp) outcome = "L";
      else if (m.decided_by === "penalties") {
        pens = true;
        outcome = m.winner_team_id === teamId ? "W" : "L";
      } else outcome = "D";
      results.push({ oppId, my, opp, outcome, pens });
    } else if (isLive(m.status)) {
      live = {
        oppId,
        my: (isHome ? m.live_home_goals : m.live_away_goals) ?? 0,
        opp: (isHome ? m.live_away_goals : m.live_home_goals) ?? 0,
        elapsed: m.live_elapsed,
      };
    } else if (UPCOMING.has(m.status) && m.kickoff) {
      if (nextKickoff == null || m.kickoff < nextKickoff) nextKickoff = m.kickoff;
    }
  }

  return { results, played: results.length, live, nextKickoff };
}
