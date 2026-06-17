import { describe, it, expect } from "vitest";
import {
  maxRemainingForTeam,
  computeExactOutlook,
  MAX_GOALS_PER_MATCH,
  type TeamFuture,
  type EntryState,
} from "./bounds";

function future(p: Partial<TeamFuture> = {}): TeamFuture {
  return { tier: 1, remainingGroupGames: 0, groupPlacementPending: false, knockoutAlive: false, ...p };
}

describe("maxRemainingForTeam", () => {
  it("is zero for a fully-finished, eliminated team", () => {
    expect(maxRemainingForTeam(future())).toBe(0);
  });

  it("counts the won-group bonus while the group is still open", () => {
    expect(maxRemainingForTeam(future({ groupPlacementPending: true }))).toBe(3); // GROUP_POINTS.winGroupBonus
  });

  it("counts a remaining group game as a max win for a tier-1 team (no goal/upset bonus)", () => {
    // tier 1: no goal bonus (tier<7), no upset (can't be underdog) → just the win (2)
    expect(maxRemainingForTeam(future({ tier: 1, remainingGroupGames: 1 }))).toBe(2);
  });

  it("adds goal + upset bonus for an underdog (tier >= 7) per remaining game", () => {
    // tier 9, 1 group game: win(2) + goalBonus(MAX_GOALS*1=5) + upset((9-1)*1=8) = 15
    const t = future({ tier: 9, remainingGroupGames: 1 });
    expect(maxRemainingForTeam(t)).toBe(2 + MAX_GOALS_PER_MATCH * 1 + 8);
  });

  it("adds a full knockout run when the team is still alive", () => {
    // tier 1, alive, no group games left: KO win sum 2+3+5+7+10 = 27 (no goal/upset for tier 1)
    expect(maxRemainingForTeam(future({ tier: 1, knockoutAlive: true }))).toBe(27);
  });

  it("over-estimates: an underdog winning the whole tournament", () => {
    // tier 12, 2 group games left + KO alive
    const t = future({ tier: 12, remainingGroupGames: 2, groupPlacementPending: true, knockoutAlive: true });
    const goal = MAX_GOALS_PER_MATCH; // tier>=7
    const upset = 11; // (12-1)*1
    const expected =
      3 + // won group
      2 * (2 + goal + upset) + // 2 group games
      (27 + 5 * (goal + upset)); // KO run
    expect(maxRemainingForTeam(t)).toBe(expected);
  });
});

describe("computeExactOutlook", () => {
  // helper: every team contributes `each` ceiling points
  const fut = (ids: number[], each: TeamFuture) => new Map(ids.map((id) => [id, each]));

  it("marks an entry no_shot when its ceiling can't reach the leader's banked total", () => {
    const entries: EntryState[] = [
      { entryId: "leader", currentTotal: 100, teamIds: [1] },
      { entryId: "dead", currentTotal: 10, teamIds: [2] },
    ];
    // team 2 can earn at most ~0 more → ceiling 10 < 100
    const out = computeExactOutlook(entries, fut([1, 2], future()));
    expect(out.find((o) => o.entryId === "dead")!.bucket).toBe("no_shot");
    // leader isn't no_shot
    expect(out.find((o) => o.entryId === "leader")!.bucket).not.toBe("no_shot");
  });

  it("does NOT eliminate on an exact tie of ceiling vs leader total", () => {
    const entries: EntryState[] = [
      { entryId: "leader", currentTotal: 50, teamIds: [1] },
      { entryId: "edge", currentTotal: 50, teamIds: [2] }, // ceiling exactly 50
    ];
    const out = computeExactOutlook(entries, fut([1, 2], future()));
    expect(out.find((o) => o.entryId === "edge")!.bucket).not.toBe("no_shot");
  });

  it("marks an entry clinched when its banked total beats every rival's ceiling", () => {
    const entries: EntryState[] = [
      { entryId: "champ", currentTotal: 100, teamIds: [1] }, // no future → ceiling 100
      { entryId: "a", currentTotal: 20, teamIds: [2] },
      { entryId: "b", currentTotal: 5, teamIds: [3] },
    ];
    // rivals can each earn a little, but nowhere near 100
    const out = computeExactOutlook(entries, fut([1, 2, 3], future({ remainingGroupGames: 1, tier: 1 })));
    expect(out.find((o) => o.entryId === "champ")!.bucket).toBe("clinched");
    expect(out.find((o) => o.entryId === "champ")!.clinched).toBe(true);
  });

  it("leaves a genuinely-open race as in_contention for everyone", () => {
    const entries: EntryState[] = [
      { entryId: "x", currentTotal: 30, teamIds: [1] },
      { entryId: "y", currentTotal: 28, teamIds: [2] },
    ];
    // both have lots of upside (alive underdogs) → nobody dead, nobody clinched
    const out = computeExactOutlook(entries, fut([1, 2], future({ tier: 9, knockoutAlive: true, remainingGroupGames: 2 })));
    expect(out.every((o) => o.bucket === "in_contention")).toBe(true);
  });
});
