// Shared loaders for the public views (matches, entry, rosters).
import { createClient } from "@/lib/supabase/server";
import { GOAL_BONUS_MIN_TIER } from "@/lib/tiers/labels";

export interface TeamInfo {
  id: number;
  name: string;
  flag: string;
  tier: number | null;
  goalBonus: boolean;
}

/** Map of teamId -> { name, flag, tier, goalBonus }. */
export async function loadTeamMap(): Promise<Map<number, TeamInfo>> {
  const supabase = await createClient();
  const [{ data: teams }, { data: tiers }] = await Promise.all([
    supabase.from("teams").select("id, name, flag"),
    supabase.from("tiers").select("team_id, tier_no"),
  ]);
  const tierByTeam = new Map((tiers ?? []).map((t) => [t.team_id, t.tier_no]));
  const map = new Map<number, TeamInfo>();
  for (const t of teams ?? []) {
    const tier = tierByTeam.get(t.id) ?? null;
    map.set(t.id, { id: t.id, name: t.name, flag: t.flag, tier, goalBonus: tier != null && tier >= GOAL_BONUS_MIN_TIER });
  }
  return map;
}
