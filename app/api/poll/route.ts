import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runIngest } from "@/lib/api-football/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron-driven results ingest (Vercel Cron, every 3 minutes). Authenticated by CRON_SECRET.
 * Pulls fixtures from API-Football, upserts results (skipping sticky admin overrides),
 * and recomputes scores.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const summary = await runIngest(admin);
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "ingest failed" },
      { status: 500 },
    );
  }
}
