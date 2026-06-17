// The Monte Carlo loop. Each "world" completes the tournament from the current real results,
// scores ALL entries with the real engine (so shared-team correlation is handled for free),
// and credits the 1st-place finisher(s). Exact ties at the top split the credit, mirroring
// real prize-splitting. Returns each entry's win share = P(finish 1st).
import {
  recompute,
  computeGroupPlacement,
  compareForLeaderboard,
  type ScoringMatch,
} from "@/lib/scoring/engine";
import { mulberry32 } from "./rng";
import { sampleGroupMatch } from "./match";
import { simulateBracket } from "./bracket";

export interface RemainingGroupFixture {
  fixtureId: number;
  groupLabel: string | null;
  homeTeamId: number;
  awayTeamId: number;
  // Live de-vigged 1X2 from the market, when available — overrides strength for this fixture.
  odds?: { pHome: number; pDraw: number; pAway: number };
}

export interface SimInput {
  tierByTeam: Map<number, number>;
  entries: { id: string }[];
  picksByEntry: Map<string, number[]>;
  terminalMatches: ScoringMatch[]; // already-decided results (fixed across worlds)
  remainingGroupFixtures: RemainingGroupFixture[];
  ratings: Map<number, number>;
}

export function simulateWinShares(input: SimInput, nSims: number, seed: number): Map<string, number> {
  const credit = new Map<string, number>();
  for (const e of input.entries) credit.set(e.id, 0);
  if (input.entries.length === 0 || nSims <= 0) return credit;

  const rate = (id: number) => input.ratings.get(id) ?? -99;

  for (let s = 0; s < nSims; s++) {
    const rng = mulberry32((seed + s * 0x9e3779b1) >>> 0);
    const matches: ScoringMatch[] = [...input.terminalMatches];

    for (const f of input.remainingGroupFixtures) {
      matches.push(
        sampleGroupMatch(f.fixtureId, f.groupLabel, f.homeTeamId, f.awayTeamId, rate(f.homeTeamId), rate(f.awayTeamId), rng, f.odds),
      );
    }

    const placement = computeGroupPlacement(matches);
    const qualifiers = [...placement.winners, ...placement.runnersUp, ...placement.bestThirds];
    matches.push(...simulateBracket(qualifiers, input.ratings, rng));

    const scores = recompute({
      tierByTeam: input.tierByTeam,
      entries: input.entries,
      picksByEntry: input.picksByEntry,
      matches,
    }).scores;
    if (scores.length === 0) continue;

    scores.sort(compareForLeaderboard);
    const top = scores[0];
    let tied = 0;
    for (const sc of scores) {
      if (compareForLeaderboard(sc, top) === 0) tied++;
      else break;
    }
    const share = 1 / tied;
    for (let i = 0; i < tied; i++) {
      credit.set(scores[i].entryId, (credit.get(scores[i].entryId) ?? 0) + share);
    }
  }

  const winShares = new Map<string, number>();
  for (const [id, c] of credit) winShares.set(id, c / nSims);
  return winShares;
}
