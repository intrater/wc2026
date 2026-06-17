import { describe, it, expect } from "vitest";
import { bucketForWinShare } from "./bucket";
import { impliedProb, deVig } from "./odds";

describe("bucketForWinShare (fair share = 1/27 ≈ 0.037)", () => {
  const N = 27;
  it("buckets by multiples of fair share", () => {
    expect(bucketForWinShare(0.2, N)).toBe("front_runner"); // > 3x
    expect(bucketForWinShare(0.06, N)).toBe("in_hunt"); // ~1.6x
    expect(bucketForWinShare(0.02, N)).toBe("live"); // ~0.5x
    expect(bucketForWinShare(0.005, N)).toBe("long_shot"); // tiny
    expect(bucketForWinShare(0, N)).toBe("long_shot"); // 0 sampled wins but not exactly eliminated
  });
});

describe("impliedProb", () => {
  it("parses American odds", () => {
    expect(impliedProb("+475")).toBeCloseTo(100 / 575, 4);
    expect(impliedProb("-150")).toBeCloseTo(150 / 250, 4);
  });
  it("parses fractional odds", () => {
    expect(impliedProb("10-1")).toBeCloseTo(1 / 11, 4);
    expect(impliedProb("2500-1")).toBeCloseTo(1 / 2501, 6);
  });
  it("returns null for junk", () => {
    expect(impliedProb("evens")).toBeNull();
    expect(impliedProb(null)).toBeNull();
  });
  it("de-vig normalizes to sum 1", () => {
    const out = deVig([0.5, 0.3, 0.4]);
    expect(out.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });
});
