// Exact "if X wins the final" scenarios — shown once the tournament is down to the final
// (plus, possibly, the third-place game). At that point the money isn't a simulation any
// more: we play out every remaining winner combination through the REAL scoring engine and,
// when the outcome is fully determined by who lifts the trophy, present it as fact.
//
// Deliberately conservative: returns null (render nothing, keep the Monte Carlo view) unless
//   - the only unplayed matches are the final and (optionally) the third-place game,
//   - every remaining team is below the goal-bonus tier (tiers 1-6), so scorelines can't
//     move points — the winner alone decides everything, and
//   - for each final winner, EVERY combination of the other results produces the identical
//     champion + runner-up (same entries, same totals), with no ambiguous prize ties.
// Pure + unit-tested; wired in by loadFinish.ts, rendered by RaceToFinishCard.tsx.

import {
  recompute,
  compareForLeaderboard,
  type ScoringInput,
  type ScoringMatch,
} from "@/lib/scoring/engine";
import { GOAL_BONUS_MIN_TIER } from "@/lib/scoring/constants";
import type { MatchStage } from "@/lib/db/types";

export interface ScenarioPlace {
  name: string; // entry display name
  total: number; // final points total in this scenario
  prize: string; // e.g. "$1,350"
}

export interface FinalScenario {
  winner: { name: string; flag: string }; // the team lifting the trophy
  champion: ScenarioPlace;
  runnerUp: ScenarioPlace;
  /** Exact tie at the very top: the two entries split champion + runner-up between them. */
  split: boolean;
}

export interface FinalScenarios {
  scenarios: FinalScenario[]; // one per possible final winner
  /** True when the third-place game is still to be played yet provably can't move the money. */
  thirdPlaceGameIrrelevant: boolean;
}

export interface FinalScenariosInput {
  scoring: ScoringInput; // full engine input: tiers, entries, picks, terminal matches
  remaining: { stage: MatchStage; homeTeamId: number; awayTeamId: number }[]; // unplayed, teams known
  nameByEntry: Map<string, string>;
  teamMeta: Map<number, { name: string; flag: string; tier: number | null }>;
  championPrize: string;
  runnerUpPrize: string;
}

interface MoneyOutcome {
  champion: { entryId: string; total: number };
  runnerUp: { entryId: string; total: number };
  split: boolean;
}

const sameOutcome = (a: MoneyOutcome, b: MoneyOutcome) =>
  a.champion.entryId === b.champion.entryId &&
  a.champion.total === b.champion.total &&
  a.runnerUp.entryId === b.runnerUp.entryId &&
  a.runnerUp.total === b.runnerUp.total &&
  a.split === b.split;

/** Play one winner combination through the engine and read the money places off the board. */
function moneyOutcome(
  scoring: ScoringInput,
  remaining: FinalScenariosInput["remaining"],
  winners: number[],
): MoneyOutcome | null {
  const synthetic: ScoringMatch[] = remaining.map((m, i) => ({
    fixtureId: -1000 - i,
    stage: m.stage,
    groupLabel: null,
    homeTeamId: m.homeTeamId,
    awayTeamId: m.awayTeamId,
    homeGoals: winners[i] === m.homeTeamId ? 1 : 0,
    awayGoals: winners[i] === m.homeTeamId ? 0 : 1,
    winnerTeamId: winners[i],
    decidedBy: "regulation",
    isTerminal: true,
  }));
  const scores = recompute({ ...scoring, matches: [...scoring.matches, ...synthetic] }).scores;
  if (scores.length < 2) return null;
  scores.sort(compareForLeaderboard);

  // Group the top of the board by exact ties (all three tiebreakers equal).
  const topSize = scores.filter((s) => compareForLeaderboard(s, scores[0]) === 0).length;
  if (topSize === 1) {
    const second = scores[1];
    const secondTie = scores.filter((s) => compareForLeaderboard(s, second) === 0).length;
    if (secondTie > 1) return null; // ambiguous runner-up tie — don't present as fact
    return {
      champion: { entryId: scores[0].entryId, total: scores[0].total },
      runnerUp: { entryId: second.entryId, total: second.total },
      split: false,
    };
  }
  if (topSize === 2) {
    // Two exactly tied at the top: they split champion + runner-up between them.
    return {
      champion: { entryId: scores[0].entryId, total: scores[0].total },
      runnerUp: { entryId: scores[1].entryId, total: scores[1].total },
      split: true,
    };
  }
  return null; // 3+ way tie at the top — too messy to present as a clean scenario
}

export function buildFinalScenarios(input: FinalScenariosInput): FinalScenarios | null {
  const { scoring, remaining, nameByEntry, teamMeta } = input;

  const final = remaining.filter((m) => m.stage === "final");
  const others = remaining.filter((m) => m.stage !== "final");
  // Only when it literally all comes down to the final (± the third-place game).
  if (final.length !== 1 || others.some((m) => m.stage !== "third_place")) return null;

  // Scorelines must not be able to move points: no remaining team may earn the goal bonus.
  for (const m of remaining) {
    for (const id of [m.homeTeamId, m.awayTeamId]) {
      const tier = scoring.tierByTeam.get(id);
      if (tier == null || tier >= GOAL_BONUS_MIN_TIER) return null;
    }
  }

  // Every winner combination of the non-final matches (2^n; n is 0 or 1 in practice).
  let otherCombos: number[][] = [[]];
  for (const m of others) {
    otherCombos = otherCombos.flatMap((c) => [
      [...c, m.homeTeamId],
      [...c, m.awayTeamId],
    ]);
  }

  const scenarios: FinalScenario[] = [];
  for (const finalWinner of [final[0].homeTeamId, final[0].awayTeamId]) {
    let outcome: MoneyOutcome | null = null;
    for (const combo of otherCombos) {
      const o = moneyOutcome(scoring, [...others, final[0]], [...combo, finalWinner]);
      if (o == null) return null;
      if (outcome == null) outcome = o;
      else if (!sameOutcome(outcome, o)) return null; // other games still matter — not exact
    }
    if (outcome == null) return null;

    const team = teamMeta.get(finalWinner);
    const champName = nameByEntry.get(outcome.champion.entryId);
    const ruName = nameByEntry.get(outcome.runnerUp.entryId);
    if (!team || !champName || !ruName) return null;
    scenarios.push({
      winner: { name: team.name, flag: team.flag },
      champion: { name: champName, total: outcome.champion.total, prize: input.championPrize },
      runnerUp: { name: ruName, total: outcome.runnerUp.total, prize: input.runnerUpPrize },
      split: outcome.split,
    });
  }

  return { scenarios, thirdPlaceGameIrrelevant: others.length > 0 };
}
