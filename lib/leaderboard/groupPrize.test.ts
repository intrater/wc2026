import { describe, it, expect } from "vitest";
import { computeGroupPrizes, type GroupPrizeRow } from "./groupPrize";

const rows: GroupPrizeRow[] = [
  { entryId: "charlie", groupStageTotal: 99, underdogTotal: 55.5, upsetTotal: 16 },
  { entryId: "miller", groupStageTotal: 97, underdogTotal: 54, upsetTotal: 21 },
  { entryId: "michael", groupStageTotal: 97, underdogTotal: 52, upsetTotal: 19 }, // ties Miller, loses tiebreak
  { entryId: "john", groupStageTotal: 96, underdogTotal: 54, upsetTotal: 20 },
];

describe("computeGroupPrizes", () => {
  it("returns nothing until the group stage is complete", () => {
    expect(computeGroupPrizes(rows, false, "$405", "$270").size).toBe(0);
  });

  it("crowns the top two by group_stage_total", () => {
    const p = computeGroupPrizes(rows, true, "$405", "$270");
    expect(p.get("charlie")).toEqual({ place: 1, label: "Group stage winner", amount: "$405" });
    expect(p.get("miller")).toEqual({ place: 2, label: "Group-stage runner-up", amount: "$270" });
  });

  it("breaks a tie by underdog then upset points (Miller over Michael at 97)", () => {
    const p = computeGroupPrizes(rows, true, "$405", "$270");
    expect(p.has("miller")).toBe(true); // higher underdog total
    expect(p.has("michael")).toBe(false);
    expect(p.has("john")).toBe(false);
  });
});
