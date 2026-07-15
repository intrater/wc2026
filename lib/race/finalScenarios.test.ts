import { describe, it, expect } from "vitest";
import { buildFinalScenarios, type FinalScenariosInput } from "./finalScenarios";
import type { ScoringInput, ScoringMatch } from "@/lib/scoring/engine";

// Teams: 1 (T1) and 2 (T2) contest the final; 3 and 4 (both T1) the third-place game.
// Teams 10-13 played two terminal group games to spread the banked totals.
const TIERS: [number, number][] = [
  [1, 1], [2, 2], [3, 1], [4, 1],
  [10, 3], [11, 3], [12, 4], [13, 4],
];

const groupWin = (fid: number, home: number, away: number): ScoringMatch => ({
  fixtureId: fid,
  stage: "group",
  groupLabel: "X",
  homeTeamId: home,
  awayTeamId: away,
  homeGoals: 1,
  awayGoals: 0,
  winnerTeamId: home,
  decidedBy: "regulation",
  isTerminal: true,
});

function makeInput(overrides?: Partial<FinalScenariosInput>): FinalScenariosInput {
  const scoring: ScoringInput = {
    tierByTeam: new Map(TIERS),
    entries: [{ id: "A" }, { id: "B" }, { id: "C" }, { id: "D" }],
    picksByEntry: new Map([
      ["A", [1, 10, 12]], // banked 4 (two group wins)
      ["B", [2, 10]], // banked 2
      ["C", [1, 2]], // banked 0, owns both finalists
      ["D", [13]], // banked 0
    ]),
    matches: [groupWin(1, 10, 11), groupWin(2, 12, 13)],
  };
  return {
    scoring,
    remaining: [
      { stage: "third_place", homeTeamId: 3, awayTeamId: 4 },
      { stage: "final", homeTeamId: 1, awayTeamId: 2 },
    ],
    nameByEntry: new Map([["A", "Alice"], ["B", "Bob"], ["C", "Cara"], ["D", "Dev"]]),
    teamMeta: new Map([
      [1, { name: "Spainia", flag: "🇪🇸", tier: 1 }],
      [2, { name: "Argentia", flag: "🇦🇷", tier: 2 }],
      [3, { name: "Francia", flag: "🇫🇷", tier: 1 }],
      [4, { name: "Anglia", flag: "🏴", tier: 1 }],
    ]),
    championPrize: "$100",
    runnerUpPrize: "$50",
    ...overrides,
  };
}

describe("buildFinalScenarios", () => {
  it("enumerates both final outcomes exactly, independent of the third-place game", () => {
    const out = buildFinalScenarios(makeInput());
    expect(out).not.toBeNull();
    expect(out!.thirdPlaceGameIrrelevant).toBe(true);
    expect(out!.scenarios).toHaveLength(2);

    // Team 1 (T1) wins: +10 to owners → Alice 14, Cara 10, Bob 2, Dev 0.
    const s1 = out!.scenarios[0];
    expect(s1.winner.name).toBe("Spainia");
    expect(s1.champion).toEqual({ name: "Alice", total: 14, prize: "$100" });
    expect(s1.runnerUp).toEqual({ name: "Cara", total: 10, prize: "$50" });
    expect(s1.split).toBe(false);

    // Team 2 (T2) wins: +10 +1 upset → Bob 13, Cara 11, Alice 4, Dev 0.
    const s2 = out!.scenarios[1];
    expect(s2.winner.name).toBe("Argentia");
    expect(s2.champion).toEqual({ name: "Bob", total: 13, prize: "$100" });
    expect(s2.runnerUp).toEqual({ name: "Cara", total: 11, prize: "$50" });
    expect(s2.split).toBe(false);
  });

  it("works when only the final remains", () => {
    const out = buildFinalScenarios(
      makeInput({ remaining: [{ stage: "final", homeTeamId: 1, awayTeamId: 2 }] }),
    );
    expect(out).not.toBeNull();
    expect(out!.thirdPlaceGameIrrelevant).toBe(false);
    expect(out!.scenarios.map((s) => s.champion.name)).toEqual(["Alice", "Bob"]);
  });

  it("returns null while earlier rounds are still unplayed", () => {
    const input = makeInput();
    input.remaining.push({ stage: "sf", homeTeamId: 3, awayTeamId: 4 });
    expect(buildFinalScenarios(input)).toBeNull();
  });

  it("returns null when no final is pending", () => {
    expect(
      buildFinalScenarios(makeInput({ remaining: [{ stage: "third_place", homeTeamId: 3, awayTeamId: 4 }] })),
    ).toBeNull();
  });

  it("returns null when a goal-bonus-eligible team is still playing (scoreline could matter)", () => {
    const input = makeInput();
    input.scoring.tierByTeam.set(2, 7); // finalist now earns goal bonuses → not winner-determined
    expect(buildFinalScenarios(input)).toBeNull();
  });

  it("returns null when the third-place game can still change the money", () => {
    const input = makeInput();
    // Make team 4 a low tier (but below goal-bonus): a win over T1 pays +5 upset to Dev, who
    // banks enough that the runner-up flips with the third-place result (if team 1 wins the
    // final: Alice 16 + Cara 10 vs Alice 16 + Dev 11) → not winner-determined → null.
    input.scoring.tierByTeam.set(4, 6);
    input.scoring.matches.push(groupWin(3, 10, 13));
    input.scoring.picksByEntry.set("D", [4, 10, 12]); // banked 6, +5 upset if team 4 wins
    expect(buildFinalScenarios(input)).toBeNull();
  });

  it("returns null on an ambiguous runner-up tie, flags an exact tie at the top as a split", () => {
    // A and B have identical rosters → exactly tied in every branch. With nobody between
    // them and Cara, the team-2-wins branch has an ambiguous runner-up tie → null overall.
    const scoring: ScoringInput = {
      tierByTeam: new Map(TIERS),
      entries: [{ id: "A" }, { id: "B" }, { id: "C" }],
      picksByEntry: new Map([
        ["A", [1]],
        ["B", [1]],
        ["C", [2, 10, 12]], // banked 4
      ]),
      matches: [groupWin(1, 10, 11), groupWin(2, 12, 13)],
    };
    expect(buildFinalScenarios(makeInput({ scoring }))).toBeNull();

    // Add Dev (banked 4) between the tied pair and the money in the team-2 branch:
    //   team 1 wins → Alice 10 = Bob 10 (exact tie at the top → split), Cara 4, Dev 4.
    //   team 2 wins → Cara 15, Dev 4 (clean runner-up), Alice 0, Bob 0.
    scoring.entries = [...scoring.entries, { id: "D" }];
    scoring.picksByEntry.set("D", [10, 12]);
    const out = buildFinalScenarios(makeInput({ scoring }));
    expect(out).not.toBeNull();
    const s1 = out!.scenarios[0];
    expect(s1.split).toBe(true);
    expect([s1.champion.name, s1.runnerUp.name].sort()).toEqual(["Alice", "Bob"]);
    const s2 = out!.scenarios[1];
    expect(s2.split).toBe(false);
    expect(s2.champion.name).toBe("Cara");
    expect(s2.runnerUp.name).toBe("Dev");
  });
});
