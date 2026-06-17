// Single-elimination knockout simulation from the 32 qualifiers. We DON'T reproduce FIFA's
// exact Annex-C slotting (invisible at bucket resolution, and the real bracket is published
// once groups end — see the plan). Instead we re-seed survivors by strength each round and
// pair strongest-vs-weakest, which makes stronger teams go deeper, the only thing that moves
// win-share. Synthetic negative fixture ids avoid clashing with real ones.
import type { ScoringMatch } from "@/lib/scoring/engine";
import { sampleKnockoutMatch } from "./match";

const STAGE_BY_SIZE: Record<number, ScoringMatch["stage"]> = {
  32: "r32",
  16: "r16",
  8: "qf",
  4: "sf",
  2: "final",
};

export function simulateBracket(
  qualifiers: number[],
  ratings: Map<number, number>,
  rng: () => number,
): ScoringMatch[] {
  const rating = (id: number) => ratings.get(id) ?? -99;
  const out: ScoringMatch[] = [];
  let fixtureId = -1;
  let round = [...qualifiers];
  const semifinalLosers: number[] = [];

  while (round.length >= 2 && STAGE_BY_SIZE[round.length]) {
    const stage = STAGE_BY_SIZE[round.length];
    round.sort((a, b) => rating(b) - rating(a)); // re-seed: strongest first
    const winners: number[] = [];
    const n = round.length;
    for (let i = 0; i < n / 2; i++) {
      const home = round[i];
      const away = round[n - 1 - i];
      const m = sampleKnockoutMatch(fixtureId--, stage, home, away, rating(home), rating(away), rng);
      out.push(m);
      winners.push(m.winnerTeamId!);
      if (stage === "sf") semifinalLosers.push(m.winnerTeamId === home ? away : home);
    }
    round = winners;
  }

  if (semifinalLosers.length === 2) {
    out.push(
      sampleKnockoutMatch(
        fixtureId--,
        "third_place",
        semifinalLosers[0],
        semifinalLosers[1],
        rating(semifinalLosers[0]),
        rating(semifinalLosers[1]),
        rng,
      ),
    );
  }
  return out;
}
