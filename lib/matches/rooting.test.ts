import { describe, it, expect } from "vitest";
import { computeRooting, type Owner } from "./rooting";

const o = (entryId: string, name: string, rank: number): Owner => ({ entryId, name, rank });

const base = {
  homeName: "Belgium",
  awayName: "Senegal",
  homeOwners: [o("mich", "Michael", 3), o("john", "John", 5), o("tim", "Tim", 9)],
  awayOwners: [o("adam", "Adam", 7), o("nick", "Nick", 17)],
};

describe("computeRooting", () => {
  it("lists backers per side sorted by rank, marking the viewer", () => {
    const r = computeRooting({ ...base, viewerEntryId: "john", viewerRank: 5 });
    expect(r.homeCount).toBe(3);
    expect(r.awayCount).toBe(2);
    expect(r.home[0]).toEqual({ name: "Michael", rank: 3, isViewer: false });
    expect(r.home.find((b) => b.name === "John")?.isViewer).toBe(true);
  });

  it("viewer owns a team → root for it, flags a higher-ranked co-owner as neutral", () => {
    const r = computeRooting({ ...base, viewerEntryId: "john", viewerRank: 5 });
    expect(r.you?.rootFor).toBe("home");
    expect(r.you?.text).toContain("Root for Belgium");
    expect(r.you?.text).toContain("neutral vs Michael");
  });

  it("viewer owns both → covered", () => {
    const r = computeRooting({
      ...base,
      awayOwners: [...base.awayOwners, o("john", "John", 5)],
      viewerEntryId: "john",
      viewerRank: 5,
    });
    expect(r.you?.rootFor).toBeNull();
    expect(r.you?.text).toContain("covered either way");
  });

  it("viewer owns neither → root against the side with more rivals ahead", () => {
    // Viewer rank 10. Home (Belgium) backed by 3, 5, 9 (all ahead). Away by 7 (ahead), 17 (behind).
    const r = computeRooting({ ...base, viewerEntryId: "zzz", viewerRank: 10 });
    expect(r.you?.rootFor).toBe("away"); // Belgium has 3 ahead, Senegal 1 → root Senegal to knock Belgium's backers back
    expect(r.you?.text).toContain("root for Senegal");
  });

  it("no entry → no personalized read, backers still returned", () => {
    const r = computeRooting({ ...base, viewerEntryId: null, viewerRank: null });
    expect(r.you).toBeNull();
    expect(r.homeCount).toBe(3);
  });

  it("nobody ahead of the viewer is involved → free watch", () => {
    const r = computeRooting({ ...base, viewerEntryId: "zzz", viewerRank: 1 });
    expect(r.you?.rootFor).toBeNull();
    expect(r.you?.text).toContain("free watch");
  });
});
