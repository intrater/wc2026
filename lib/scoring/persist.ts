// Glue between the pure scoring engine and the database (service-role client).
// Idempotent: every run fully reloads inputs, recomputes, and replaces scores/score_lines.

import type { SupabaseClient } from "@supabase/supabase-js";
import { recompute, type ScoringInput, type ScoringMatch } from "./engine";
import { TERMINAL_STATUSES } from "@/lib/db/types";

type Admin = SupabaseClient;

const isTerminalStatus = (s: string) => (TERMINAL_STATUSES as readonly string[]).includes(s);

/** Load all scoring inputs from the database. */
export async function loadScoringInput(admin: Admin): Promise<ScoringInput> {
  const [tiersRes, entriesRes, picksRes, matchesRes] = await Promise.all([
    admin.from("tiers").select("team_id, tier_no"),
    admin.from("entries").select("id").not("submitted_at", "is", null),
    admin.from("picks").select("entry_id, team_id"),
    admin
      .from("matches")
      .select(
        "fixture_id, stage, group_label, home_team_id, away_team_id, home_goals, away_goals, winner_team_id, decided_by, status, needs_attention",
      ),
  ]);

  for (const res of [tiersRes, entriesRes, picksRes, matchesRes]) {
    if (res.error) throw new Error(`loadScoringInput: ${res.error.message}`);
  }

  const tierByTeam = new Map<number, number>();
  for (const t of tiersRes.data ?? []) tierByTeam.set(t.team_id, t.tier_no);

  const picksByEntry = new Map<string, number[]>();
  for (const p of picksRes.data ?? []) {
    const arr = picksByEntry.get(p.entry_id) ?? [];
    arr.push(p.team_id);
    picksByEntry.set(p.entry_id, arr);
  }

  const matches: ScoringMatch[] = (matchesRes.data ?? [])
    .filter(
      (m) =>
        m.stage != null &&
        !m.needs_attention &&
        isTerminalStatus(m.status) &&
        m.home_team_id != null &&
        m.away_team_id != null &&
        m.home_goals != null &&
        m.away_goals != null,
    )
    .map((m) => ({
      fixtureId: m.fixture_id,
      stage: m.stage,
      groupLabel: m.group_label,
      homeTeamId: m.home_team_id,
      awayTeamId: m.away_team_id,
      homeGoals: m.home_goals,
      awayGoals: m.away_goals,
      winnerTeamId: m.winner_team_id,
      decidedBy: m.decided_by,
      isTerminal: true,
    }));

  return {
    tierByTeam,
    entries: (entriesRes.data ?? []).map((e) => ({ id: e.id })),
    picksByEntry,
    matches,
  };
}

/** Replace scores + score_lines with a freshly computed set (full overwrite). */
export async function persistScores(
  admin: Admin,
  result: ReturnType<typeof recompute>,
): Promise<void> {
  // Full replace keeps the operation idempotent regardless of how often it runs.
  const delLines = await admin.from("score_lines").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (delLines.error) throw new Error(`persistScores(lines delete): ${delLines.error.message}`);

  const upsertScores = await admin.from("scores").upsert(
    result.scores.map((s) => ({
      entry_id: s.entryId,
      total: s.total,
      group_stage_total: s.groupStageTotal,
      underdog_total: s.underdogTotal,
      upset_total: s.upsetTotal,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "entry_id" },
  );
  if (upsertScores.error) throw new Error(`persistScores(scores upsert): ${upsertScores.error.message}`);

  if (result.lines.length > 0) {
    const insLines = await admin.from("score_lines").insert(
      result.lines.map((l) => ({
        entry_id: l.entryId,
        team_id: l.teamId,
        match_id: l.matchId,
        points: l.points,
        label: l.label,
        category: l.category,
      })),
    );
    if (insLines.error) throw new Error(`persistScores(lines insert): ${insLines.error.message}`);
  }
}

/** Load → recompute → persist. Safe to call after every ingest. */
export async function runRecompute(admin: Admin): Promise<{ entries: number; lines: number }> {
  const input = await loadScoringInput(admin);
  const result = recompute(input);
  await persistScores(admin, result);
  return { entries: result.scores.length, lines: result.lines.length };
}
