import { describe, it, expect } from "vitest";
import { summarizeTeamMatches, type TeamMatchRow } from "./teamSummary";

// Team 10 is "our" team throughout; team 20 is the opponent.
function m(p: Partial<TeamMatchRow> = {}): TeamMatchRow {
  return {
    status: "NS",
    kickoff: null,
    home_team_id: 10,
    away_team_id: 20,
    home_goals: null,
    away_goals: null,
    live_home_goals: null,
    live_away_goals: null,
    live_elapsed: null,
    winner_team_id: null,
    decided_by: null,
    ...p,
  };
}

describe("summarizeTeamMatches", () => {
  it("records a regulation win, draw, and loss with the scoreline from the team's side", () => {
    const win = summarizeTeamMatches(10, [m({ status: "FT", home_goals: 2, away_goals: 1 })]);
    expect(win.played).toBe(1);
    expect(win.results[0]).toEqual({ oppId: 20, my: 2, opp: 1, outcome: "W", pens: false });

    const draw = summarizeTeamMatches(10, [m({ status: "FT", home_goals: 1, away_goals: 1 })]);
    expect(draw.results[0]).toMatchObject({ my: 1, opp: 1, outcome: "D" });

    // team 10 is away here and loses — goals reported from team 10's side
    const loss = summarizeTeamMatches(10, [
      m({ status: "FT", home_team_id: 20, away_team_id: 10, home_goals: 3, away_goals: 0 }),
    ]);
    expect(loss.results[0]).toEqual({ oppId: 20, my: 0, opp: 3, outcome: "L", pens: false });
  });

  it("scores a penalty shootout to the team that advanced, flagged as pens", () => {
    const won = summarizeTeamMatches(10, [
      m({ status: "PEN", home_goals: 1, away_goals: 1, decided_by: "penalties", winner_team_id: 10 }),
    ]);
    expect(won.results[0]).toMatchObject({ outcome: "W", pens: true });

    const lost = summarizeTeamMatches(10, [
      m({ status: "PEN", home_goals: 1, away_goals: 1, decided_by: "penalties", winner_team_id: 20 }),
    ]);
    expect(lost.results[0]).toMatchObject({ outcome: "L", pens: true });
  });

  it("reports the live score, opponent, and elapsed from the team's perspective", () => {
    const s = summarizeTeamMatches(10, [
      m({ status: "2H", live_home_goals: 0, live_away_goals: 2, live_elapsed: 67 }),
    ]);
    expect(s.live).toEqual({ oppId: 20, my: 0, opp: 2, elapsed: 67 });
    expect(s.played).toBe(0);
  });

  it("picks the soonest upcoming kickoff and ignores other teams' fixtures", () => {
    const s = summarizeTeamMatches(10, [
      m({ status: "NS", kickoff: "2026-06-20T18:00:00Z" }),
      m({ status: "NS", kickoff: "2026-06-17T15:00:00Z" }),
      m({ status: "NS", home_team_id: 30, away_team_id: 40, kickoff: "2026-06-15T15:00:00Z" }),
    ]);
    expect(s.nextKickoff).toBe("2026-06-17T15:00:00Z");
    expect(s.played).toBe(0);
  });

  it("accumulates results in order across a mix of played, live, and pending fixtures", () => {
    const s = summarizeTeamMatches(10, [
      m({ status: "FT", home_goals: 2, away_goals: 0 }),
      m({ status: "FT", home_team_id: 20, away_team_id: 10, home_goals: 1, away_goals: 1 }),
      m({ status: "1H", live_home_goals: 1, live_away_goals: 0, live_elapsed: 20 }),
      m({ status: "NS", kickoff: "2026-06-25T18:00:00Z" }),
    ]);
    expect(s.played).toBe(2);
    expect(s.results.map((r) => r.outcome)).toEqual(["W", "D"]);
    expect(s.results[1]).toMatchObject({ my: 1, opp: 1, outcome: "D" });
    expect(s.live).toEqual({ oppId: 20, my: 1, opp: 0, elapsed: 20 });
    expect(s.nextKickoff).toBe("2026-06-25T18:00:00Z");
  });
});
