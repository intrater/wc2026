// Exact outlook layer (Phase 1) — pure arithmetic, no model.
//
// Decides the two labels we can state as fact: 💀 No-shot (mathematically can't finish
// 1st) and 🔒 Clinched (mathematically already 1st). Everything else is "in contention"
// for the model to grade later.
//
// CORRECTNESS CONTRACT: every bound here is a *conservative over-estimate* of what a team
// can still earn. Over-estimating ceilings is safe in BOTH directions — it makes 💀 and 🔒
// fire late, never wrong. We never tell someone they're dead (or have clinched) unless it's
// true under the most optimistic remaining results.
import {
  GROUP_POINTS,
  KNOCKOUT_POINTS,
  GOAL_BONUS_PER_GOAL,
  GOAL_BONUS_MIN_TIER,
  UPSET_WIN_PER_TIER,
} from "@/lib/scoring/constants";

/** Generous per-match goal cap so the tiers-7–12 goal-bonus ceiling stays finite. */
export const MAX_GOALS_PER_MATCH = 5;

/** Max win points across a full knockout run (R32→Final): a team that wins out. */
const KNOCKOUT_WIN_SUM =
  (KNOCKOUT_POINTS.r32 ?? 0) +
  (KNOCKOUT_POINTS.r16 ?? 0) +
  (KNOCKOUT_POINTS.qf ?? 0) +
  (KNOCKOUT_POINTS.sf ?? 0) +
  (KNOCKOUT_POINTS.final ?? 0);
const KNOCKOUT_ROUNDS = 5;

export type OutlookBucket = "no_shot" | "clinched" | "in_contention";

/** Per-team remaining-opportunity context, derived from the schedule + standings. */
export interface TeamFuture {
  tier: number; // frozen tier 1..12
  remainingGroupGames: number; // group fixtures not yet played involving this team
  groupPlacementPending: boolean; // group not yet complete → the +3 won-group bonus is still live
  knockoutAlive: boolean; // could still play/win knockout matches (over-estimated)
}

/**
 * Conservative upper bound on the additional points a team can still earn.
 * Assumes the team wins every match it could still play, all the way to the final, scores
 * the capped max every match, and pulls the max possible upset every match. Collisions
 * between an entry's own teams are intentionally ignored (only inflates the bound → safe).
 */
export function maxRemainingForTeam(t: TeamFuture): number {
  const goalBonusPerGame = t.tier >= GOAL_BONUS_MIN_TIER ? MAX_GOALS_PER_MATCH * GOAL_BONUS_PER_GOAL : 0;
  // Biggest upset = beating a tier-1 side; impossible for a tier-1 team to be the underdog.
  const upsetPerGame = Math.max(0, t.tier - 1) * UPSET_WIN_PER_TIER;

  let pts = 0;
  if (t.groupPlacementPending) pts += GROUP_POINTS.winGroupBonus; // won-group (≥ advance bonus)
  pts += t.remainingGroupGames * (GROUP_POINTS.win + goalBonusPerGame + upsetPerGame);
  if (t.knockoutAlive) pts += KNOCKOUT_WIN_SUM + KNOCKOUT_ROUNDS * (goalBonusPerGame + upsetPerGame);
  return pts;
}

export interface EntryState {
  entryId: string;
  currentTotal: number; // banked points so far (a floor — can only rise)
  teamIds: number[]; // the entry's 12 picks
}

export interface ExactOutlook {
  entryId: string;
  bucket: OutlookBucket;
  clinched: boolean;
  ceiling: number; // entry's conservative max final total (for debugging/rationale)
}

/**
 * Classify every entry into no_shot / clinched / in_contention.
 *  - 💀 no_shot: even the entry's (over-estimated) ceiling can't reach the current leader's
 *    banked total. The eventual winner's total ≥ the current leader's banked total, so this
 *    is a sound elimination. Equal totals are NOT eliminated (tiebreakers could decide it).
 *  - 🔒 clinched: the entry's banked total already exceeds every rival's (over-estimated)
 *    ceiling, so it's guaranteed strictly ahead of all of them.
 */
export function computeExactOutlook(
  entries: EntryState[],
  futureByTeam: Map<number, TeamFuture>,
): ExactOutlook[] {
  const ceilingOf = (e: EntryState) =>
    e.currentTotal +
    e.teamIds.reduce((sum, id) => {
      const f = futureByTeam.get(id);
      return sum + (f ? maxRemainingForTeam(f) : 0);
    }, 0);

  const ceilings = new Map(entries.map((e) => [e.entryId, ceilingOf(e)]));
  const leaderBankedTotal = entries.reduce((max, e) => Math.max(max, e.currentTotal), 0);

  return entries.map((e) => {
    const ceiling = ceilings.get(e.entryId)!;
    if (ceiling < leaderBankedTotal) {
      return { entryId: e.entryId, bucket: "no_shot", clinched: false, ceiling };
    }
    const maxRivalCeiling = entries.reduce(
      (max, r) => (r.entryId === e.entryId ? max : Math.max(max, ceilings.get(r.entryId)!)),
      Number.NEGATIVE_INFINITY,
    );
    if (e.currentTotal > maxRivalCeiling) {
      return { entryId: e.entryId, bucket: "clinched", clinched: true, ceiling };
    }
    return { entryId: e.entryId, bucket: "in_contention", clinched: false, ceiling };
  });
}
