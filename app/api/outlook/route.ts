import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runOutlook } from "@/lib/outlook/run";

export const dynamic = "force-dynamic";
// Phase 1 (exact labels) is fast. The Monte Carlo phase will raise this toward the 300s ceiling.
export const maxDuration = 60;

/**
 * Cron-driven recompute of the per-entry "chance to win" outlook, separate from the 3-minute
 * ingest poll so heavier future work can't threaten that load-bearing path. Authenticated by
 * CRON_SECRET. Reads the latest `scores` (kept fresh by the poll) and reclassifies every entry.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  try {
    const summary = await runOutlook(admin);
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "outlook failed" },
      { status: 500 },
    );
  }
}
