import { describe, it, expect } from "vitest";
import { SEED_TEAMS, TIER_COUNT, TEAMS_PER_TIER } from "./seed";

describe("tier seed integrity", () => {
  it("has exactly 48 teams", () => {
    expect(SEED_TEAMS).toHaveLength(TIER_COUNT * TEAMS_PER_TIER);
  });

  it("has exactly 4 teams in each of the 12 tiers", () => {
    for (let t = 1; t <= TIER_COUNT; t++) {
      expect(SEED_TEAMS.filter((s) => s.tier === t)).toHaveLength(TEAMS_PER_TIER);
    }
  });

  it("has no duplicate team names", () => {
    const names = SEED_TEAMS.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("gives every team a flag and odds", () => {
    for (const s of SEED_TEAMS) {
      expect(s.flag.length).toBeGreaterThan(0);
      expect(s.odds.length).toBeGreaterThan(0);
    }
  });
});
