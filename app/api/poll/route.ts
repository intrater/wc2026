import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runIngest } from "@/lib/api-football/ingest";
import { ensureDailySnapshot } from "@/lib/standings/snapshot";
import { maybeGenerateRecap } from "@/lib/recap/generate";
import { maybeSendDigest } from "@/lib/digest/send";
import { maybeAlertIntegrity } from "@/lib/monitoring/integrity";

export const dynamic = "force-dynamic";
// Recap-day passes run ingest + recompute + Claude (+ the morning email blast)
// in one invocation; normal polls still finish in seconds.
export const maxDuration = 300;

/**
 * Cron-driven tournament tick (Vercel Cron, every 3 minutes). Authenticated by CRON_SECRET.
 * Stage order is load-bearing:
 *   1. ensureDailySnapshot — BEFORE ingest, so the day's movement baseline predates
 *      any result this poll processes
 *   2. runIngest — fixtures + live state upsert, then score recompute
 *   3. maybeGenerateRecap — once the day's last match resolves
 *   4. maybeSendDigest — first poll at/after 7am ET emails yesterday's digest to
 *      opt-in subscribers; AFTER the recap stage so Claude gets a final narrative
 *      attempt before the send
 * Stages 1, 3, and 4 are wrapped so their failure can't break ingest/scoring;
 * per-stage status is reported in the response JSON so silent skips are visible
 * to the admin.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const stages: Record<string, unknown> = {};

  try {
    stages.snapshot = await ensureDailySnapshot(admin);
  } catch (e) {
    stages.snapshot = { error: e instanceof Error ? e.message : "snapshot failed" };
  }

  try {
    const summary = await runIngest(admin);
    stages.ingest = summary;
  } catch (e) {
    stages.ingest = { error: e instanceof Error ? e.message : "ingest failed" };
    // Ingest is the core stage — surface its failure as a 500 (recap is skipped).
    return NextResponse.json({ ok: false, ...stages }, { status: 500 });
  }

  try {
    stages.recap = await maybeGenerateRecap(admin);
  } catch (e) {
    stages.recap = { error: e instanceof Error ? e.message : "recap failed" };
  }

  try {
    stages.digestEmail = await maybeSendDigest(admin);
  } catch (e) {
    stages.digestEmail = { error: e instanceof Error ? e.message : "digest email failed" };
  }

  // Standings-integrity audit on the freshly-recomputed state. Emails the admin on a
  // new issue (throttled); never blocks the poll.
  try {
    stages.integrity = await maybeAlertIntegrity(admin);
  } catch (e) {
    stages.integrity = { error: e instanceof Error ? e.message : "integrity audit failed" };
  }

  return NextResponse.json({ ok: true, ...stages });
}
