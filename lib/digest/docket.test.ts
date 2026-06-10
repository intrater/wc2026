import { describe, it, expect } from "vitest";
import { buildDocket, docketTextLines, type DocketMatchRow } from "./docket";

const DAY = "2026-06-13";

const teams = new Map([
  [1, { name: "USA", flag: "🇺🇸" }],
  [2, { name: "Wales", flag: "🏴" }],
  [3, { name: "Argentina", flag: "🇦🇷" }],
]);

function row(p: Partial<DocketMatchRow> & { fixture_id: number }): DocketMatchRow {
  return {
    stage: "group",
    group_label: "D",
    kickoff: "2026-06-13T16:00:00Z", // 12:00 PM ET
    status: "NS",
    home_team_id: 1,
    away_team_id: 2,
    live_home_goals: null,
    live_away_goals: null,
    ...p,
  };
}

describe("buildDocket", () => {
  it("includes only the given ET day, sorted by kickoff", () => {
    const items = buildDocket(
      [
        row({ fixture_id: 2, kickoff: "2026-06-13T22:00:00Z" }), // 6pm ET
        row({ fixture_id: 1 }), // noon ET
        row({ fixture_id: 3, kickoff: "2026-06-14T16:00:00Z" }), // other day
        row({ fixture_id: 4, kickoff: null }), // unscheduled
      ],
      teams,
      DAY,
    );
    expect(items.map((i) => i.fixtureId)).toEqual([1, 2]);
    expect(items[0].kickoffET).toBe("12:00 PM");
  });

  it("labels group matches by group and knockouts by stage", () => {
    const items = buildDocket(
      [
        row({ fixture_id: 1 }),
        row({ fixture_id: 2, stage: "r32", group_label: null, kickoff: "2026-06-13T20:00:00Z" }),
        row({ fixture_id: 3, stage: null, group_label: null, kickoff: "2026-06-13T22:00:00Z" }),
      ],
      teams,
      DAY,
    );
    expect(items.map((i) => i.contextLabel)).toEqual(["Group D", "Round of 32", "Match"]);
  });

  it("renders TBD knockout slots as null teams", () => {
    const [item] = buildDocket(
      [row({ fixture_id: 1, stage: "r32", home_team_id: null, away_team_id: null })],
      teams,
      DAY,
    );
    expect(item.home).toBeNull();
    expect(item.away).toBeNull();
  });

  it("carries the live score only while a match is live", () => {
    const items = buildDocket(
      [
        row({ fixture_id: 1, status: "2H", live_home_goals: 1, live_away_goals: 0 }),
        row({ fixture_id: 2, status: "FT", kickoff: "2026-06-13T13:00:00Z" }),
      ],
      teams,
      DAY,
    );
    expect(items.find((i) => i.fixtureId === 1)?.live).toEqual({ home: 1, away: 0 });
    expect(items.find((i) => i.fixtureId === 2)?.live).toBeNull();
  });

  it("returns [] on a rest day", () => {
    expect(buildDocket([row({ fixture_id: 1 })], teams, "2026-06-20")).toEqual([]);
  });
});

describe("docketTextLines", () => {
  it("formats fixture lines with flags, label, TBD, and live score", () => {
    const lines = docketTextLines(
      buildDocket(
        [
          row({ fixture_id: 1 }),
          row({
            fixture_id: 2,
            stage: "r32",
            group_label: null,
            home_team_id: null,
            away_team_id: null,
            kickoff: "2026-06-13T20:00:00Z",
          }),
          row({
            fixture_id: 3,
            home_team_id: 3,
            away_team_id: 2,
            status: "1H",
            live_home_goals: 2,
            live_away_goals: 1,
            kickoff: "2026-06-13T22:00:00Z",
          }),
        ],
        teams,
        DAY,
      ),
    );
    expect(lines[0]).toBe("12:00 PM ET — 🇺🇸 USA vs Wales 🏴 (Group D)");
    expect(lines[1]).toBe("4:00 PM ET — TBD vs TBD (Round of 32)");
    expect(lines[2]).toBe("6:00 PM ET — 🇦🇷 Argentina vs Wales 🏴 (Group D) (LIVE 2–1)");
  });
});
