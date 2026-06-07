import { describe, it, expect } from "vitest";
import { buildDayStats, buildDayNumber, type BuildStatsInput, type StatsMatchRow } from "./stats";
import { isDayDone } from "./generate";

const DAY = "2026-06-11";

function matchRow(p: Partial<StatsMatchRow> & { fixture_id: number }): StatsMatchRow {
  return {
    stage: "group",
    group_label: "A",
    kickoff: "2026-06-11T17:00:00Z", // 1pm ET June 11
    status: "FT",
    home_team_id: 1,
    away_team_id: 2,
    home_goals: 2,
    away_goals: 0,
    decided_by: "regulation",
    ...p,
  };
}

const teams = new Map([
  [1, { id: 1, name: "Mexico", flag: "🇲🇽" }],
  [2, { id: 2, name: "South Africa", flag: "🇿🇦" }],
  [3, { id: 3, name: "Brazil", flag: "🇧🇷" }],
]);

function baseInput(over: Partial<BuildStatsInput> = {}): BuildStatsInput {
  return {
    day: DAY,
    dayNumber: 1,
    matches: [matchRow({ fixture_id: 100 })],
    teams,
    entries: [
      { entryId: "a", displayName: "Alice", total: 4, underdogTotal: 0, upsetTotal: 0 },
      { entryId: "b", displayName: "Bob", total: 2, underdogTotal: 0, upsetTotal: 0 },
    ],
    snapshots: new Map([
      ["a", { rank: 2, total: 0 }],
      ["b", { rank: 1, total: 0 }],
    ]),
    todaysLines: [],
    ...over,
  };
}

describe("isDayDone", () => {
  it("false with no fixtures today", () => {
    expect(isDayDone([])).toBe(false);
  });

  it("waits for the evening game even when afternoon games are done", () => {
    // 2 FT + 1 NS (9pm kickoff hasn't started) → NOT done
    expect(isDayDone([{ status: "FT" }, { status: "FT" }, { status: "NS" }])).toBe(false);
  });

  it("true when all of today's fixtures are terminal", () => {
    expect(isDayDone([{ status: "FT" }, { status: "AET" }, { status: "PEN" }])).toBe(true);
  });

  it("postponed/cancelled count as resolved; paused blocks", () => {
    expect(isDayDone([{ status: "FT" }, { status: "PST" }])).toBe(true);
    expect(isDayDone([{ status: "FT" }, { status: "SUSP" }])).toBe(false);
    expect(isDayDone([{ status: "FT" }, { status: "2H" }])).toBe(false);
  });
});

describe("buildDayNumber", () => {
  it("counts distinct fixture-bearing ET days up to and including the day", () => {
    const kickoffs = [
      "2026-06-11T17:00:00Z", // day 1
      "2026-06-11T23:00:00Z", // day 1 again
      "2026-06-12T20:00:00Z", // day 2
      "2026-06-14T20:00:00Z", // day 3 (June 13 is a rest day)
      null,
    ];
    expect(buildDayNumber(kickoffs, "2026-06-11")).toBe(1);
    expect(buildDayNumber(kickoffs, "2026-06-12")).toBe(2);
    expect(buildDayNumber(kickoffs, "2026-06-13")).toBe(2); // rest day doesn't advance
    expect(buildDayNumber(kickoffs, "2026-06-14")).toBe(3);
  });
});

describe("buildDayStats", () => {
  it("collects results, per-entry movement, and the top three", () => {
    const stats = buildDayStats(baseInput());
    expect(stats.dayNumber).toBe(1);
    expect(stats.results).toHaveLength(1);
    expect(stats.results[0].home).toEqual({ name: "Mexico", flag: "🇲🇽", goals: 2 });
    expect(stats.entries[0]).toMatchObject({
      displayName: "Alice",
      rank: 1,
      pointsToday: 4,
      rankDelta: 1, // was 2nd, now 1st
    });
    expect(stats.topGainer).toBe("Alice");
    expect(stats.biggestFaller).toBe("Bob");
    expect(stats.topThree).toEqual(["Alice", "Bob"]);
  });

  it("only includes resolved matches from the recap day in results", () => {
    const stats = buildDayStats(
      baseInput({
        matches: [
          matchRow({ fixture_id: 100 }), // FT today → included
          matchRow({ fixture_id: 101, status: "PST" }), // postponed today → flagged
          matchRow({ fixture_id: 102, kickoff: "2026-06-12T20:00:00Z" }), // other day
        ],
      }),
    );
    expect(stats.results.map((r) => r.fixtureId)).toEqual([100, 101]);
    expect(stats.results[1].postponed).toBe(true);
  });

  it("dedupes upsets and goal bonuses across owning entries", () => {
    const lines = [
      // Brazil upset, owned by BOTH entries → one upset
      { entry_id: "a", team_id: 3, match_id: 100, points: 7, label: "Upset (+7)", category: "upset" },
      { entry_id: "b", team_id: 3, match_id: 100, points: 7, label: "Upset (+7)", category: "upset" },
      // 2 goals for Brazil, owned by both → counted once
      { entry_id: "a", team_id: 3, match_id: 100, points: 2, label: "2 goals", category: "goal" },
      { entry_id: "b", team_id: 3, match_id: 100, points: 2, label: "2 goals", category: "goal" },
    ];
    const stats = buildDayStats(baseInput({ todaysLines: lines }));
    expect(stats.upsets).toEqual([{ teamName: "Brazil", label: "Upset (+7)", points: 7 }]);
    expect(stats.goalBonusStandouts).toEqual([{ teamName: "Brazil", goals: 2 }]);
  });

  it("truncates long display names and never includes paid/email fields", () => {
    const longName = "x".repeat(60);
    const stats = buildDayStats(
      baseInput({
        entries: [
          { entryId: "a", displayName: longName, total: 1, underdogTotal: 0, upsetTotal: 0 },
        ],
        snapshots: new Map(),
      }),
    );
    expect(stats.entries[0].displayName.length).toBeLessThanOrEqual(40);
    const json = JSON.stringify(stats);
    expect(json).not.toContain("paid");
    expect(json).not.toContain("email");
    expect(json).not.toContain("user_id");
  });

  it("entries with no snapshot get null movement (NEW), not zeros", () => {
    const stats = buildDayStats(baseInput({ snapshots: new Map() }));
    expect(stats.entries[0].pointsToday).toBeNull();
    expect(stats.entries[0].rankDelta).toBeNull();
    expect(stats.topGainer).toBeNull(); // nobody has a measurable day
  });
});
