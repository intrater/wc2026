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

  // Source of truth for advancement: the teams actually drawn into the real Round of 32.
  // We do NOT infer this from group standings — who advanced is a fact of the tournament,
  // read straight from the published bracket (any status). Undefined until the R32 exists.
  const r32Teams = new Set<number>();
  for (const m of matchesRes.data ?? []) {
    if (m.stage === "r32") {
      if (m.home_team_id != null) r32Teams.add(m.home_team_id);
      if (m.away_team_id != null) r32Teams.add(m.away_team_id);
    }
  }
  const advancedTeams = r32Teams.size > 0 ? r32Teams : undefined;

  return {
    tierByTeam,
    entries: (entriesRes.data ?? []).map((e) => ({ id: e.id })),
    picksByEntry,
    matches,
    advancedTeams,
  };
}

/** Replace scores + score_lines with a freshly computed set (full overwrite). */
export async function persistScores(
  admin: Admin,
  result: ReturnType<typeof recompute>,
): Promise<void> {
  // scores upsert is idempotent (keyed on entry_id) — safe even if two passes overlap.
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

  // score_lines: delete-all + reinsert done ATOMICALLY in one transaction (migration 0012),
  // so two recomputes racing can't interleave into duplicate lines (sum = 2× total).
  const replace = await admin.rpc("replace_score_lines", {
    p_lines: result.lines.map((l) => ({
      entry_id: l.entryId,
      team_id: l.teamId,
      match_id: l.matchId,
      points: l.points,
      label: l.label,
      category: l.category,
    })),
  });
  if (replace.error) throw new Error(`persistScores(replace_score_lines): ${replace.error.message}`);
}

/** Load → recompute → persist. Safe to call after every ingest. */
export async function runRecompute(admin: Admin): Promise<{ entries: number; lines: number }> {
  const input = await loadScoringInput(admin);
  const result = recompute(input);
  await persistScores(admin, result);
  return { entries: result.scores.length, lines: result.lines.length };
}
