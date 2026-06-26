import { describe, it, expect } from "vitest";
import { buildRace, type RaceInput } from "./compute";

const teamMap = new Map<number, { name: string; flag: string; tier: number | null }>([
  [1, { name: "France", flag: "🇫🇷", tier: 1 }],
  [2, { name: "Spain", flag: "🇪🇸", tier: 1 }],
  [3, { name: "Morocco", flag: "🇲🇦", tier: 4 }],
  [4, { name: "Japan", flag: "🇯🇵", tier: 6 }],
]);

function base(): RaceInput {
  return {
    entries: [
      { entryId: "tim", name: "Tim", points: 43 },
      { entryId: "mike", name: "Mike", points: 40 },
      { entryId: "charlie", name: "Charlie", points: 30 },
    ],
    picksByEntry: new Map([
      ["tim", [1]],
      ["mike", [2]],
      ["charlie", [3]],
    ]),
    teamsStillPlaying: new Set([1, 2, 3, 4]),
    teamMap,
    remainingGroupMatches: [
      { homeTeamId: 2, awayTeamId: 4, kickoff: "2026-06-26T19:00:00Z" },
      { homeTeamId: 1, awayTeamId: 3, kickoff: "2026-06-27T19:00:00Z" },
    ],
    leaderPrize: "$405",
    runnerUpPrize: "$270",
  };
}

describe("buildRace (group-stage money)", () => {
  it("sets the money line to 2nd place and marks the top 2 as in the money", () => {
    const r = buildRace(base());
    expect(r.moneyLine).toBe(40); // Mike, currently 2nd
    expect(r.contenders.map((c) => c.inMoneyNow)).toEqual([true, true, false]);
  });

  it("gives chasers their gap to the money line; the top 2 have none", () => {
    const r = buildRace(base());
    expect(r.contenders[0].gapToMoney).toBe(0); // Tim (leader)
    expect(r.contenders[1].gapToMoney).toBe(0); // Mike (in money)
    expect(r.contenders[2].gapToMoney).toBe(10); // Charlie: 40 - 30
  });

  it("root-for own teams; hope-they-slip a leader's team you don't own, with owner", () => {
    const r = buildRace(base());
    const mike = r.contenders.find((c) => c.name === "Mike")!;
    expect(mike.rootFor.map((t) => t.name)).toEqual(["Spain"]);
    expect(mike.rootAgainst.map((t) => `${t.name}(${t.owner})`)).toEqual(["France(Tim)"]);
    expect(r.contenders[0].rootAgainst).toEqual([]); // leader roots against nobody
  });

  it("never roots against a team you also own, nor one with no games left", () => {
    const i = base();
    i.picksByEntry.set("charlie", [3, 1]); // also owns France
    expect(buildRace(i).contenders.find((c) => c.name === "Charlie")!.rootAgainst.map((t) => t.name)).not.toContain("France");
    const j = base();
    j.teamsStillPlaying = new Set([2, 3, 4]); // France done
    expect(buildRace(j).contenders.find((c) => c.name === "Mike")!.rootAgainst).toEqual([]);
  });

  it("surfaces prizes, groups-end date, and remaining game count", () => {
    const r = buildRace(base());
    expect(r.leaderPrize).toBe("$405");
    expect(r.runnerUpPrize).toBe("$270");
    expect(r.groupsEndISO).toBe("2026-06-27T19:00:00Z");
    expect(r.remainingGames).toBe(2);
  });
});
