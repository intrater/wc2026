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
    winner_team_id: 1, // default row is a 2-0 home win
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

  it("includes only FINISHED matches from the recap day (postponed is excluded, never narrated)", () => {
    const stats = buildDayStats(
      baseInput({
        matches: [
          matchRow({ fixture_id: 100 }), // FT today → included
          matchRow({ fixture_id: 101, status: "PST" }), // postponed today → NOT a result
          matchRow({ fixture_id: 102, kickoff: "2026-06-12T20:00:00Z" }), // other day
        ],
      }),
    );
    expect(stats.results.map((r) => r.fixtureId)).toEqual([100]);
  });

  it("surfaces knockout advancement/elimination with explicit winner from winner_team_id", () => {
    const stats = buildDayStats(
      baseInput({
        matches: [
          // R32: level 1-1 but Mexico (team 1) wins on penalties → advances, South Africa out
          matchRow({ fixture_id: 200, stage: "r32", home_goals: 1, away_goals: 1, decided_by: "penalties", winner_team_id: 1 }),
        ],
      }),
    );
    expect(stats.results[0].winner).toBe("Mexico");
    expect(stats.results[0].loser).toBe("South Africa");
    expect(stats.knockout).toEqual({
      eliminated: ["South Africa"],
      advanced: [{ team: "Mexico", to: "the Round of 16" }],
    });
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

describe("buildDayStats lookAhead", () => {
  it("targets the next fixture-bearing day, skipping rest days", () => {
    const stats = buildDayStats(
      baseInput({
        matches: [
          matchRow({ fixture_id: 100 }), // recap day (June 11)
          // June 12 is a rest day; next fixtures are June 13.
          matchRow({ fixture_id: 102, kickoff: "2026-06-13T20:00:00Z", status: "NS", home_goals: null, away_goals: null }),
          matchRow({ fixture_id: 101, kickoff: "2026-06-13T16:00:00Z", status: "NS", home_team_id: 3, away_team_id: 1, home_goals: null, away_goals: null }),
          matchRow({ fixture_id: 103, kickoff: "2026-06-14T16:00:00Z", status: "NS" }), // beyond next day
        ],
      }),
    );
    expect(stats.lookAhead?.day).toBe("2026-06-13");
    // Kickoff-sorted; only the next day's fixtures included.
    expect(stats.lookAhead?.fixtures).toHaveLength(2);
    expect(stats.lookAhead?.fixtures[0].home).toEqual({ name: "Brazil", flag: "🇧🇷" });
    expect(stats.lookAhead?.fixtures[0].kickoffET).toBe("12:00 PM");
  });

  it("renders TBD knockout slots as null teams", () => {
    const stats = buildDayStats(
      baseInput({
        matches: [
          matchRow({ fixture_id: 100 }),
          matchRow({
            fixture_id: 200,
            stage: "r32",
            group_label: null,
            kickoff: "2026-06-12T16:00:00Z",
            status: "NS",
            home_team_id: null,
            away_team_id: null,
            home_goals: null,
            away_goals: null,
          }),
        ],
      }),
    );
    expect(stats.lookAhead?.fixtures[0].home).toBeNull();
    expect(stats.lookAhead?.fixtures[0].away).toBeNull();
    expect(stats.lookAhead?.fixtures[0].stage).toBe("r32");
  });

  it("is absent when no future fixtures remain (after the final)", () => {
    const stats = buildDayStats(baseInput());
    expect(stats.lookAhead).toBeUndefined();
    expect("lookAhead" in stats).toBe(false); // omitted, not null — old rows match
  });
});
