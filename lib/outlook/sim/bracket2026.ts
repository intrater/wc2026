// ============================================================================
// 2026 World Cup knockout bracket — FIXED STRUCTURE (prep, NOT yet wired in).
// ============================================================================
//
// STATUS: dormant. Nothing in the app imports this file except its own test.
// It does not touch scoring, the poll/outlook crons, any page, or the schema.
// It exists so that when the real knockout bracket is set we can switch the
// chance-to-win simulation from its current strength-reseed approximation
// (lib/outlook/sim/bracket.ts) to the REAL FIFA bracket in one small, reviewed
// step — instead of authoring it under time pressure on draw day.
//
// WHY A FIXED BRACKET MATTERS: the live sim (bracket.ts) re-seeds survivors by
// strength each round and pairs strongest-vs-weakest. The real tournament does
// the opposite — where you finish your group locks you onto a fixed path, so two
// strong group winners can collide in the Round of 16. Modelling the true tree
// sharpens win-share, especially deep in the bracket.
//
// SOURCE: the slot structure below was transcribed from the official 2026 bracket
// (FIFA / Wikipedia "2026 FIFA World Cup knockout stage") and cross-checked against
// the structural invariants asserted in bracket2026.test.ts: all 12 group winners
// used once, all 12 runners-up used once, exactly 8 third-place slots, and no third
// is ever drawn against a team from its own group.
//
// ----------------------------------------------------------------------------
// FLIP-THE-SWITCH PLAN (do NOT do any of this until the knockouts are drawn):
//   1. When API-Football publishes the real Round-of-32 fixtures, VALIDATE this
//      encoded structure against them (the real matchups must match the slots
//      once group standings are known). validateAgainstFixtures() is provided.
//   2. Supply the third-place slotting. This file intentionally does NOT hardcode
//      FIFA's 495-row "combination of best thirds" table — that is the one piece
//      we won't guess. At draw time the real fixtures give the exact slotting for
//      the actual bracket; for the Monte Carlo's hypothetical worlds, source the
//      official table separately if per-world third precision is wanted.
//   3. Rewire lib/outlook/sim/worlds.ts to build R32 from group placements via
//      resolveR32() and play playFixedBracket() instead of simulateBracket().
// Until all three are done and tested, the live sim keeps using bracket.ts.
// ============================================================================

import type { ScoringMatch } from "@/lib/scoring/engine";
import { sampleKnockoutMatch } from "./match";

export type Group =
  | "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K" | "L";

/** A Round-of-32 participant, by group finishing position. */
export type SlotRef =
  | { kind: "winner"; group: Group }
  | { kind: "runnerUp"; group: Group }
  /** One of the 8 best third-placed teams; `groups` are the only groups whose
   *  third may land here (FIFA's combination table picks exactly which one). */
  | { kind: "third"; groups: Group[] };

export interface R32Slot {
  match: number; // FIFA match number (73–88)
  home: SlotRef;
  away: SlotRef;
}

const W = (group: Group): SlotRef => ({ kind: "winner", group });
const RU = (group: Group): SlotRef => ({ kind: "runnerUp", group });
const T = (...groups: Group[]): SlotRef => ({ kind: "third", groups });

/** The 16 Round-of-32 ties, by slot. Verified against invariants (see test). */
export const R32_SLOTS: readonly R32Slot[] = [
  { match: 73, home: RU("A"), away: RU("B") },
  { match: 74, home: W("E"), away: T("A", "B", "C", "D", "F") },
  { match: 75, home: W("F"), away: RU("C") },
  { match: 76, home: W("C"), away: RU("F") },
  { match: 77, home: W("I"), away: T("C", "D", "F", "G", "H") },
  { match: 78, home: RU("E"), away: RU("I") },
  { match: 79, home: W("A"), away: T("C", "E", "F", "H", "I") },
  { match: 80, home: W("L"), away: T("E", "H", "I", "J", "K") },
  { match: 81, home: W("D"), away: T("B", "E", "F", "I", "J") },
  { match: 82, home: W("G"), away: T("A", "E", "H", "I", "J") },
  { match: 83, home: RU("K"), away: RU("L") },
  { match: 84, home: W("H"), away: RU("J") },
  { match: 85, home: W("B"), away: T("E", "F", "G", "I", "J") },
  { match: 86, home: W("J"), away: RU("H") },
  { match: 87, home: W("K"), away: T("D", "E", "I", "J", "L") },
  { match: 88, home: RU("D"), away: RU("G") },
] as const;

/** A later-round tie: its two feeders are earlier match numbers. `losers` marks
 *  the third-place playoff, which takes the two semifinal losers. */
export interface TreeNode {
  match: number;
  stage: "r16" | "qf" | "sf" | "third_place" | "final";
  from: [number, number]; // feeder match numbers
  losers?: boolean; // true → takes the LOSERS of `from` (third-place playoff)
}

/** R16 → final progression (match numbers 89–104). */
export const KNOCKOUT_TREE: readonly TreeNode[] = [
  { match: 89, stage: "r16", from: [74, 77] },
  { match: 90, stage: "r16", from: [73, 75] },
  { match: 91, stage: "r16", from: [76, 78] },
  { match: 92, stage: "r16", from: [79, 80] },
  { match: 93, stage: "r16", from: [83, 84] },
  { match: 94, stage: "r16", from: [81, 82] },
  { match: 95, stage: "r16", from: [86, 88] },
  { match: 96, stage: "r16", from: [85, 87] },
  { match: 97, stage: "qf", from: [89, 90] },
  { match: 98, stage: "qf", from: [93, 94] },
  { match: 99, stage: "qf", from: [91, 92] },
  { match: 100, stage: "qf", from: [95, 96] },
  { match: 101, stage: "sf", from: [97, 98] },
  { match: 102, stage: "sf", from: [99, 100] },
  { match: 103, stage: "third_place", from: [101, 102], losers: true },
  { match: 104, stage: "final", from: [101, 102] },
] as const;

export interface ResolvedTie {
  match: number;
  home: number | null; // team id, or null if that slot's team isn't determined
  away: number | null;
}

/**
 * Resolve the 16 Round-of-32 ties to team ids from known group placements.
 * `thirdByMatch` maps a third-place slot's match number to the team id that fills
 * it — this is the deferred piece (FIFA's combination table or, at draw time, the
 * real fixtures). Any slot left unresolved comes back as null rather than guessed.
 *
 * Pure: no IO, no globals. Safe to unit-test and to call per simulated world.
 */
export function resolveR32(
  winnersByGroup: Map<Group, number>,
  runnersUpByGroup: Map<Group, number>,
  thirdByMatch: Map<number, number> = new Map(),
): ResolvedTie[] {
  const team = (ref: SlotRef, match: number): number | null => {
    if (ref.kind === "winner") return winnersByGroup.get(ref.group) ?? null;
    if (ref.kind === "runnerUp") return runnersUpByGroup.get(ref.group) ?? null;
    return thirdByMatch.get(match) ?? null; // third slot
  };
  return R32_SLOTS.map((s) => ({
    match: s.match,
    home: team(s.home, s.match),
    away: team(s.away, s.match),
  }));
}

/**
 * Validate this encoded bracket against the real Round-of-32 fixtures once they
 * exist, given the resolved group placements. Returns the match numbers whose
 * encoded slot does NOT match the real fixture's two teams — empty array = the
 * structure is confirmed correct. Use this on draw day BEFORE flipping the sim.
 *
 * `realFixtures` is a list of the actual R32 ties as unordered team-id pairs.
 */
export function validateAgainstFixtures(
  resolved: ResolvedTie[],
  realFixtures: { home: number; away: number }[],
): number[] {
  const pairKey = (a: number, b: number) => [a, b].sort((x, y) => x - y).join("-");
  const realSet = new Set(realFixtures.map((f) => pairKey(f.home, f.away)));
  const mismatches: number[] = [];
  for (const tie of resolved) {
    if (tie.home == null || tie.away == null) continue; // unresolved, skip
    if (!realSet.has(pairKey(tie.home, tie.away))) mismatches.push(tie.match);
  }
  return mismatches;
}

// ----------------------------------------------------------------------------
// FLIP-THE-SWITCH HELPERS (still dormant — imported by nothing but the test).
// At draw time these turn the real R32 fixtures into a playable fixed bracket,
// sidestepping FIFA's 495-row third-place table entirely: the published fixtures
// already encode which third went where, so we just read it off.
// ----------------------------------------------------------------------------

export type Placement = "W" | "RU" | "3rd";
export interface TeamPos { group: Group; pos: Placement; }

function slotMatches(ref: SlotRef, t: TeamPos): boolean {
  if (ref.kind === "winner") return t.pos === "W" && ref.group === t.group;
  if (ref.kind === "runnerUp") return t.pos === "RU" && ref.group === t.group;
  return t.pos === "3rd" && ref.groups.includes(t.group); // third slot
}

export interface RealTie { home: number; away: number; } // team ids, either order
export interface AssignedTie { match: number; home: number; away: number; }

/**
 * Map the real Round-of-32 fixtures onto our fixed slot tree (matches 73–88) using
 * each team's group finishing position. Returns the ties in match-number order plus
 * any fixtures that didn't fit a slot — `unmatched` MUST be empty before flipping
 * (a non-empty list means either a group isn't complete or a bracket transcription
 * error). This is also a full validation of bracket2026.ts against reality.
 */
export function assignR32ToSlots(
  realFixtures: RealTie[],
  posOf: Map<number, TeamPos>,
): { ties: AssignedTie[]; unmatched: RealTie[] } {
  const ties: AssignedTie[] = [];
  const unmatched: RealTie[] = [];
  const usedSlots = new Set<number>();
  for (const f of realFixtures) {
    const h = posOf.get(f.home);
    const a = posOf.get(f.away);
    const slot = h && a
      ? R32_SLOTS.find(
          (s) => !usedSlots.has(s.match) &&
            ((slotMatches(s.home, h) && slotMatches(s.away, a)) ||
             (slotMatches(s.home, a) && slotMatches(s.away, h))),
        )
      : undefined;
    if (!slot || !h) { unmatched.push(f); continue; }
    usedSlots.add(slot.match);
    const home = slotMatches(slot.home, h) ? f.home : f.away; // orient home = slot.home
    const away = home === f.home ? f.away : f.home;
    ties.push({ match: slot.match, home, away });
  }
  ties.sort((x, y) => x.match - y.match);
  return { ties, unmatched };
}

/**
 * Play the REAL fixed bracket for one simulated world: sample each R32 tie, then
 * advance winners (and the two semifinal losers, for the 3rd-place playoff) through
 * KNOCKOUT_TREE. Returns the simulated knockout matches in the exact ScoringMatch
 * shape the engine consumes (synthetic negative fixture ids, like the legacy sim).
 *
 * This REPLACES the strength-reseed of bracket.ts once the bracket is set: the slots
 * are fixed, so only the match outcomes vary world to world. Requires all 16 R32 ties.
 */
export function playFixedBracket(
  r32: AssignedTie[],
  ratings: Map<number, number>,
  rng: () => number,
  sampleMatch: typeof sampleKnockoutMatch = sampleKnockoutMatch,
): ScoringMatch[] {
  const rate = (id: number) => ratings.get(id) ?? -99;
  const out: ScoringMatch[] = [];
  const winnerBy = new Map<number, number>();
  const loserBy = new Map<number, number>();
  let fid = -1;

  const play = (matchNo: number, stage: ScoringMatch["stage"], home: number, away: number) => {
    const m = sampleMatch(fid--, stage, home, away, rate(home), rate(away), rng);
    out.push(m);
    winnerBy.set(matchNo, m.winnerTeamId!);
    loserBy.set(matchNo, m.winnerTeamId === home ? away : home);
  };

  for (const tie of r32) play(tie.match, "r32", tie.home, tie.away);
  for (const node of KNOCKOUT_TREE) {
    const src = node.losers ? loserBy : winnerBy;
    const home = src.get(node.from[0]);
    const away = src.get(node.from[1]);
    if (home == null || away == null) continue; // partial bracket: skip until feeders exist
    play(node.match, node.stage, home, away);
  }
  return out;
}
