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
    ranked: [
      { entryId: "tim", name: "Tim", total: 43, rank: 1 },
      { entryId: "mike", name: "Mike", total: 40, rank: 2 },
      { entryId: "charlie", name: "Charlie", total: 30, rank: 3 },
    ],
    outlook: new Map([
      ["tim", { bucket: "in_hunt", winShare: 0.24 }],
      ["mike", { bucket: "in_hunt", winShare: 0.19 }],
      ["charlie", { bucket: "no_shot", winShare: 0 }],
    ]),
    picksByEntry: new Map([
      ["tim", [1]],     // France
      ["mike", [2]],    // Spain
      ["charlie", [3]], // Morocco
    ]),
    teamsStillPlaying: new Set([1, 2, 3, 4]),
    teamMap,
    remainingGroupMatches: [
      { homeTeamId: 2, awayTeamId: 4, kickoff: "2026-06-26T19:00:00Z" }, // Spain v Japan
      { homeTeamId: 1, awayTeamId: 3, kickoff: "2026-06-27T19:00:00Z" }, // France v Morocco
    ],
  };
}

describe("buildRace", () => {
  it("lists only entries still alive for 1st (no_shot excluded)", () => {
    const r = buildRace(base());
    expect(r.contenders.map((c) => c.name)).toEqual(["Tim", "Mike"]);
    expect(r.aliveCount).toBe(2);
    expect(r.eliminatedCount).toBe(1);
  });

  it("root-for = own teams still playing; the leader has nobody to root against", () => {
    const tim = buildRace(base()).contenders.find((c) => c.name === "Tim")!;
    expect(tim.rootFor.map((t) => t.name)).toEqual(["France"]);
    expect(tim.rootAgainst).toEqual([]); // rank 1: no one ahead
  });

  it("root-against = a higher-ranked entry's team you don't share, with owner", () => {
    const mike = buildRace(base()).contenders.find((c) => c.name === "Mike")!;
    expect(mike.rootFor.map((t) => t.name)).toEqual(["Spain"]);
    expect(mike.rootAgainst).toHaveLength(1);
    expect(mike.rootAgainst[0].name).toBe("France");
    expect(mike.rootAgainst[0].owner).toBe("Tim");
  });

  it("does not root against a team you also own", () => {
    const i = base();
    i.picksByEntry.set("mike", [2, 1]); // Mike also owns France (Tim's)
    const mike = buildRace(i).contenders.find((c) => c.name === "Mike")!;
    expect(mike.rootAgainst.map((t) => t.name)).not.toContain("France");
  });

  it("ignores teams with no games left", () => {
    const i = base();
    i.teamsStillPlaying = new Set([2, 4]); // France (Tim's) done
    const mike = buildRace(i).contenders.find((c) => c.name === "Mike")!;
    expect(mike.rootAgainst).toEqual([]); // France finished → nothing to root against
  });

  it("computes win %, alive/eliminated, groups-end, and the pivotal game", () => {
    const r = buildRace(base());
    expect(r.contenders[0].winPct).toBe(24);
    expect(r.groupsEndISO).toBe("2026-06-27T19:00:00Z");
    // Spain v Japan and France v Morocco each touch 2 rosters; first max wins.
    expect(r.pivotal).not.toBeNull();
    expect(r.pivotal!.owners).toBeGreaterThanOrEqual(2);
    expect(r.remainingGames).toBe(2);
  });
});
