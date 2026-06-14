import type { SupabaseClient } from "@supabase/supabase-js";
import { getFixtures, getStandings, deriveResult, deriveLiveState } from "./client";
import { mapRound } from "./rounds";
import { resolveSeedName } from "./names";
import { runRecompute } from "@/lib/scoring/persist";
import {
  UPCOMING_STATUSES,
  LIVE_STATUSES,
  PAUSED_STATUSES,
  NOT_OCCURRING_STATUSES,
  TERMINAL_STATUSES,
} from "@/lib/matches/day";

/** Every status we understand; anything else gets logged so surprises are visible. */
const TERMINAL_OR_KNOWN = new Set<string>([
  ...UPCOMING_STATUSES,
  ...LIVE_STATUSES,
  ...PAUSED_STATUSES,
  ...NOT_OCCURRING_STATUSES,
  ...TERMINAL_STATUSES,
]);

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

  const matchedIds = new Set<number>();
  for (const row of standings) {
    const seed = resolveSeedName(row.team.name, seedNames);
    if (!seed) {
      unmatched.push(row.team.name);
      continue;
    }
    const ourId = idBySeedName.get(seed)!;
    ourIdByApiId.set(row.team.id, ourId);
    matchedIds.add(ourId);
    // Teams appear in multiple standings blocks (their group + the "Ranking of
    // third-placed teams" block). Only derive group_label from real group blocks,
    // or the ranking block clobbers it for whichever teams are currently 3rd.
    const update: Record<string, unknown> = { api_id: row.team.id };
    if (/^Group\s+/i.test(row.group ?? "")) {
      update.group_label = row.group!.replace(/^Group\s+/i, "").trim() || null;
    }
    await admin.from("teams").update(update).eq("id", ourId);
  }
  matched = matchedIds.size;
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
      venue_name: f.fixture.venue?.name ?? null,
      venue_city: f.fixture.venue?.city ?? null,
      home_team_id: homeId,
      away_team_id: awayId,
      status: f.fixture.status.short,
      needs_attention: stage === null,
      // Bump explicitly: the column default only fires at insert, and the calendar's
      // staleness hint reads updated_at on every poll.
      updated_at: new Date().toISOString(),
    };
    if (stage === null) unknownRounds++;

    // Display-only live state (U2): set while live, clear on terminal/not-occurring,
    // keep (omit columns) while paused or on an unknown status string.
    const liveState = deriveLiveState(f);
    if (liveState.action === "set") {
      row.live_home_goals = liveState.liveHome;
      row.live_away_goals = liveState.liveAway;
      row.ht_home_goals = liveState.htHome;
      row.ht_away_goals = liveState.htAway;
      row.live_elapsed = liveState.elapsed;
    } else if (liveState.action === "clear") {
      row.live_home_goals = null;
      row.live_away_goals = null;
      row.ht_home_goals = null;
      row.ht_away_goals = null;
      row.live_elapsed = null;
    }
    if (!TERMINAL_OR_KNOWN.has(f.fixture.status.short)) {
      console.warn(`[ingest] unknown fixture status "${f.fixture.status.short}" (fixture ${f.fixture.id})`);
    }

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
