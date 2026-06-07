// Daily standings snapshot (U4): freeze each entry's (total, rank) at the start of
// every ET business day so leaderboard movement and the recap have a stable baseline.
// Runs FIRST in the poll sequence — before ingest — so the baseline always predates
// any result processed that day. The single batched ignoreDuplicates upsert is both
// the once-per-day guard and the overlapping-cron guard.
import type { SupabaseClient } from "@supabase/supabase-js";
import { compareForLeaderboard } from "@/lib/scoring/engine";
import { todayBusinessDay } from "@/lib/matches/day";

export interface StandingRow {
  entryId: string;
  total: number;
  underdogTotal: number;
  upsetTotal: number;
}

export interface RankedRow extends StandingRow {
  rank: number; // canonical comparator; ties share a rank (1, 1, 3 …)
}

/** Rank with shared positions for exact ties on (total, underdog, upset). */
export function rankWithTies(rows: StandingRow[]): RankedRow[] {
  const sorted = [...rows].sort((a, b) => compareForLeaderboard(a, b));
  const out: RankedRow[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const prev = out[i - 1];
    const tiedWithPrev =
      prev !== undefined &&
      prev.total === sorted[i].total &&
      prev.underdogTotal === sorted[i].underdogTotal &&
      prev.upsetTotal === sorted[i].upsetTotal;
    out.push({ ...sorted[i], rank: tiedWithPrev ? prev.rank : i + 1 });
  }
  return out;
}

export interface Movement {
  rankDelta: number | null; // positive = climbed; null when no baseline
  pointsToday: number | null; // null when no baseline (unknown ≠ zero)
  isNew: boolean;
}

/** Movement for one entry vs its start-of-day snapshot (null snapshot = NEW). */
export function movementFor(
  current: { rank: number; total: number },
  snapshot: { rank: number; total: number } | null | undefined,
): Movement {
  if (!snapshot) return { rankDelta: null, pointsToday: null, isNew: true };
  return {
    rankDelta: snapshot.rank - current.rank,
    pointsToday: current.total - snapshot.total,
    isNew: false,
  };
}

/**
 * Write today's baseline if it doesn't exist yet (first poll of the ET day wins;
 * ignoreDuplicates makes re-runs and overlapping crons converge on the first write).
 */
export async function ensureDailySnapshot(
  admin: SupabaseClient,
  now: number = Date.now(),
): Promise<{ day: string; wrote: number }> {
  const day = todayBusinessDay(now);

  const { data: scores, error } = await admin
    .from("scores")
    .select("entry_id, total, underdog_total, upset_total");
  if (error) throw new Error(`ensureDailySnapshot: ${error.message}`);
  if (!scores || scores.length === 0) return { day, wrote: 0 };

  const ranked = rankWithTies(
    scores.map((s) => ({
      entryId: s.entry_id,
      total: Number(s.total),
      underdogTotal: Number(s.underdog_total),
      upsetTotal: Number(s.upset_total),
    })),
  );

  const rows = ranked.map((r) => ({
    entry_id: r.entryId,
    business_day: day,
    total: r.total,
    rank: r.rank,
  }));

  const { error: upErr } = await admin
    .from("daily_standings")
    .upsert(rows, { onConflict: "entry_id,business_day", ignoreDuplicates: true });
  if (upErr) throw new Error(`ensureDailySnapshot upsert: ${upErr.message}`);

  return { day, wrote: rows.length };
}
