import { describe, it, expect } from "vitest";
import { checkIntegrity, fingerprint, type AuditData } from "./audit";

/** A fully-healthy baseline; each test perturbs one thing. */
function healthy(): AuditData {
  return {
    scores: [{ entryId: "e1", total: 10 }],
    lineSumByEntry: new Map([["e1", 10]]),
    snapshotTotalByEntry: new Map([["e1", 8]]), // started lower today, climbed — fine
    groupMatches: [
      { fixtureId: 1, groupLabel: "A", homeTeamId: 1, awayTeamId: 2, homeGoals: 1, awayGoals: 0, winnerTeamId: 1 },
      { fixtureId: 2, groupLabel: "A", homeTeamId: 3, awayTeamId: 4, homeGoals: 2, awayGoals: 2, winnerTeamId: null },
    ],
    needsAttentionCount: 0,
    unmappedTerminalCount: 0,
    tierByTeam: new Map([[1, 1], [2, 2]]),
    tierRowsByTeam: new Map([[1, 1], [2, 1]]),
    picksByEntry: new Map(),
  };
}

describe("checkIntegrity", () => {
  it("reports no violations for healthy data", () => {
    expect(checkIntegrity(healthy())).toEqual([]);
  });

  it("flags score_lines that don't sum to the stored total", () => {
    const d = healthy();
    d.lineSumByEntry.set("e1", 9.5);
    expect(checkIntegrity(d).map((v) => v.code)).toContain("lines_sum_mismatch");
  });

  it("MONOTONICITY CANARY: flags a total that fell below today's snapshot", () => {
    // The exact 2026-06-20 signature: snapshot 40.5, live 37.5.
    const d = healthy();
    d.scores = [{ entryId: "e1", total: 37.5 }];
    d.lineSumByEntry = new Map([["e1", 37.5]]);
    d.snapshotTotalByEntry = new Map([["e1", 40.5]]);
    expect(checkIntegrity(d).map((v) => v.code)).toContain("total_below_snapshot");
  });

  it("flags a non-letter group label (the 'Stage' bug)", () => {
    const d = healthy();
    d.groupMatches[0].groupLabel = "Stage";
    expect(checkIntegrity(d).map((v) => v.code)).toContain("bad_group_label");
  });

  it("flags an over-full group", () => {
    const d = healthy();
    for (let i = 10; i < 17; i++)
      d.groupMatches.push({ fixtureId: i, groupLabel: "B", homeTeamId: i, awayTeamId: i + 100, homeGoals: 0, awayGoals: 0, winnerTeamId: null });
    expect(checkIntegrity(d).map((v) => v.code)).toContain("group_overfull");
  });

  it("flags a duplicated matchup", () => {
    const d = healthy();
    d.groupMatches.push({ fixtureId: 99, groupLabel: "A", homeTeamId: 2, awayTeamId: 1, homeGoals: 0, awayGoals: 1, winnerTeamId: 1 });
    expect(checkIntegrity(d).map((v) => v.code)).toContain("duplicate_matchup");
  });

  it("flags winner_team_id inconsistent with goals", () => {
    const d = healthy();
    d.groupMatches[1].winnerTeamId = 3; // 2-2 draw but a winner is set
    expect(checkIntegrity(d).map((v) => v.code)).toContain("winner_goals_mismatch");
  });

  it("flags unscored terminal matches and needs_attention", () => {
    const d = healthy();
    d.unmappedTerminalCount = 1;
    d.needsAttentionCount = 2;
    const codes = checkIntegrity(d).map((v) => v.code);
    expect(codes).toContain("unscored_terminal_matches");
    expect(codes).toContain("needs_attention");
  });

  it("flags a team in more than one tier", () => {
    const d = healthy();
    d.tierRowsByTeam.set(1, 2);
    expect(checkIntegrity(d).map((v) => v.code)).toContain("team_tier_count");
  });

  it("flags pick/tier structural problems", () => {
    const d = healthy();
    d.tierByTeam = new Map([[50, 3]]);
    d.picksByEntry = new Map([["e1", [{ tierNo: 1, teamId: 50 }]]]); // wrong tier + incomplete
    const codes = checkIntegrity(d).map((v) => v.code);
    expect(codes).toContain("pick_tier_structure");
    expect(codes).toContain("pick_tier_mismatch");
  });
});

describe("fingerprint", () => {
  it("is the sorted distinct code set (stable across order/duplication)", () => {
    expect(
      fingerprint([
        { code: "b", message: "" },
        { code: "a", message: "" },
        { code: "a", message: "" },
      ]),
    ).toBe("a,b");
    expect(fingerprint([])).toBe("");
  });
});
