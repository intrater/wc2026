import { describe, it, expect } from "vitest";
import { mapRound, parseGroupLabel } from "./rounds";

describe("mapRound", () => {
  it("maps each 2026 stage, with Final checked after qf/sf/3rd", () => {
    expect(mapRound("Group Stage - 1")).toBe("group");
    expect(mapRound("Round of 32")).toBe("r32");
    expect(mapRound("Round of 16")).toBe("r16");
    expect(mapRound("Quarter-finals")).toBe("qf");
    expect(mapRound("Semi-finals")).toBe("sf");
    expect(mapRound("3rd Place Final")).toBe("third_place");
    expect(mapRound("Final")).toBe("final");
  });

  it("returns null for unknown rounds", () => {
    expect(mapRound("Mystery Round")).toBeNull();
    expect(mapRound(null)).toBeNull();
  });
});

describe("parseGroupLabel", () => {
  it("extracts the letter from a real group block", () => {
    expect(parseGroupLabel("Group A")).toBe("A");
    expect(parseGroupLabel("Group L")).toBe("L");
    expect(parseGroupLabel("group c")).toBe("C"); // case-insensitive, normalized up
    expect(parseGroupLabel("  Group H  ")).toBe("H"); // tolerates surrounding space
  });

  it("rejects the third-placed-ranking block so it can't clobber real groups", () => {
    expect(parseGroupLabel("Group Stage")).toBeNull();
    expect(parseGroupLabel("Ranking of third-placed teams")).toBeNull();
    expect(parseGroupLabel("Group AB")).toBeNull(); // only a single letter is a real group
    expect(parseGroupLabel("")).toBeNull();
    expect(parseGroupLabel(null)).toBeNull();
    expect(parseGroupLabel(undefined)).toBeNull();
  });
});
