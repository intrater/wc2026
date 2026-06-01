import { describe, it, expect } from "vitest";
import { computePot, computePayouts, formatUsd } from "./calc";

const split = { champion: 0.6, runner_up: 0.25, group_leader: 0.15 };

describe("payouts", () => {
  it("scales the pot to paid entries", () => {
    expect(computePot(25, 10000)).toBe(250000); // 25 * $100
    expect(computePot(0, 10000)).toBe(0);
  });

  it("splits the pot and the parts sum to the whole", () => {
    const p = computePayouts(25, 10000, split); // $2500 pot
    expect(p.potCents).toBe(250000);
    expect(p.championCents + p.runnerUpCents + p.groupLeaderCents).toBe(p.potCents);
    expect(p.runnerUpCents).toBe(62500); // 25%
    expect(p.groupLeaderCents).toBe(37500); // 15%
    expect(p.championCents).toBe(150000); // 60%
  });

  it("gives rounding remainder to the champion", () => {
    const p = computePayouts(17, 10000, split); // $1700 pot
    expect(p.championCents + p.runnerUpCents + p.groupLeaderCents).toBe(170000);
  });

  it("formats whole dollars", () => {
    expect(formatUsd(150000)).toBe("$1,500");
  });
});
