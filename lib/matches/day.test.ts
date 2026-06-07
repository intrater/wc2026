import { describe, it, expect } from "vitest";
import {
  businessDayOf,
  todayBusinessDay,
  groupByDay,
  cardStateFor,
  isLive,
  isPaused,
  isResolved,
  isTerminal,
  isNotOccurring,
} from "./day";

// ---------- fixture helper ----------
function m(p: Partial<Parameters<typeof cardStateFor>[0]> = {}) {
  return {
    status: "NS",
    home_team_id: 1,
    away_team_id: 2,
    home_goals: null,
    away_goals: null,
    live_home_goals: null,
    live_away_goals: null,
    ht_home_goals: null,
    ht_away_goals: null,
    decided_by: null,
    ...p,
  };
}

describe("businessDayOf", () => {
  it("assigns a 10pm ET kickoff to its ET start date (not the UTC date)", () => {
    // 2026-06-12T02:00:00Z = 10pm EDT June 11
    expect(businessDayOf("2026-06-12T02:00:00Z")).toBe("2026-06-11");
  });

  it("uses EDT (UTC-4) in June", () => {
    // 03:59 UTC = 11:59pm EDT previous day; 04:00 UTC = midnight EDT
    expect(businessDayOf("2026-06-12T03:59:00Z")).toBe("2026-06-11");
    expect(businessDayOf("2026-06-12T04:00:00Z")).toBe("2026-06-12");
  });

  it("handles an afternoon ET kickoff plainly", () => {
    // 2026-06-11T17:00:00Z = 1pm EDT June 11
    expect(businessDayOf("2026-06-11T17:00:00Z")).toBe("2026-06-11");
  });

  it("todayBusinessDay matches businessDayOf for the same instant", () => {
    const now = Date.UTC(2026, 5, 12, 2, 30); // 10:30pm EDT June 11
    expect(todayBusinessDay(now)).toBe("2026-06-11");
  });
});

describe("status buckets", () => {
  it("classifies every documented status into exactly one bucket", () => {
    const all: Array<[string, (s: string) => boolean]> = [
      ["TBD", (s) => !isLive(s) && !isPaused(s) && !isResolved(s)],
      ["NS", (s) => !isLive(s) && !isPaused(s) && !isResolved(s)],
      ["1H", isLive],
      ["HT", isLive],
      ["2H", isLive],
      ["ET", isLive],
      ["BT", isLive],
      ["P", isLive],
      ["SUSP", isPaused],
      ["INT", isPaused],
      ["PST", isNotOccurring],
      ["CANC", isNotOccurring],
      ["ABD", isNotOccurring],
      ["FT", isTerminal],
      ["AET", isTerminal],
      ["PEN", isTerminal],
      ["AWD", isTerminal],
      ["WO", isTerminal],
    ];
    for (const [status, check] of all) expect(check(status), status).toBe(true);
  });

  it("isResolved = terminal or not-occurring; paused is NOT resolved", () => {
    expect(isResolved("FT")).toBe(true);
    expect(isResolved("PST")).toBe(true);
    expect(isResolved("SUSP")).toBe(false);
    expect(isResolved("2H")).toBe(false);
    expect(isResolved("NS")).toBe(false);
  });
});

describe("groupByDay", () => {
  it("returns days ascending with matches sorted by kickoff within each day", () => {
    const groups = groupByDay([
      { kickoff: "2026-06-12T20:00:00Z" }, // June 12 ET
      { kickoff: "2026-06-11T17:00:00Z" }, // June 11 ET 1pm
      { kickoff: "2026-06-12T02:00:00Z" }, // June 11 ET 10pm
      { kickoff: null }, // unplaceable
    ]);
    expect(groups.map((g) => g.day)).toEqual(["2026-06-11", "2026-06-12"]);
    expect(groups[0].matches.map((m) => m.kickoff)).toEqual([
      "2026-06-11T17:00:00Z",
      "2026-06-12T02:00:00Z",
    ]);
    expect(groups[1].matches).toHaveLength(1);
  });
});

describe("cardStateFor", () => {
  it("NS → upcoming; TBD → upcoming (teams known)", () => {
    expect(cardStateFor(m({ status: "NS" })).kind).toBe("upcoming");
    expect(cardStateFor(m({ status: "TBD" })).kind).toBe("upcoming");
  });

  it("null team ids → tbd regardless of status", () => {
    expect(cardStateFor(m({ home_team_id: null })).kind).toBe("tbd");
    expect(cardStateFor(m({ away_team_id: null, status: "NS" })).kind).toBe("tbd");
  });

  it("1H/2H/ET/BT/P → live with live_* score", () => {
    for (const status of ["1H", "2H", "ET", "BT", "P"]) {
      const state = cardStateFor(m({ status, live_home_goals: 2, live_away_goals: 1 }));
      expect(state).toEqual({ kind: "live", home: 2, away: 1 });
    }
  });

  it("HT → halftime preferring ht_* score", () => {
    const state = cardStateFor(
      m({ status: "HT", ht_home_goals: 1, ht_away_goals: 1, live_home_goals: 1, live_away_goals: 1 }),
    );
    expect(state).toEqual({ kind: "halftime", home: 1, away: 1 });
  });

  it("FT/AET/PEN → final with terminal score + decided_by", () => {
    const state = cardStateFor(
      m({ status: "PEN", home_goals: 1, away_goals: 1, decided_by: "penalties" }),
    );
    expect(state).toEqual({ kind: "final", home: 1, away: 1, decidedBy: "penalties" });
  });

  it("SUSP/INT → paused keeping last live score", () => {
    const state = cardStateFor(m({ status: "SUSP", live_home_goals: 1, live_away_goals: 0 }));
    expect(state).toEqual({ kind: "paused", home: 1, away: 0 });
  });

  it("PST/CANC/ABD → their badges", () => {
    expect(cardStateFor(m({ status: "PST" })).kind).toBe("postponed");
    expect(cardStateFor(m({ status: "CANC" })).kind).toBe("cancelled");
    expect(cardStateFor(m({ status: "ABD" })).kind).toBe("abandoned");
  });

  it("unknown status → upcoming, never throws", () => {
    expect(cardStateFor(m({ status: "XYZ" })).kind).toBe("upcoming");
  });
});
