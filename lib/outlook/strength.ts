// Team strength for *predicting* match outcomes in the simulation. Kept strictly separate
// from the frozen scoring tier (which the engine uses for bonuses). Strength is seeded from
// the championship odds and expressed as a log-rating; match probabilities come from the
// rating difference via a logistic curve.
//
// Tunable constants (documented because they're load-bearing for the gradient):
//  - RATING_SCALE: ln-prob units per logistic unit. Smaller = more lopsided favorites.
//  - DRAW_BASE: baseline draw rate for group games (~football average).
import { impliedProb } from "./odds";

const RATING_SCALE = 2.0;
const DRAW_BASE = 0.26;

/** Fallback strength when a team's odds string is missing/unparseable — decays by tier. */
function tierFallbackProb(tier: number): number {
  return 0.15 * Math.pow(0.62, Math.max(0, tier - 1));
}

/**
 * Map each team to a log-strength rating. Teams with parseable odds use their de-vigged
 * implied championship probability; the rest fall back to a tier-derived prior.
 */
export function buildRatings(
  tierByTeam: Map<number, number>,
  oddsByTeam: Map<number, string | null>,
): Map<number, number> {
  const ids = [...tierByTeam.keys()];
  const impliedById = new Map<number, number>();
  for (const id of ids) {
    const p = impliedProb(oddsByTeam.get(id));
    if (p != null) impliedById.set(id, p);
  }
  const oddsSum = [...impliedById.values()].reduce((a, b) => a + b, 0) || 1;

  const ratings = new Map<number, number>();
  for (const id of ids) {
    const p = impliedById.has(id)
      ? impliedById.get(id)! / oddsSum // de-vig over the teams that have odds
      : tierFallbackProb(tierByTeam.get(id) ?? 12);
    ratings.set(id, Math.log(Math.max(p, 1e-6)));
  }
  return ratings;
}

export interface MatchProbs {
  pHome: number;
  pDraw: number;
  pAway: number;
}

const logistic = (x: number) => 1 / (1 + Math.exp(-x));

/** Win/draw/loss probabilities for a group game from the two ratings. */
export function groupMatchProbs(ratingHome: number, ratingAway: number): MatchProbs {
  const pHomeExclDraw = logistic((ratingHome - ratingAway) / RATING_SCALE);
  const pDraw = DRAW_BASE;
  return { pHome: (1 - pDraw) * pHomeExclDraw, pDraw, pAway: (1 - pDraw) * (1 - pHomeExclDraw) };
}

/** Probability the home/first team advances from a knockout tie (no draws). */
export function knockoutWinProbHome(ratingHome: number, ratingAway: number): number {
  return logistic((ratingHome - ratingAway) / RATING_SCALE);
}
