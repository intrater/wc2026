import { TIER_COUNT } from "@/lib/tiers/seed";

export interface PickMap {
  [tierNo: number]: number; // tier_no -> team_id
}

/** Tiers (1..12) still missing a pick. */
export function missingTiers(picks: PickMap): number[] {
  const missing: number[] = [];
  for (let t = 1; t <= TIER_COUNT; t++) {
    if (!picks[t]) missing.push(t);
  }
  return missing;
}

export function isComplete(picks: PickMap): boolean {
  return missingTiers(picks).length === 0;
}
