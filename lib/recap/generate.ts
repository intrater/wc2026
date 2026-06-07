// End-of-day recap orchestration (U7). Rides the 3-minute poll with per-stage
// resume guards:
//   1. day-done + no recaps row  → insert recaps(business_day, stats)   (PK race guard)
//   2. row exists, narrative null → exactly ONE Claude attempt this poll
//   3. (U9, deferred) email blast — not implemented; emailed_at stays null
// A crash between stages self-heals on the next poll tick.
import type { SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import type { RecapStats } from "@/lib/db/types";
import { businessDayOf, isResolved, todayBusinessDay } from "@/lib/matches/day";
import { buildDayNumber, buildDayStats, type StatsMatchRow } from "./stats";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt";

const MODEL = "claude-opus-4-8";

export interface RecapStageResult {
  day: string;
  dayDone: boolean;
  created: boolean;
  narrative: "exists" | "generated" | "failed" | "skipped";
}

/**
 * Day-done (the recap may fire): today had ≥1 scheduled fixture AND every fixture on
 * today's ET business day is resolved (terminal or not-occurring). ALL of today's
 * fixtures — not just past-kickoff ones — so an evening session blocks the recap.
 * Paused (SUSP/INT) blocks until resolved. Reads only rows already in `matches`.
 */
export function isDayDone(
  todaysMatches: Array<Pick<StatsMatchRow, "status">>,
): boolean {
  if (todaysMatches.length === 0) return false;
  return todaysMatches.every((m) => isResolved(m.status));
}

export async function maybeGenerateRecap(
  admin: SupabaseClient,
  now: number = Date.now(),
): Promise<RecapStageResult> {
  const day = todayBusinessDay(now);

  // ---------- load today's fixtures + existing recap row ----------
  const [{ data: allMatches, error: mErr }, { data: existing }] = await Promise.all([
    admin
      .from("matches")
      .select(
        "fixture_id, stage, group_label, kickoff, status, home_team_id, away_team_id, home_goals, away_goals, decided_by",
      ),
    admin.from("recaps").select("business_day, narrative").eq("business_day", day).maybeSingle(),
  ]);
  if (mErr) throw new Error(`recap: ${mErr.message}`);

  const matches = (allMatches ?? []) as StatsMatchRow[];
  const todays = matches.filter((m) => m.kickoff && businessDayOf(m.kickoff) === day);
  const dayDone = isDayDone(todays);

  let created = false;

  // ---------- stage 1: create the recap row (PK race guard) ----------
  if (!existing) {
    if (!dayDone) return { day, dayDone, created, narrative: "skipped" };

    const stats = await loadAndBuildStats(admin, day, matches);
    const { error: insErr } = await admin
      .from("recaps")
      .insert({ business_day: day, stats });
    if (insErr) {
      // 23505 = unique violation: another invocation won creation — fall through.
      if (!insErr.message.includes("duplicate") && !insErr.code?.startsWith("23")) {
        throw new Error(`recap insert: ${insErr.message}`);
      }
    } else {
      created = true;
    }
  }

  // ---------- stage 2: narrative (one attempt per poll) ----------
  const { data: row } = await admin
    .from("recaps")
    .select("business_day, stats, narrative")
    .eq("business_day", day)
    .maybeSingle();
  if (!row) return { day, dayDone, created, narrative: "skipped" };
  if (row.narrative) return { day, dayDone, created, narrative: "exists" };

  const narrative = await generateNarrative(row.stats as RecapStats);
  if (narrative === null) return { day, dayDone, created, narrative: "failed" };

  await admin
    .from("recaps")
    .update({ narrative, narrative_model: MODEL })
    .eq("business_day", day)
    .is("narrative", null); // never clobber a concurrent winner

  return { day, dayDone, created, narrative: "generated" };
}

/** One Claude attempt; null on any failure (the next poll retries). */
async function generateNarrative(stats: RecapStats): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("[recap] ANTHROPIC_API_KEY not set — stats-digest fallback will render");
    return null;
  }
  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(stats) }],
    });
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return text.length > 0 ? text : null;
  } catch (e) {
    console.error("[recap] narrative generation failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

async function loadAndBuildStats(
  admin: SupabaseClient,
  day: string,
  matches: StatsMatchRow[],
): Promise<RecapStats> {
  const todaysFixtureIds = matches
    .filter((m) => m.kickoff && businessDayOf(m.kickoff) === day)
    .map((m) => m.fixture_id);

  const [{ data: teams }, { data: scores }, { data: snaps }, { data: lines }] = await Promise.all([
    admin.from("teams").select("id, name, flag"),
    // Allowlist: display_name only from entries — never paid/user_id (stats is public).
    admin
      .from("scores")
      .select("entry_id, total, underdog_total, upset_total, entries(display_name)"),
    admin.from("daily_standings").select("entry_id, total, rank").eq("business_day", day),
    todaysFixtureIds.length > 0
      ? admin
          .from("score_lines")
          .select("entry_id, team_id, match_id, points, label, category")
          .in("match_id", todaysFixtureIds)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const dayNumber = buildDayNumber(matches.map((m) => m.kickoff), day);

  return buildDayStats({
    day,
    dayNumber,
    matches,
    teams: new Map((teams ?? []).map((t) => [t.id, { id: t.id, name: t.name, flag: t.flag }])),
    entries: (scores ?? []).map((s) => ({
      entryId: s.entry_id,
      total: Number(s.total),
      underdogTotal: Number(s.underdog_total),
      upsetTotal: Number(s.upset_total),
      displayName:
        (s.entries as unknown as { display_name: string } | null)?.display_name ?? "Unknown",
    })),
    snapshots: new Map(
      (snaps ?? []).map((s) => [s.entry_id, { rank: s.rank, total: Number(s.total) }]),
    ),
    todaysLines: (lines ?? []).map((l) => ({ ...l, points: Number(l.points) })),
  });
}
