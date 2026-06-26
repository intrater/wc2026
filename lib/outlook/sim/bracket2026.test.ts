import { describe, it, expect } from "vitest";
import {
  R32_SLOTS,
  KNOCKOUT_TREE,
  resolveR32,
  validateAgainstFixtures,
  assignR32ToSlots,
  playFixedBracket,
  type Group,
  type SlotRef,
  type TeamPos,
  type AssignedTie,
} from "./bracket2026";
import { mulberry32 } from "./rng";

const ALL_GROUPS: Group[] = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

// These invariants are how we KNOW the hand-transcribed slot table is the real
// 2026 bracket and not a typo. If any fail, the structure is wrong — do not ship.
describe("R32_SLOTS structural invariants", () => {
  const slots = R32_SLOTS.flatMap((s) => [s.home, s.away]);
  const groupsOf = (kind: "winner" | "runnerUp") =>
    slots.filter((r): r is Extract<SlotRef, { group: Group }> => r.kind === kind).map((r) => r.group);

  it("has all 16 matches numbered 73–88", () => {
    expect(R32_SLOTS.map((s) => s.match)).toEqual(
      Array.from({ length: 16 }, (_, i) => 73 + i),
    );
  });

  it("uses each group's winner exactly once (all 12 groups)", () => {
    expect(groupsOf("winner").sort()).toEqual([...ALL_GROUPS].sort());
  });

  it("uses each group's runner-up exactly once (all 12 groups)", () => {
    expect(groupsOf("runnerUp").sort()).toEqual([...ALL_GROUPS].sort());
  });

  it("has exactly 8 third-place slots, each with 5 candidate groups", () => {
    const thirds = slots.filter((r) => r.kind === "third");
    expect(thirds).toHaveLength(8);
    for (const t of thirds) if (t.kind === "third") expect(t.groups).toHaveLength(5);
  });

  it("never draws a third against a team from its own group", () => {
    for (const s of R32_SLOTS) {
      for (const [a, b] of [[s.home, s.away], [s.away, s.home]] as const) {
        if (a.kind === "third" && b.kind !== "third") {
          expect(a.groups).not.toContain(b.group);
        }
      }
    }
  });

  it("every group can supply a third to some slot (union covers all 12)", () => {
    const covered = new Set<Group>();
    for (const r of slots) if (r.kind === "third") r.groups.forEach((g) => covered.add(g));
    expect([...covered].sort()).toEqual([...ALL_GROUPS].sort());
  });
});

describe("KNOCKOUT_TREE invariants", () => {
  it("covers matches 89–104, each feeding from earlier matches", () => {
    expect(KNOCKOUT_TREE.map((n) => n.match)).toEqual(
      Array.from({ length: 16 }, (_, i) => 89 + i),
    );
    for (const node of KNOCKOUT_TREE) {
      for (const f of node.from) expect(f).toBeLessThan(node.match);
    }
  });

  it("the final (104) and third-place (103) both descend from the two semis", () => {
    const final = KNOCKOUT_TREE.find((n) => n.match === 104)!;
    const third = KNOCKOUT_TREE.find((n) => n.match === 103)!;
    expect(final.from).toEqual([101, 102]);
    expect(third.from).toEqual([101, 102]);
    expect(third.losers).toBe(true);
  });

  it("every non-R16 feeder is itself a tree match (no dangling references)", () => {
    const known = new Set<number>([...R32_SLOTS.map((s) => s.match), ...KNOCKOUT_TREE.map((n) => n.match)]);
    for (const node of KNOCKOUT_TREE) for (const f of node.from) expect(known.has(f)).toBe(true);
  });
});

describe("resolveR32", () => {
  const winners = new Map<Group, number>(ALL_GROUPS.map((g, i) => [g, 100 + i]));
  const runnersUp = new Map<Group, number>(ALL_GROUPS.map((g, i) => [g, 200 + i]));

  it("places winners and runners-up into their fixed slots", () => {
    const r = resolveR32(winners, runnersUp);
    const m73 = r.find((t) => t.match === 73)!;
    expect(m73.home).toBe(runnersUp.get("A"));
    expect(m73.away).toBe(runnersUp.get("B"));
    const m74 = r.find((t) => t.match === 74)!;
    expect(m74.home).toBe(winners.get("E")); // Winner E
    expect(m74.away).toBeNull(); // third not supplied → null, never guessed
  });

  it("fills a third slot only when explicitly provided", () => {
    const r = resolveR32(winners, runnersUp, new Map([[74, 999]]));
    expect(r.find((t) => t.match === 74)!.away).toBe(999);
  });
});

describe("validateAgainstFixtures", () => {
  const winners = new Map<Group, number>(ALL_GROUPS.map((g, i) => [g, 100 + i]));
  const runnersUp = new Map<Group, number>(ALL_GROUPS.map((g, i) => [g, 200 + i]));

  it("returns no mismatches when real fixtures match the encoded slots", () => {
    const resolved = resolveR32(winners, runnersUp);
    const real = resolved
      .filter((t) => t.home != null && t.away != null)
      .map((t) => ({ home: t.home!, away: t.away! }));
    expect(validateAgainstFixtures(resolved, real)).toEqual([]);
  });

  it("flags a match whose real fixture disagrees with the encoded slot", () => {
    const resolved = resolveR32(winners, runnersUp);
    const real = resolved
      .filter((t) => t.home != null && t.away != null)
      .map((t) => ({ home: t.home!, away: t.away! }));
    real[0] = { home: 9998, away: 9999 }; // corrupt one tie
    expect(validateAgainstFixtures(resolved, real).length).toBeGreaterThan(0);
  });
});

describe("assignR32ToSlots", () => {
  // The four real fixtures already validated against prod (2026-06-26), as positions.
  const posOf = new Map<number, TeamPos>([
    [1, { group: "D", pos: "W" }],   // USA
    [2, { group: "B", pos: "3rd" }], // Bosnia
    [3, { group: "A", pos: "RU" }],  // South Africa
    [4, { group: "B", pos: "RU" }],  // Canada
    [5, { group: "C", pos: "W" }],   // Brazil
    [6, { group: "F", pos: "RU" }],  // Japan
    [7, { group: "F", pos: "W" }],   // Netherlands
    [8, { group: "C", pos: "RU" }],  // Morocco
  ]);

  it("maps real fixtures onto the right slot numbers (incl. a third-place slot)", () => {
    const { ties, unmatched } = assignR32ToSlots(
      [{ home: 1, away: 2 }, { home: 3, away: 4 }, { home: 5, away: 6 }, { home: 7, away: 8 }],
      posOf,
    );
    expect(unmatched).toEqual([]);
    expect(ties.map((t) => t.match)).toEqual([73, 75, 76, 81]); // sorted by match no
    const m81 = ties.find((t) => t.match === 81)!;
    expect([m81.home, m81.away].sort()).toEqual([1, 2]); // W-D vs 3rd-B
  });

  it("reports a fixture that fits no slot as unmatched (no false placement)", () => {
    const { ties, unmatched } = assignR32ToSlots([{ home: 3, away: 5 }], posOf); // RU-A vs W-C: no slot
    expect(ties).toEqual([]);
    expect(unmatched).toEqual([{ home: 3, away: 5 }]);
  });
});

describe("playFixedBracket", () => {
  // 16 ties filling matches 73–88 with teams 1–32; rating = team id (higher = stronger).
  const r32: AssignedTie[] = R32_SLOTS.map((s, i) => ({ match: s.match, home: 2 * i + 1, away: 2 * i + 2 }));
  const ratings = new Map<number, number>(Array.from({ length: 32 }, (_, i) => [i + 1, i + 1]));

  it("plays the full fixed tree: 32 matches with the right stage counts", () => {
    const out = playFixedBracket(r32, ratings, mulberry32(123));
    expect(out).toHaveLength(32);
    const count = (st: string) => out.filter((m) => m.stage === st).length;
    expect(count("r32")).toBe(16);
    expect(count("r16")).toBe(8);
    expect(count("qf")).toBe(4);
    expect(count("sf")).toBe(2);
    expect(count("third_place")).toBe(1);
    expect(count("final")).toBe(1);
  });

  it("every tie has a winner who is one of its two participants", () => {
    for (const m of playFixedBracket(r32, ratings, mulberry32(7))) {
      expect([m.homeTeamId, m.awayTeamId]).toContain(m.winnerTeamId);
    }
  });

  it("is deterministic for a fixed seed", () => {
    const a = playFixedBracket(r32, ratings, mulberry32(42));
    const b = playFixedBracket(r32, ratings, mulberry32(42));
    expect(a).toEqual(b);
  });

  it("the champion is one of the 32 qualifiers", () => {
    const out = playFixedBracket(r32, ratings, mulberry32(99));
    const final = out.find((m) => m.stage === "final")!;
    expect(final.winnerTeamId).toBeGreaterThanOrEqual(1);
    expect(final.winnerTeamId).toBeLessThanOrEqual(32);
  });
});
