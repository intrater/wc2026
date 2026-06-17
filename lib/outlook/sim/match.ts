// Sample a single match into the exact shape the scoring engine consumes. Goals are a
// plausible scoreline (not a calibrated goals model) — enough to feed the tiers-7–12 goal
// bonus. Knockout ties can't draw: force a winner, mark penalties, and keep the scoreline
// level (shootout kicks never count toward the goal bonus, matching the engine).
import type { ScoringMatch } from "@/lib/scoring/engine";
import { groupMatchProbs, knockoutWinProbHome } from "../strength";
import { weightedPick } from "./rng";

type Outcome = "home" | "away" | "draw";

function scoreline(rng: () => number, outcome: Outcome): [number, number] {
  if (outcome === "draw") {
    const g = weightedPick(rng, [0, 1, 2, 3], [25, 40, 25, 10]);
    return [g, g];
  }
  const winnerGoals = weightedPick(rng, [1, 2, 3, 4], [40, 35, 20, 5]);
  const loserGoals = Math.floor(rng() * winnerGoals); // 0..winnerGoals-1
  return outcome === "home" ? [winnerGoals, loserGoals] : [loserGoals, winnerGoals];
}

export function sampleGroupMatch(
  fixtureId: number,
  groupLabel: string | null,
  home: number,
  away: number,
  ratingHome: number,
  ratingAway: number,
  rng: () => number,
): ScoringMatch {
  const p = groupMatchProbs(ratingHome, ratingAway);
  const u = rng();
  const outcome: Outcome = u < p.pHome ? "home" : u < p.pHome + p.pDraw ? "draw" : "away";
  const [hg, ag] = scoreline(rng, outcome);
  return {
    fixtureId,
    stage: "group",
    groupLabel,
    homeTeamId: home,
    awayTeamId: away,
    homeGoals: hg,
    awayGoals: ag,
    winnerTeamId: outcome === "draw" ? null : outcome === "home" ? home : away,
    decidedBy: "regulation",
    isTerminal: true,
  };
}

const KNOCKOUT_PENALTY_RATE = 0.22; // share of knockout ties that go to a shootout

export function sampleKnockoutMatch(
  fixtureId: number,
  stage: ScoringMatch["stage"],
  home: number,
  away: number,
  ratingHome: number,
  ratingAway: number,
  rng: () => number,
): ScoringMatch {
  const homeWins = rng() < knockoutWinProbHome(ratingHome, ratingAway);
  const winner = homeWins ? home : away;
  const toPens = rng() < KNOCKOUT_PENALTY_RATE;

  let hg: number, ag: number;
  let decidedBy: ScoringMatch["decidedBy"];
  if (toPens) {
    const level = weightedPick(rng, [0, 1, 2], [30, 50, 20]); // shootout kicks excluded from goals
    hg = level;
    ag = level;
    decidedBy = "penalties";
  } else {
    const w = weightedPick(rng, [1, 2, 3], [55, 30, 15]);
    const l = Math.floor(rng() * w);
    hg = homeWins ? w : l;
    ag = homeWins ? l : w;
    decidedBy = "regulation";
  }

  return {
    fixtureId,
    stage,
    groupLabel: null,
    homeTeamId: home,
    awayTeamId: away,
    homeGoals: hg,
    awayGoals: ag,
    winnerTeamId: winner,
    decidedBy,
    isTerminal: true,
  };
}
