import { describe, it, expect } from "vitest";
import { mapRound } from "./rounds";

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
