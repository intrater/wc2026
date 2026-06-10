import { describe, it, expect } from "vitest";
import { computePot, computePayouts, formatUsd } from "./calc";

const split = { champion: 0.5, runner_up: 0.25, group_leader: 0.15, group_runner_up: 0.1 };

describe("payouts", () => {
  it("scales the pot to the entrant count", () => {
    expect(computePot(24, 10000)).toBe(240000); // 24 * $100
    expect(computePot(0, 10000)).toBe(0);
  });

  it("splits the pot and the parts sum to the whole", () => {
    const p = computePayouts(24, 10000, split); // $2400 pot
    expect(p.potCents).toBe(240000);
    expect(p.championCents + p.runnerUpCents + p.groupLeaderCents + p.groupRunnerUpCents).toBe(p.potCents);
    expect(p.championCents).toBe(120000); // 50% → $1,200
    expect(p.runnerUpCents).toBe(60000); // 25% → $600
    expect(p.groupLeaderCents).toBe(36000); // 15% → $360
    expect(p.groupRunnerUpCents).toBe(24000); // 10% → $240
  });

  it("gives rounding remainder to the champion", () => {
    const p = computePayouts(17, 10000, split); // $1700 pot
    expect(p.championCents + p.runnerUpCents + p.groupLeaderCents + p.groupRunnerUpCents).toBe(170000);
  });

  it("formats whole dollars", () => {
    expect(formatUsd(150000)).toBe("$1,500");
  });
});
