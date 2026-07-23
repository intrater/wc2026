import { describe, it, expect } from "vitest";
import { buildFinishRace, type FinishRaceInput } from "./finish";

const team = (name: string, flag: string, tier: number) => ({ name, flag, tier });

function baseInput(overrides: Partial<FinishRaceInput> = {}): FinishRaceInput {
  const teamMap = new Map<number, { name: string; flag: string; tier: number | null }>([
    [1, team("France", "🇫🇷", 1)],
    [2, team("Argentina", "🇦🇷", 2)],
    [3, team("Belgium", "🇧🇪", 3)],
    [4, team("Morocco", "🇲🇦", 4)],
    [5, team("Switzerland", "🇨🇭", 4)],
  ]);
  return {
    entries: [
      { entryId: "miller", name: "Miller I.", total: 123, moneyShare: 0.30, winShare: 0.03 },
      { entryId: "michael", name: "Michael C.", total: 122, moneyShare: 0.55, winShare: 0.36 },
      { entryId: "charlie", name: "Charlie F.", total: 122, moneyShare: 0.45, winShare: 0.17 },
      { entryId: "zach", name: "Zach F.", total: 113, moneyShare: 0.40, winShare: 0.24 },
      { entryId: "cooper", name: "Cooper B.", total: 87.5, moneyShare: 0.0, winShare: 0.0 },
    ],
    picksByEntry: new Map([
      ["miller", [1, 4]],
      ["michael", [1, 2, 3]],
      ["charlie", [1, 5]],
      ["zach", [2, 3, 4]],
      ["cooper", [2]],
    ]),
    aliveTeams: new Set([1, 2, 3, 4, 5]),
    teamMap,
    groupWinner: "Charlie F.",
    groupRunnerUp: "Michael C.",
    ...overrides,
  };
}

describe("buildFinishRace", () => {
  it("orders contenders by money odds, not points", () => {
    const r = buildFinishRace(baseInput());
    expect(r.contenders[0].name).toBe("Michael C."); // 55% money, though 2nd on points
    expect(r.contenders[0].rank).toBe(2); // rank badge reflects the points board
    expect(r.contenders.map((c) => c.name)).not.toContain("Cooper B."); // 0% drops off
  });

  it("surfaces each contender's still-alive teams, strongest tier first", () => {
    const r = buildFinishRace(baseInput());
    const michael = r.contenders.find((c) => c.name === "Michael C.")!;
    expect(michael.aliveTeams.map((t) => t.name)).toEqual(["France", "Argentina", "Belgium"]);
  });

  it("flags contenders who already banked a group-stage prize", () => {
    const r = buildFinishRace(baseInput());
    expect(r.contenders.find((c) => c.name === "Charlie F.")!.bankedGroupPrize).toBe(true);
    expect(r.contenders.find((c) => c.name === "Miller I.")!.bankedGroupPrize).toBe(false);
  });

  it("counts only entries above the contention threshold", () => {
    const r = buildFinishRace(baseInput());
    expect(r.inContention).toBe(4); // Cooper (0%) excluded
    expect(r.aliveCount).toBe(5);
  });

  it("who-to-watch flags the leader/favorite split", () => {
    const r = buildFinishRace(baseInput());
    // Miller leads on points (123) but Michael is the money favorite (55%).
    expect(r.whoToWatch).toContain("Miller");
    expect(r.whoToWatch).toContain("Michael");
    expect(r.whoToWatch.toLowerCase()).toContain("points");
  });

  it("who-to-watch announces a near-clinch", () => {
    const input = baseInput();
    input.entries = input.entries.map((e) =>
      e.entryId === "michael" ? { ...e, winShare: 0.9, moneyShare: 0.98 } : e,
    );
    const r = buildFinishRace(input);
    expect(r.whoToWatch.toLowerCase()).toContain("locked");
  });

  it("who-to-watch calls out a lurker when the leader is also the favorite", () => {
    const input = baseInput();
    // Make Miller both the leader and the money favorite, and Zach a deep-roster lurker.
    input.entries = [
      { entryId: "miller", name: "Miller I.", total: 123, moneyShare: 0.5, winShare: 0.3 },
      { entryId: "michael", name: "Michael C.", total: 122, moneyShare: 0.30, winShare: 0.2 },
      { entryId: "charlie", name: "Charlie F.", total: 121, moneyShare: 0.25, winShare: 0.1 },
      { entryId: "aa", name: "AA", total: 120, moneyShare: 0.2, winShare: 0.05 },
      { entryId: "zach", name: "Zach F.", total: 100, moneyShare: 0.22, winShare: 0.1 },
    ];
    const r = buildFinishRace(input);
    expect(r.whoToWatch).toContain("Zach");
  });

  it("respects maxContenders", () => {
    const r = buildFinishRace(baseInput({ maxContenders: 2 }));
    expect(r.contenders).toHaveLength(2);
  });
});
