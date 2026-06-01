import { describe, it, expect } from "vitest";
import {
  recompute,
  computeGroupPlacement,
  compareForLeaderboard,
  type ScoringMatch,
  type ScoringInput,
} from "./engine";
import type { MatchStage, MatchDecidedBy } from "@/lib/db/types";

// ---------- fixture helpers ----------
let fid = 1;
function match(p: Partial<ScoringMatch> & { homeTeamId: number; awayTeamId: number; homeGoals: number; awayGoals: number }): ScoringMatch {
  const stage: MatchStage = p.stage ?? "group";
  let winnerTeamId = p.winnerTeamId;
  if (winnerTeamId === undefined) {
    // infer winner from goals for convenience (group draws → null)
    if (p.homeGoals > p.awayGoals) winnerTeamId = p.homeTeamId;
    else if (p.homeGoals < p.awayGoals) winnerTeamId = p.awayTeamId;
    else winnerTeamId = null;
  }
  return {
    fixtureId: p.fixtureId ?? fid++,
    stage,
    groupLabel: p.groupLabel ?? (stage === "group" ? "A" : null),
    homeTeamId: p.homeTeamId,
    awayTeamId: p.awayTeamId,
    homeGoals: p.homeGoals,
    awayGoals: p.awayGoals,
    winnerTeamId,
    decidedBy: p.decidedBy ?? ("regulation" as MatchDecidedBy),
    isTerminal: p.isTerminal ?? true,
  };
}

function input(opts: {
  tiers: Record<number, number>;
  picks: Record<string, number[]>;
  matches: ScoringMatch[];
}): ScoringInput {
  return {
    tierByTeam: new Map(Object.entries(opts.tiers).map(([k, v]) => [Number(k), v])),
    entries: Object.keys(opts.picks).map((id) => ({ id })),
    picksByEntry: new Map(Object.entries(opts.picks)),
    matches: opts.matches,
  };
}

const totalFor = (r: ReturnType<typeof recompute>, entryId: string) =>
  r.scores.find((s) => s.entryId === entryId)!.total;

describe("group-stage result points", () => {
  it("awards 2 for a win, 1 each for a draw", () => {
    const r = recompute(input({
      tiers: { 1: 1, 2: 1, 3: 1 },
      picks: { e: [1], f: [2], g: [3] },
      matches: [
        match({ homeTeamId: 1, awayTeamId: 2, homeGoals: 2, awayGoals: 0 }), // 1 beats 2
        match({ homeTeamId: 3, awayTeamId: 1, homeGoals: 1, awayGoals: 1 }), // 3 draws 1
      ],
    }));
    expect(totalFor(r, "e")).toBe(2 + 1); // win + draw
    expect(totalFor(r, "f")).toBe(0); // loss
    expect(totalFor(r, "g")).toBe(1); // draw
  });
});

// Build a complete 12-group round-robin. In every group: t1 wins all (1st),
// t2 second, t3 third (one win vs t4), t4 last. The third-place team's goal
// difference grows with the group index so thirds rank deterministically.
function buildTwelveGroups(): ScoringMatch[] {
  const matches: ScoringMatch[] = [];
  "ABCDEFGHIJKL".split("").forEach((g, i) => {
    const base = i * 4;
    const t1 = base + 1, t2 = base + 2, t3 = base + 3, t4 = base + 4;
    matches.push(
      match({ groupLabel: g, homeTeamId: t1, awayTeamId: t2, homeGoals: 1, awayGoals: 0 }),
      match({ groupLabel: g, homeTeamId: t1, awayTeamId: t3, homeGoals: 1, awayGoals: 0 }),
      match({ groupLabel: g, homeTeamId: t1, awayTeamId: t4, homeGoals: 1, awayGoals: 0 }),
      match({ groupLabel: g, homeTeamId: t2, awayTeamId: t3, homeGoals: 1, awayGoals: 0 }),
      match({ groupLabel: g, homeTeamId: t2, awayTeamId: t4, homeGoals: 1, awayGoals: 0 }),
      match({ groupLabel: g, homeTeamId: t3, awayTeamId: t4, homeGoals: i + 1, awayGoals: 0 }),
    );
  });
  return matches;
}

describe("group placement bonuses (complete groups)", () => {
  const allTiers: Record<number, number> = {};
  for (let t = 1; t <= 48; t++) allTiers[t] = 1; // all favorites, isolate placement math

  it("group winner gets +3 (not the +1 advance bonus)", () => {
    const r = recompute(input({ tiers: allTiers, picks: { winner: [1] }, matches: buildTwelveGroups() }));
    // team1: 3 wins (6) + won-group (3) = 9
    expect(totalFor(r, "winner")).toBe(9);
    const groupLine = r.lines.find((l) => l.entryId === "winner" && l.category === "group");
    expect(groupLine?.label).toBe("Won group");
    expect(groupLine?.points).toBe(3);
  });

  it("runner-up gets the +1 advance bonus", () => {
    const r = recompute(input({ tiers: allTiers, picks: { ru: [2] }, matches: buildTwelveGroups() }));
    // team2: 2 wins (4) + advance (1) = 5
    expect(totalFor(r, "ru")).toBe(5);
  });

  it("non-qualifying 3rd place gets no advance bonus", () => {
    // team3 is group A's third (lowest GD of all thirds) → does not make the best 8
    const r = recompute(input({ tiers: allTiers, picks: { third: [3] }, matches: buildTwelveGroups() }));
    // team3: one win (2), no advance bonus
    expect(totalFor(r, "third")).toBe(2);
  });

  it("does not award placement bonuses until a group is complete", () => {
    const r = recompute(input({
      tiers: { 1: 1, 2: 1 },
      picks: { e: [1] },
      matches: [match({ homeTeamId: 1, awayTeamId: 2, homeGoals: 1, awayGoals: 0 })], // 1 of 6 group A matches
    }));
    expect(totalFor(r, "e")).toBe(2); // win only, no premature "won group"
  });
});

describe("best third-placed teams (8 of 12 advance)", () => {
  it("ranks third-place teams across groups and advances the top 8", () => {
    const placement = computeGroupPlacement(buildTwelveGroups());
    // all 12 thirds have equal points (one win = 2); they rank by GD (i+1), so the 8 highest advance
    expect(placement.bestThirds.size).toBe(8);
    // group L (i=11) third = team 47 advances; group A (i=0) third = team 3 does not
    expect(placement.bestThirds.has(47)).toBe(true);
    expect(placement.bestThirds.has(3)).toBe(false);
  });
});

describe("knockout ladder", () => {
  it("awards escalating points by round to the winner only", () => {
    const r = recompute(input({
      tiers: { 1: 1, 2: 1 },
      picks: { champ: [1], loser: [2] },
      matches: [
        match({ stage: "r32", homeTeamId: 1, awayTeamId: 2, homeGoals: 1, awayGoals: 0 }),
        match({ stage: "r16", homeTeamId: 1, awayTeamId: 2, homeGoals: 1, awayGoals: 0 }),
        match({ stage: "qf", homeTeamId: 1, awayTeamId: 2, homeGoals: 1, awayGoals: 0 }),
        match({ stage: "sf", homeTeamId: 1, awayTeamId: 2, homeGoals: 1, awayGoals: 0 }),
        match({ stage: "final", homeTeamId: 1, awayTeamId: 2, homeGoals: 1, awayGoals: 0 }),
      ],
    }));
    expect(totalFor(r, "champ")).toBe(2 + 3 + 5 + 7 + 10); // 27
    expect(totalFor(r, "loser")).toBe(0);
  });

  it("shootout winner gets the round win points (loser nothing)", () => {
    const r = recompute(input({
      tiers: { 1: 1, 2: 1 },
      picks: { adv: [1], out: [2] },
      matches: [
        // drawn after ET, team 1 advances on penalties
        match({ stage: "qf", homeTeamId: 1, awayTeamId: 2, homeGoals: 1, awayGoals: 1, winnerTeamId: 1, decidedBy: "penalties" }),
      ],
    }));
    expect(totalFor(r, "adv")).toBe(5); // QF win
    expect(totalFor(r, "out")).toBe(0);
  });

  it("third-place playoff yields no round points (but goals still count for underdogs)", () => {
    const r = recompute(input({
      tiers: { 1: 1, 9: 9 },
      picks: { fav: [1], dog: [9] },
      matches: [
        match({ stage: "third_place", groupLabel: null, homeTeamId: 9, awayTeamId: 1, homeGoals: 2, awayGoals: 1, winnerTeamId: 9 }),
      ],
    }));
    expect(totalFor(r, "fav")).toBe(0); // no ladder slot, favorite gets nothing
    // dog (tier 9): no round points, but 2 goals * 1 = 2, plus upset win gap (9-1)=8
    expect(totalFor(r, "dog")).toBe(2 + 8);
  });
});

describe("goal bonus (tiers 7-12 only)", () => {
  it("awards +1 per goal to a tier 7-12 team, nothing to tiers 1-6", () => {
    const r = recompute(input({
      tiers: { 10: 10, 3: 3 },
      picks: { dog: [10], fav: [3] },
      matches: [
        match({ homeTeamId: 10, awayTeamId: 99, homeGoals: 3, awayGoals: 4 }), // dog scores 3, loses
        match({ homeTeamId: 3, awayTeamId: 98, homeGoals: 3, awayGoals: 0 }), // fav scores 3, wins
      ],
    }));
    // dog: lost (0 result) + 3 goal bonus + upset? opp 99 has no tier → no upset = 3
    expect(totalFor(r, "dog")).toBe(3);
    // fav: win (2) + no goal bonus (tier 3) ; opp 98 no tier → 2
    expect(totalFor(r, "fav")).toBe(2);
  });

  it("counts extra-time goals (homeGoals includes reg+ET)", () => {
    const r = recompute(input({
      tiers: { 8: 8, 1: 1 },
      picks: { dog: [8] },
      matches: [
        match({ stage: "r16", homeTeamId: 8, awayTeamId: 1, homeGoals: 2, awayGoals: 1, winnerTeamId: 8, decidedBy: "extra_time" }),
      ],
    }));
    // r16 win (3) + 2 goals (2) + upset gap (8-1=7) = 12
    expect(totalFor(r, "dog")).toBe(3 + 2 + 7);
  });
});

describe("upset bonus", () => {
  it("stacks on knockout round points: tier 10 beats tier 3 in R16 = 3 + 7", () => {
    const r = recompute(input({
      tiers: { 10: 10, 3: 3 },
      picks: { dog: [10] },
      matches: [
        match({ stage: "r16", homeTeamId: 10, awayTeamId: 3, homeGoals: 1, awayGoals: 0 }),
      ],
    }));
    // r16 win 3 + goal bonus 1 (tier 10 scored 1) + upset gap (10-3=7) = 11
    expect(totalFor(r, "dog")).toBe(3 + 1 + 7);
  });

  it("favorite beating a lower tier earns no upset bonus", () => {
    const r = recompute(input({
      tiers: { 2: 2, 9: 9 },
      picks: { fav: [2] },
      matches: [match({ homeTeamId: 2, awayTeamId: 9, homeGoals: 1, awayGoals: 0 })],
    }));
    expect(totalFor(r, "fav")).toBe(2); // win only, no upset
  });

  it("draw vs a higher tier gives +0.5 per tier gap", () => {
    const r = recompute(input({
      tiers: { 8: 8, 2: 2 },
      picks: { dog: [8] },
      matches: [match({ homeTeamId: 8, awayTeamId: 2, homeGoals: 0, awayGoals: 0 })],
    }));
    // draw 1 + goal bonus 0 + upset draw (8-2=6)*0.5 = 3 → 1 + 3 = 4
    expect(totalFor(r, "dog")).toBe(1 + 3);
  });
});

describe("owning both teams in one match", () => {
  it("sums each team's points independently", () => {
    const r = recompute(input({
      tiers: { 3: 3, 9: 9 },
      picks: { both: [3, 9] }, // owns both teams in a knockout match
      matches: [match({ stage: "r16", homeTeamId: 9, awayTeamId: 3, homeGoals: 1, awayGoals: 0 })], // tier 9 beats tier 3
    }));
    // tier 9: R16 win 3 + goal 1 + upset (9-3=6) = 10 ; tier 3: loss 0 → total 10
    expect(totalFor(r, "both")).toBe(10);
  });
});

describe("idempotency & revision", () => {
  const base = () => input({
    tiers: { 1: 1, 2: 1 },
    picks: { e: [1] },
    matches: [match({ fixtureId: 100, homeTeamId: 1, awayTeamId: 2, homeGoals: 2, awayGoals: 1 })],
  });

  it("produces identical output when run twice", () => {
    const a = recompute(base());
    const b = recompute(base());
    expect(b.scores).toEqual(a.scores);
  });

  it("recompute reflects a downward goal revision with no residue", () => {
    const dog = input({
      tiers: { 9: 9, 1: 1 },
      picks: { d: [9] },
      matches: [match({ fixtureId: 100, homeTeamId: 9, awayTeamId: 1, homeGoals: 3, awayGoals: 0 })],
    });
    const before = recompute(dog);
    // VAR disallows 2 goals → now 1-0
    dog.matches[0].homeGoals = 1;
    const after = recompute(dog);
    // before: win2 + 3 goals + upset(8) = 13 ; after: win2 + 1 goal + upset(8) = 11
    expect(totalFor(before, "d")).toBe(13);
    expect(totalFor(after, "d")).toBe(11);
  });
});

describe("leaderboard ordering", () => {
  it("breaks ties by underdog points, then upset points", () => {
    const a = { entryId: "a", total: 50, groupStageTotal: 0, underdogTotal: 10, upsetTotal: 3 };
    const b = { entryId: "b", total: 50, groupStageTotal: 0, underdogTotal: 20, upsetTotal: 1 };
    const c = { entryId: "c", total: 50, groupStageTotal: 0, underdogTotal: 20, upsetTotal: 5 };
    const sorted = [a, b, c].sort(compareForLeaderboard).map((s) => s.entryId);
    expect(sorted).toEqual(["c", "b", "a"]); // c & b lead on underdog (20); c wins on upset
  });
});
