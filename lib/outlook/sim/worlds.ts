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
import { playFixedBracket, type AssignedTie } from "./bracket2026";

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
  // Once the group stage is over and the real bracket is published: the 16 R32 ties in
  // slot order, plus already-played knockout results (pairKey → winner). When present, the
  // sim plays the REAL bracket instead of strength-reseeding qualifiers.
  realR32?: AssignedTie[];
  terminalWinnerByPair?: Map<string, number>;
}

export interface SimShares {
  winShares: Map<string, number>; // P(finish 1st) — the champion prize
  moneyShares: Map<string, number>; // P(finish top 2) — champion OR runner-up, i.e. "in the money"
}

/** How many overall places pay out (champion + runner-up). Group-stage prizes are separate. */
const MONEY_PLACES = 2;

export function simulateWinShares(input: SimInput, nSims: number, seed: number): SimShares {
  const credit = new Map<string, number>();
  const moneyCredit = new Map<string, number>();
  for (const e of input.entries) {
    credit.set(e.id, 0);
    moneyCredit.set(e.id, 0);
  }
  if (input.entries.length === 0 || nSims <= 0) {
    return { winShares: credit, moneyShares: moneyCredit };
  }

  const rate = (id: number) => input.ratings.get(id) ?? -99;

  for (let s = 0; s < nSims; s++) {
    const rng = mulberry32((seed + s * 0x9e3779b1) >>> 0);
    const matches: ScoringMatch[] = [...input.terminalMatches];

    for (const f of input.remainingGroupFixtures) {
      matches.push(
        sampleGroupMatch(f.fixtureId, f.groupLabel, f.homeTeamId, f.awayTeamId, rate(f.homeTeamId), rate(f.awayTeamId), rng, f.odds),
      );
    }

    if (input.realR32) {
      // Group stage done + bracket drawn → play the REAL fixed bracket (played games use
      // their actual result; unplayed games are sampled). No qualifier re-seeding.
      matches.push(...playFixedBracket(input.realR32, input.ratings, rng, input.terminalWinnerByPair));
    } else {
      // Pre-bracket fallback: complete the groups and seed a strength-ordered bracket.
      const placement = computeGroupPlacement(matches);
      const qualifiers = [...placement.winners, ...placement.runnersUp, ...placement.bestThirds];
      matches.push(...simulateBracket(qualifiers, input.ratings, rng));
    }

    const scores = recompute({
      tierByTeam: input.tierByTeam,
      entries: input.entries,
      picksByEntry: input.picksByEntry,
      matches,
    }).scores;
    if (scores.length === 0) continue;

    scores.sort(compareForLeaderboard);

    // Champion credit: split 1 slot across a tie at the very top (mirrors prize-splitting).
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

    // Money credit: distribute MONEY_PLACES slots (champion + runner-up) down the sorted
    // board, group by group. A tie straddling the cutline splits the remaining slots
    // fractionally, so the per-world credit always sums to exactly MONEY_PLACES.
    let slots = MONEY_PLACES;
    for (let i = 0; i < scores.length && slots > 0; ) {
      let j = i + 1;
      while (j < scores.length && compareForLeaderboard(scores[j], scores[i]) === 0) j++;
      const groupSize = j - i;
      const perMember = Math.min(1, slots / groupSize);
      for (let k = i; k < j; k++) {
        moneyCredit.set(scores[k].entryId, (moneyCredit.get(scores[k].entryId) ?? 0) + perMember);
      }
      slots -= groupSize;
      i = j;
    }
  }

  const winShares = new Map<string, number>();
  const moneyShares = new Map<string, number>();
  for (const [id, c] of credit) winShares.set(id, c / nSims);
  for (const [id, c] of moneyCredit) moneyShares.set(id, c / nSims);
  return { winShares, moneyShares };
}
