import type { SupabaseClient } from "@supabase/supabase-js";
import { getFixtures, getStandings, deriveResult } from "./client";
import { mapRound } from "./rounds";
import { resolveSeedName } from "./names";
import { runRecompute } from "@/lib/scoring/persist";

export interface IngestSummary {
  teamsMatched: number;
  teamsUnmatched: string[];
  matchesUpserted: number;
  skippedOverrides: number;
  unknownRounds: number;
  recompute: { entries: number; lines: number };
}

/**
 * Full ingest: reconcile teams ↔ API, sync group labels, upsert match results
 * (respecting sticky admin overrides), then recompute scores. Idempotent.
 */
export async function runIngest(admin: SupabaseClient): Promise<IngestSummary> {
  // 1) load our teams
  const { data: teams } = await admin.from("teams").select("id, name, api_id");
  const ourTeams = teams ?? [];
  const seedNames = new Set(ourTeams.map((t) => t.name));
  const idBySeedName = new Map(ourTeams.map((t) => [t.name, t.id]));

  // 2) standings → team→group + api_id reconciliation
  const standings = await getStandings();
  const ourIdByApiId = new Map<number, number>();
  const unmatched: string[] = [];
  let matched = 0;

  for (const row of standings) {
    const seed = resolveSeedName(row.team.name, seedNames);
    if (!seed) {
      unmatched.push(row.team.name);
      continue;
    }
    const ourId = idBySeedName.get(seed)!;
    ourIdByApiId.set(row.team.id, ourId);
    matched++;
    await admin.from("teams").update({ api_id: row.team.id, group_label: row.group?.replace(/^Group\s+/i, "").trim() || null }).eq("id", ourId);
  }
  // also map any teams already carrying api_id (knockouts: teams may not be in standings rows)
  for (const t of ourTeams) {
    if (t.api_id) ourIdByApiId.set(t.api_id, t.id);
  }

  // 3) fixtures → matches (skip sticky overrides)
  const { data: overridden } = await admin.from("matches").select("fixture_id").eq("manual_override", true);
  const overrideIds = new Set((overridden ?? []).map((m) => m.fixture_id));

  const fixtures = await getFixtures();
  let upserted = 0;
  let unknownRounds = 0;

  for (const f of fixtures) {
    if (overrideIds.has(f.fixture.id)) continue;

    const stage = mapRound(f.league.round);
    const homeId = ourIdByApiId.get(f.teams.home.id) ?? null;
    const awayId = ourIdByApiId.get(f.teams.away.id) ?? null;
    const result = deriveResult(f);

    const row: Record<string, unknown> = {
      fixture_id: f.fixture.id,
      stage,
      round_raw: f.league.round,
      kickoff: f.fixture.date,
      home_team_id: homeId,
      away_team_id: awayId,
      status: f.fixture.status.short,
      needs_attention: stage === null,
    };
    if (stage === null) unknownRounds++;

    // group label = home team's group (set on teams during standings sync)
    if (stage === "group" && homeId) {
      const home = ourTeams.find((t) => t.id === homeId);
      // group_label updated above; re-read not needed for upsert correctness (scoring reads matches.group_label)
      const { data: ht } = await admin.from("teams").select("group_label").eq("id", homeId).single();
      row.group_label = ht?.group_label ?? null;
      void home;
    }

    if (result) {
      row.home_goals = result.homeGoals;
      row.away_goals = result.awayGoals;
      row.winner_team_id = result.winnerApiId ? ourIdByApiId.get(result.winnerApiId) ?? null : null;
      row.decided_by = result.decidedBy;
    }

    const { error } = await admin.from("matches").upsert(row, { onConflict: "fixture_id" });
    if (!error) upserted++;
  }

  // 4) recompute
  const recompute = await runRecompute(admin);

  return {
    teamsMatched: matched,
    teamsUnmatched: [...new Set(unmatched)],
    matchesUpserted: upserted,
    skippedOverrides: overrideIds.size,
    unknownRounds,
    recompute,
  };
}
