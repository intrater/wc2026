import { describe, it, expect } from "vitest";
import { deriveLiveState, deriveResult, type ApiFixture } from "./client";

function fixture(p: {
  status: string;
  goals?: [number | null, number | null];
  halftime?: [number | null, number | null];
  penalty?: [number | null, number | null];
  extratime?: [number | null, number | null];
  elapsed?: number | null;
}): ApiFixture {
  return {
    fixture: { id: 1, date: "2026-06-11T17:00:00Z", status: { short: p.status, elapsed: p.elapsed ?? null } },
    league: { round: "Group Stage - 1" },
    teams: { home: { id: 10, name: "Home" }, away: { id: 20, name: "Away" } },
    goals: { home: p.goals?.[0] ?? null, away: p.goals?.[1] ?? null },
    score: {
      halftime: { home: p.halftime?.[0] ?? null, away: p.halftime?.[1] ?? null },
      fulltime: { home: null, away: null },
      extratime: { home: p.extratime?.[0] ?? null, away: p.extratime?.[1] ?? null },
      penalty: { home: p.penalty?.[0] ?? null, away: p.penalty?.[1] ?? null },
    },
  };
}

describe("deriveLiveState", () => {
  it("1H with goals 2-0 → set live 2-0 at 37', no HT yet", () => {
    expect(deriveLiveState(fixture({ status: "1H", goals: [2, 0], elapsed: 37 }))).toEqual({
      action: "set",
      liveHome: 2,
      liveAway: 0,
      htHome: null,
      htAway: null,
      elapsed: 37,
    });
  });

  it("1H just kicked off (null goals) → set live 0-0", () => {
    const s = deriveLiveState(fixture({ status: "1H" }));
    expect(s).toMatchObject({ action: "set", liveHome: 0, liveAway: 0 });
  });

  it("HT 1-1 → set with halftime score recorded", () => {
    expect(
      deriveLiveState(fixture({ status: "HT", goals: [1, 1], halftime: [1, 1], elapsed: 45 })),
    ).toEqual({
      action: "set",
      liveHome: 1,
      liveAway: 1,
      htHome: 1,
      htAway: 1,
      elapsed: 45,
    });
  });

  it("2H 3-1 with HT 1-1 → live 3-1, ht 1-1; missing elapsed → null", () => {
    expect(deriveLiveState(fixture({ status: "2H", goals: [3, 1], halftime: [1, 1] }))).toEqual({
      action: "set",
      liveHome: 3,
      liveAway: 1,
      htHome: 1,
      htAway: 1,
      elapsed: null,
    });
  });

  it("ET/BT/P are live; goals already include ET goals", () => {
    for (const status of ["ET", "BT", "P"]) {
      const s = deriveLiveState(fixture({ status, goals: [2, 1], halftime: [0, 1] }));
      expect(s).toMatchObject({ action: "set", liveHome: 2, liveAway: 1 });
    }
  });

  it("terminal statuses → clear", () => {
    for (const status of ["FT", "AET", "PEN", "AWD", "WO"]) {
      expect(deriveLiveState(fixture({ status, goals: [1, 0] }))).toEqual({ action: "clear" });
    }
  });

  it("not-occurring (PST/CANC/ABD) and back-to-scheduled (NS/TBD) → clear", () => {
    for (const status of ["PST", "CANC", "ABD", "NS", "TBD"]) {
      expect(deriveLiveState(fixture({ status }))).toEqual({ action: "clear" });
    }
  });

  it("paused (SUSP/INT) → keep last stored values", () => {
    for (const status of ["SUSP", "INT"]) {
      expect(deriveLiveState(fixture({ status, goals: [1, 0] }))).toEqual({ action: "keep" });
    }
  });

  it("unknown status → keep, never throws", () => {
    expect(deriveLiveState(fixture({ status: "XYZ" }))).toEqual({ action: "keep" });
  });
});

describe("deriveResult (regression: unchanged by live-state work, R9)", () => {
  it("still null for non-terminal statuses, including live ones", () => {
    expect(deriveResult(fixture({ status: "2H", goals: [3, 1] }))).toBeNull();
    expect(deriveResult(fixture({ status: "SUSP", goals: [1, 0] }))).toBeNull();
  });

  it("still derives shootout winners from score.penalty", () => {
    const r = deriveResult(
      fixture({ status: "PEN", goals: [1, 1], extratime: [0, 0], penalty: [4, 3] }),
    );
    expect(r).toMatchObject({ homeGoals: 1, awayGoals: 1, decidedBy: "penalties", winnerApiId: 10 });
  });
});
