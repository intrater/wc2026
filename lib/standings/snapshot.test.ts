import { describe, it, expect } from "vitest";
import { rankWithTies, movementFor } from "./snapshot";

function row(entryId: string, total: number, underdog = 0, upset = 0) {
  return { entryId, total, underdogTotal: underdog, upsetTotal: upset };
}

describe("rankWithTies", () => {
  it("ranks by total desc; exact ties share a rank and the next rank skips", () => {
    const ranked = rankWithTies([row("a", 10), row("b", 8), row("c", 8), row("d", 5)]);
    expect(ranked.map((r) => [r.entryId, r.rank])).toEqual([
      ["a", 1],
      ["b", 2],
      ["c", 2],
      ["d", 4],
    ]);
  });

  it("breaks total ties by underdog then upset (matches homepage SQL order)", () => {
    const ranked = rankWithTies([
      row("a", 8, 2, 0),
      row("b", 8, 4, 0), // higher underdog → ahead of a
      row("c", 8, 2, 3), // same underdog as a, higher upset → between b and a
    ]);
    expect(ranked.map((r) => r.entryId)).toEqual(["b", "c", "a"]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]); // not exact ties → distinct ranks
  });

  it("exact tie on all three fields shares the rank", () => {
    const ranked = rankWithTies([row("a", 8, 2, 1), row("b", 8, 2, 1), row("c", 7)]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 1, 3]);
  });
});

describe("movementFor", () => {
  it("computes climb and points gained", () => {
    expect(movementFor({ rank: 2, total: 12 }, { rank: 4, total: 6 })).toEqual({
      rankDelta: 2,
      pointsToday: 6,
      isNew: false,
    });
  });

  it("computes falls as negative deltas", () => {
    expect(movementFor({ rank: 5, total: 10 }, { rank: 3, total: 10 })).toEqual({
      rankDelta: -2,
      pointsToday: 0,
      isNew: false,
    });
  });

  it("no snapshot → NEW with null movement (unknown ≠ zero)", () => {
    expect(movementFor({ rank: 1, total: 4 }, null)).toEqual({
      rankDelta: null,
      pointsToday: null,
      isNew: true,
    });
  });
});
