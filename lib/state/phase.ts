// Tournament lifecycle phase (U11). Single source of truth derived from settings.
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Phase = "pre_lock" | "locked" | "complete";

export interface PhaseInfo {
  phase: Phase;
  lockAt: Date | null;
  isLocked: boolean; // locked or complete
}

export function derivePhase(
  lockAt: string | null,
  tournamentComplete: boolean,
  now: number = Date.now(),
): PhaseInfo {
  const lock = lockAt ? new Date(lockAt) : null;
  if (tournamentComplete) return { phase: "complete", lockAt: lock, isLocked: true };
  if (lock && lock.getTime() <= now) return { phase: "locked", lockAt: lock, isLocked: true };
  return { phase: "pre_lock", lockAt: lock, isLocked: false };
}

/**
 * Load the current phase from the database. Wrapped in React cache() so BottomNav +
 * page components calling it in the same request share one settings query.
 */
export const getPhase = cache(async (): Promise<PhaseInfo> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("settings")
    .select("lock_at, tournament_complete")
    .single();
  return derivePhase(data?.lock_at ?? null, data?.tournament_complete ?? false);
});
