// Pure, idempotent scoring engine (Scoring Spec §5).
//
// Execution note: the plan (D2) specified a Postgres recompute function. We implement
// the math in TypeScript instead so it is unit-testable without a live database, while
// preserving the key property: recompute is a *pure function* of (matches, tiers, picks)
// and fully replaces prior output — running it twice yields identical results. The
// ingest route (U6) persists the output via the service-role client in a single pass.

import {
  GROUP_POINTS,
  KNOCKOUT_POINTS,
  GOAL_BONUS_PER_GOAL,
  GOAL_BONUS_MIN_TIER,
  UPSET_WIN_PER_TIER,
  UPSET_DRAW_PER_TIER,
  BEST_THIRDS_ADVANCING,
} from "./constants";
import type { MatchStage, MatchDecidedBy, ScoreCategory } from "@/lib/db/types";

// ---------- inputs ----------
export interface ScoringMatch {
  fixtureId: number;
  stage: MatchStage; // must be set; needs_attention/unmapped matches are excluded by caller
  groupLabel: string | null;
  homeTeamId: number;
  awayTeamId: number;
  homeGoals: number; // reg + ET, excludes shootout kicks
  awayGoals: number;
  winnerTeamId: number | null; // advancing/winning team; null only for a group draw
  decidedBy: MatchDecidedBy | null;
  isTerminal: boolean; // only terminal matches are passed in
}

export interface ScoringInput {
  tierByTeam: Map<number, number>; // team_id -> tier_no (1..12), frozen
  entries: { id: string }[];
  picksByEntry: Map<string, number[]>; // entry_id -> [team_id,...] (the 12 picks)
  matches: ScoringMatch[]; // terminal, stage-mapped matches only
  // The real set of teams that advanced to the knockouts (the 32 drawn into the R32), read
  // from the published bracket — NOT inferred from standings. When present it is the source
  // of truth for the advance/group bonuses: a team scores them only if it actually advanced.
  // Omitted before the R32 exists (group stage still in progress).
  advancedTeams?: Set<number>;
}

// ---------- outputs ----------
export interface ComputedScoreLine {
  entryId: string;
  teamId: number;
  matchId: number | null;
  points: number;
  label: string;
  category: ScoreCategory;
  stage: MatchStage | "group_placement";
}

export interface ComputedScore {
  entryId: string;
  total: number;
  groupStageTotal: number;
  underdogTotal: number;
  upsetTotal: number;
}

export interface ScoringResult {
  scores: ComputedScore[];
  lines: ComputedScoreLine[];
}

// ---------- group standings ----------
interface StandingRow {
  teamId: number;
  played: number;
  points: number;
  gf: number;
  ga: number;
  gd: number;
}

// A 4-team group is complete after its full round-robin of 6 matches. Placement
// bonuses (won-group / advanced) are only awarded once a group is complete, so live
// standings during group play never award advancement prematurely.
const GROUP_MATCHES_WHEN_COMPLETE = 6;

// Real football points, used ONLY to rank group standings for advancement (who finishes
// 1st/2nd/3rd and which thirds advance). Distinct from the pool's GROUP_POINTS (the points
// entries score), which must never be used to compute standings.
const STANDINGS_WIN_POINTS = 3;
const STANDINGS_DRAW_POINTS = 1;

/** Build per-group standings from terminal group matches in COMPLETE groups only. */
function buildStandings(matches: ScoringMatch[]): Map<string, StandingRow[]> {
  const byGroup = new Map<string, Map<number, StandingRow>>();
  const groupMatchCount = new Map<string, number>();

  const ensure = (group: string, teamId: number): StandingRow => {
    if (!byGroup.has(group)) byGroup.set(group, new Map());
    const g = byGroup.get(group)!;
    if (!g.has(teamId)) g.set(teamId, { teamId, played: 0, points: 0, gf: 0, ga: 0, gd: 0 });
    return g.get(teamId)!;
  };

  for (const m of matches) {
    if (m.stage !== "group" || !m.groupLabel) continue;
    groupMatchCount.set(m.groupLabel, (groupMatchCount.get(m.groupLabel) ?? 0) + 1);
    const home = ensure(m.groupLabel, m.homeTeamId);
    const away = ensure(m.groupLabel, m.awayTeamId);
    home.played++;
    away.played++;
    home.gf += m.homeGoals;
    home.ga += m.awayGoals;
    away.gf += m.awayGoals;
    away.ga += m.homeGoals;
    // Standings/advancement use REAL football points (3 for a win, 1 for a draw) — NOT the
    // pool's GROUP_POINTS (win=2). The pool's values are only for the points entries earn;
    // using them here mis-ranks draw-heavy teams (e.g. 3 draws = 3 real pts but only beat a
    // 1-win side under 2/1/0), which wrongly decided the 8th best-third (Iran over Senegal).
    if (m.homeGoals > m.awayGoals) {
      home.points += STANDINGS_WIN_POINTS;
    } else if (m.homeGoals < m.awayGoals) {
      away.points += STANDINGS_WIN_POINTS;
    } else {
      home.points += STANDINGS_DRAW_POINTS;
      away.points += STANDINGS_DRAW_POINTS;
    }
  }

  const result = new Map<string, StandingRow[]>();
  for (const [group, rows] of byGroup) {
    if ((groupMatchCount.get(group) ?? 0) < GROUP_MATCHES_WHEN_COMPLETE) continue; // incomplete
    for (const r of rows.values()) r.gd = r.gf - r.ga;
    result.set(group, [...rows.values()].sort(compareStanding));
  }
  return result;
}

/**
 * FIFA-style ordering: points, then goal difference, then goals scored.
 * Head-to-head and fair-play tiebreakers are deferred (plan §11); team id is the
 * deterministic final fallback so output is stable.
 */
function compareStanding(a: StandingRow, b: StandingRow): number {
  if (b.points !== a.points) return b.points - a.points;
  if (b.gd !== a.gd) return b.gd - a.gd;
  if (b.gf !== a.gf) return b.gf - a.gf;
  return a.teamId - b.teamId;
}

export interface GroupPlacement {
  winners: Set<number>; // 1st in group
  runnersUp: Set<number>; // 2nd in group
  bestThirds: Set<number>; // the 8 qualifying third-placed teams
}

/** Determine group winners, runners-up, and the 8 best third-placed teams. */
export function computeGroupPlacement(matches: ScoringMatch[]): GroupPlacement {
  const standings = buildStandings(matches);
  const winners = new Set<number>();
  const runnersUp = new Set<number>();
  const thirds: StandingRow[] = [];

  for (const rows of standings.values()) {
    if (rows[0]) winners.add(rows[0].teamId);
    if (rows[1]) runnersUp.add(rows[1].teamId);
    if (rows[2]) thirds.push(rows[2]);
  }

  thirds.sort(compareStanding);
  const bestThirds = new Set<number>(
    thirds.slice(0, BEST_THIRDS_ADVANCING).map((r) => r.teamId),
  );

  return { winners, runnersUp, bestThirds };
}

/**
 * Ordered team ids (1st→last) for each COMPLETE group. Used by the outlook feature to
 * detect group-stage elimination (a team finishing last can never advance). Incomplete
 * groups are omitted — their order isn't settled yet.
 */
export function orderedGroupStandings(matches: ScoringMatch[]): Map<string, number[]> {
  const standings = buildStandings(matches.filter((m) => m.isTerminal));
  const out = new Map<string, number[]>();
  for (const [group, rows] of standings) out.set(group, rows.map((r) => r.teamId));
  return out;
}

// ---------- per-team scoring ----------
interface TeamLine {
  matchId: number | null;
  points: number;
  label: string;
  category: ScoreCategory;
  stage: MatchStage | "group_placement";
}

/** All point-earning lines for a single team across the tournament. */
function linesForTeam(
  teamId: number,
  tierByTeam: Map<number, number>,
  matches: ScoringMatch[],
  placement: GroupPlacement,
): TeamLine[] {
  const lines: TeamLine[] = [];
  const myTier = tierByTeam.get(teamId);
  if (myTier == null) return lines;
  const goalEligible = myTier >= GOAL_BONUS_MIN_TIER;

  let playedGroup = false;

  for (const m of matches) {
    const isHome = m.homeTeamId === teamId;
    const isAway = m.awayTeamId === teamId;
    if (!isHome && !isAway) continue;

    const myGoals = isHome ? m.homeGoals : m.awayGoals;
    const oppId = isHome ? m.awayTeamId : m.homeTeamId;
    const oppTier = tierByTeam.get(oppId);
    const isWinner = m.winnerTeamId === teamId;
    const isDraw = m.winnerTeamId == null;

    // --- result points ---
    if (m.stage === "group") {
      playedGroup = true;
      if (isDraw) {
        lines.push({ matchId: m.fixtureId, points: GROUP_POINTS.draw, label: "Draw", category: "result", stage: "group" });
      } else if (isWinner) {
        lines.push({ matchId: m.fixtureId, points: GROUP_POINTS.win, label: "Win", category: "result", stage: "group" });
      }
    } else if (m.stage !== "third_place") {
      // knockout win points (no ladder slot for the 3rd-place playoff)
      if (isWinner) {
        const pts = KNOCKOUT_POINTS[m.stage] ?? 0;
        lines.push({ matchId: m.fixtureId, points: pts, label: knockoutLabel(m.stage), category: "result", stage: m.stage });
      }
    }

    // --- goal bonus (tiers 7-12 only; counts in every stage incl. 3rd-place) ---
    if (goalEligible && myGoals > 0) {
      lines.push({
        matchId: m.fixtureId,
        points: myGoals * GOAL_BONUS_PER_GOAL,
        label: `${myGoals} goal${myGoals === 1 ? "" : "s"}`,
        category: "goal",
        stage: m.stage,
      });
    }

    // --- upset bonus (stacks; uses frozen tier; positive only when we are the underdog) ---
    if (oppTier != null) {
      const gap = myTier - oppTier; // >0 means opponent is a higher tier (better)
      if (gap > 0) {
        if (isWinner) {
          lines.push({
            matchId: m.fixtureId,
            points: gap * UPSET_WIN_PER_TIER,
            label: `Upset win (+${gap * UPSET_WIN_PER_TIER})`,
            category: "upset",
            stage: m.stage,
          });
        } else if (isDraw) {
          lines.push({
            matchId: m.fixtureId,
            points: gap * UPSET_DRAW_PER_TIER,
            label: `Upset draw (+${gap * UPSET_DRAW_PER_TIER})`,
            category: "upset",
            stage: m.stage,
          });
        }
      }
    }
  }

  // --- group placement bonus (winner +3, else advance +1) ---
  if (playedGroup) {
    if (placement.winners.has(teamId)) {
      lines.push({ matchId: null, points: GROUP_POINTS.winGroupBonus, label: "Won group", category: "group", stage: "group_placement" });
    } else if (placement.runnersUp.has(teamId) || placement.bestThirds.has(teamId)) {
      lines.push({ matchId: null, points: GROUP_POINTS.advanceBonus, label: "Advanced", category: "group", stage: "group_placement" });
    }
  }

  return lines;
}

function knockoutLabel(stage: MatchStage): string {
  switch (stage) {
    case "r32": return "Round of 32 win";
    case "r16": return "Round of 16 win";
    case "qf": return "Quarterfinal win";
    case "sf": return "Semifinal win";
    case "final": return "Champions!";
    default: return "Win";
  }
}

const isGroupStage = (s: MatchStage | "group_placement") => s === "group" || s === "group_placement";

// ---------- top-level recompute ----------
export function recompute(input: ScoringInput): ScoringResult {
  const terminal = input.matches.filter((m) => m.isTerminal);
  const placement = computeGroupPlacement(terminal);

  // Once the bracket is published, advancement bonuses follow the REAL Round of 32, not our
  // standings calc. Winners/runners-up are kept (and confirmed in the R32); the advancing
  // thirds are exactly the R32 teams that aren't a winner/runner-up. So a team that didn't
  // actually advance can never receive an advance/group bonus, regardless of standings math.
  if (input.advancedTeams && input.advancedTeams.size > 0) {
    const adv = input.advancedTeams;
    placement.winners = new Set([...placement.winners].filter((id) => adv.has(id)));
    placement.runnersUp = new Set([...placement.runnersUp].filter((id) => adv.has(id)));
    placement.bestThirds = new Set(
      [...adv].filter((id) => !placement.winners.has(id) && !placement.runnersUp.has(id)),
    );
  }

  // memoize each team's lines (teams may be picked by multiple entries)
  const teamLineCache = new Map<number, TeamLine[]>();
  const teamLines = (teamId: number): TeamLine[] => {
    if (!teamLineCache.has(teamId)) {
      teamLineCache.set(teamId, linesForTeam(teamId, input.tierByTeam, terminal, placement));
    }
    return teamLineCache.get(teamId)!;
  };

  const lines: ComputedScoreLine[] = [];
  const scores: ComputedScore[] = [];

  for (const entry of input.entries) {
    // De-dupe defensively: a team must never be counted twice for one entry, even if a
    // malformed picks row (e.g. a direct REST write bypassing the server action) slipped a
    // duplicate team into the roster. The DB now enforces unique(entry_id, team_id) too.
    const picks = [...new Set(input.picksByEntry.get(entry.id) ?? [])];
    let total = 0;
    let groupStageTotal = 0;
    let underdogTotal = 0;
    let upsetTotal = 0;

    for (const teamId of picks) {
      const tier = input.tierByTeam.get(teamId);
      for (const l of teamLines(teamId)) {
        lines.push({ entryId: entry.id, teamId, matchId: l.matchId, points: l.points, label: l.label, category: l.category, stage: l.stage });
        total += l.points;
        if (isGroupStage(l.stage)) groupStageTotal += l.points;
        if (tier != null && tier >= GOAL_BONUS_MIN_TIER) underdogTotal += l.points;
        if (l.category === "upset") upsetTotal += l.points;
      }
    }

    scores.push({ entryId: entry.id, total, groupStageTotal, underdogTotal, upsetTotal });
  }

  return { scores, lines };
}

/**
 * Leaderboard ordering (Scoring Spec §5.6): total, then underdog (tiers 7-12) points,
 * then upset points. Remaining exact ties split the prize (resolved off-app).
 */
export type LeaderboardSortable = Pick<ComputedScore, "total" | "underdogTotal" | "upsetTotal">;

export function compareForLeaderboard(a: LeaderboardSortable, b: LeaderboardSortable): number {
  if (b.total !== a.total) return b.total - a.total;
  if (b.underdogTotal !== a.underdogTotal) return b.underdogTotal - a.underdogTotal;
  return b.upsetTotal - a.upsetTotal;
}
