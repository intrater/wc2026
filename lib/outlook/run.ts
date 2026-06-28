// Orchestration: load → exact classify → Monte Carlo win shares → buckets + rationale → persist.
// The exact layer (💀/🔒) overrides the model at the extremes; the model grades everyone else.
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadOutlookData } from "./loadInput";
import { computeExactOutlook } from "./bounds";
import { buildRatings, applyResultAdjustments } from "./strength";
import { refreshUpcomingOdds } from "./oddsRefresh";
import { simulateWinShares } from "./sim/worlds";
import { bucketForWinShare } from "./bucket";
import { buildRationale } from "./rationale";
import { persistOutlook, type OutlookRow } from "./persist";

const N_SIMS = 10000; // ~0.8s total off the critical path; smooth buckets, minimal boundary noise
const SEED = 0x5eed1234; // constant → no run-to-run jitter

export async function runOutlook(
  admin: SupabaseClient,
): Promise<{ entries: number; sims: number; oddsFetched: number; distribution: Record<string, number> }> {
  // Best-effort: refresh live odds for imminent games before loading. A market/API hiccup
  // must not break the rating — we just fall back to the strength model for those fixtures.
  let oddsFetched = 0;
  try {
    oddsFetched = (await refreshUpcomingOdds(admin)).fetched;
  } catch {
    /* proceed with whatever odds are already cached */
  }

  const data = await loadOutlookData(admin);

  const exactById = new Map(computeExactOutlook(data.entries, data.futureByTeam).map((o) => [o.entryId, o]));
  // Strength = odds prior, repriced by results so far (a losing favorite drifts down for the
  // future games that have no live odds yet).
  const ratings = applyResultAdjustments(buildRatings(data.scoring.tierByTeam, data.oddsByTeam), data.scoring.matches);
  const winShares = simulateWinShares(
    {
      tierByTeam: data.scoring.tierByTeam,
      entries: data.scoring.entries,
      picksByEntry: data.scoring.picksByEntry,
      terminalMatches: data.scoring.matches,
      remainingGroupFixtures: data.remainingGroupFixtures,
      ratings,
      realR32: data.realR32,
      terminalWinnerByPair: data.terminalWinnerByPair,
    },
    N_SIMS,
    SEED,
  );

  const fieldSize = data.entries.length;
  const coLeaders = data.entries.filter((e) => e.currentTotal === data.leaderTotal).length;

  const rows: OutlookRow[] = data.entries.map((e) => {
    const exact = exactById.get(e.entryId)!;
    let bucket: string;
    let winShare: number | null;
    let clinched = false;

    if (exact.bucket === "no_shot") {
      bucket = "no_shot";
      winShare = 0;
    } else if (exact.bucket === "clinched") {
      bucket = "front_runner";
      winShare = 1;
      clinched = true;
    } else {
      const ws = winShares.get(e.entryId) ?? 0;
      bucket = bucketForWinShare(ws, fieldSize);
      winShare = ws;
    }

    // rationale inputs (deterministic from the same numbers)
    const picks = data.scoring.picksByEntry.get(e.entryId) ?? [];
    const alive = picks.filter((id) => {
      const f = data.futureByTeam.get(id);
      return f != null && (f.knockoutAlive || f.remainingGroupGames > 0);
    });
    let strongest: { name: string; flag: string } | null = null;
    let bestTier = Infinity;
    for (const id of alive) {
      const m = data.teamMeta.get(id);
      if (m && m.tier < bestTier) {
        bestTier = m.tier;
        strongest = { name: m.name, flag: m.flag };
      }
    }

    const rationale = buildRationale({
      bucket,
      clinched,
      winShare,
      aliveCount: alive.length,
      strongestAlive: strongest,
      gapToLeader: data.leaderTotal - e.currentTotal,
      coLeaders,
    });

    return { entry_id: e.entryId, bucket, clinched, win_share: winShare, rationale, sims: N_SIMS };
  });

  await persistOutlook(admin, rows);

  const distribution: Record<string, number> = {};
  for (const r of rows) distribution[r.bucket] = (distribution[r.bucket] ?? 0) + 1;
  return { entries: rows.length, sims: N_SIMS, oddsFetched, distribution };
}
