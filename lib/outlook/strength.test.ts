import { describe, it, expect } from "vitest";
import { applyResultAdjustments, groupMatchProbs } from "./strength";

describe("applyResultAdjustments (Elo from results)", () => {
  it("downgrades a favorite that loses and upgrades the underdog, symmetrically", () => {
    const before = new Map([
      [1, 0],
      [2, -3],
    ]); // 1 strong, 2 weak
    const after = applyResultAdjustments(before, [{ homeTeamId: 1, awayTeamId: 2, winnerTeamId: 2 }]);
    expect(after.get(1)!).toBeLessThan(0); // favorite dropped
    expect(after.get(2)!).toBeGreaterThan(-3); // underdog rose
    expect(after.get(1)! - 0).toBeCloseTo(-(after.get(2)! + 3), 6); // zero-sum
  });

  it("barely moves an expected result", () => {
    const after = applyResultAdjustments(
      new Map([
        [1, 0],
        [2, -5],
      ]),
      [{ homeTeamId: 1, awayTeamId: 2, winnerTeamId: 1 }],
    );
    expect(Math.abs(after.get(1)!)).toBeLessThan(0.05); // expected win → negligible shift
  });

  it("a draw still nudges the favorite down toward parity", () => {
    const after = applyResultAdjustments(
      new Map([
        [1, 0],
        [2, -3],
      ]),
      [{ homeTeamId: 1, awayTeamId: 2, winnerTeamId: null }],
    );
    expect(after.get(1)!).toBeLessThan(0);
    expect(after.get(2)!).toBeGreaterThan(-3);
  });

  it("a downgraded favorite produces a lower future win probability", () => {
    const base = new Map([
      [1, 0],
      [2, -3],
    ]);
    const pBefore = groupMatchProbs(base.get(1)!, base.get(2)!).pHome;
    const after = applyResultAdjustments(base, [{ homeTeamId: 1, awayTeamId: 2, winnerTeamId: 2 }]);
    const pAfter = groupMatchProbs(after.get(1)!, after.get(2)!).pHome;
    expect(pAfter).toBeLessThan(pBefore);
  });
});
