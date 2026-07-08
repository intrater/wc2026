// Writes the computed outlook to the cache table (service-role). Full upsert by entry_id —
// the entry set is fixed post-lock, so there are no stale rows to prune.
import type { SupabaseClient } from "@supabase/supabase-js";

export interface OutlookRow {
  entry_id: string;
  bucket: string;
  clinched: boolean;
  win_share: number | null;
  money_share: number | null; // P(finish top 2 — champion or runner-up)
  rationale: string | null;
  sims: number;
}

export async function persistOutlook(admin: SupabaseClient, rows: OutlookRow[]): Promise<void> {
  if (rows.length === 0) return;
  const stamped = rows.map((r) => ({ ...r, computed_at: new Date().toISOString() }));
  const { error } = await admin.from("entry_outlook").upsert(stamped, { onConflict: "entry_id" });
  if (error) throw new Error(`persistOutlook: ${error.message}`);
}
