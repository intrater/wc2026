// Loads "The Race" data from the DB and runs the pure builder. Shared by the home
// card and the /race page. Returns null when there's nothing to show (no scores, or
// no group games left — the group-stage rooting guide naturally retires when groups end).
import { createClient } from "@/lib/supabase/server";
import { loadTeamMap } from "@/lib/views/data";
import { rankWithTies } from "@/lib/standings/snapshot";
import { isTerminal } from "@/lib/matches/day";
import { buildRace, type RaceData } from "./compute";

export async function loadRaceData(): Promise<RaceData | null> {
  const supabase = await createClient();
  const [{ data: scores }, { data: picks }, { data: matches }, { data: outlook }, teamMap] =
    await Promise.all([
      supabase
        .from("scores")
        .select("entry_id, total, underdog_total, upset_total, entries(display_name)"),
      supabase.from("picks").select("entry_id, team_id"),
      supabase.from("matches").select("status, home_team_id, away_team_id, kickoff").eq("stage", "group"),
      supabase.from("entry_outlook").select("entry_id, bucket, win_share"),
      loadTeamMap(),
    ]);

  if (!scores || scores.length === 0) return null;

  const ranked0 = rankWithTies(
    scores.map((s) => ({
      entryId: s.entry_id,
      total: Number(s.total),
      underdogTotal: Number(s.underdog_total),
      upsetTotal: Number(s.upset_total),
    })),
  );
  const nameByEntry = new Map(
    scores.map((s) => [s.entry_id, (s.entries as unknown as { display_name: string } | null)?.display_name ?? "—"]),
  );
  const ranked = ranked0.map((r) => ({
    entryId: r.entryId,
    name: nameByEntry.get(r.entryId)!,
    total: r.total,
    rank: r.rank,
  }));

  const picksByEntry = new Map<string, number[]>();
  for (const p of picks ?? []) {
    const list = picksByEntry.get(p.entry_id) ?? [];
    list.push(p.team_id);
    picksByEntry.set(p.entry_id, list);
  }

  const teamsStillPlaying = new Set<number>();
  const remainingGroupMatches: { homeTeamId: number; awayTeamId: number; kickoff: string | null }[] = [];
  for (const m of matches ?? []) {
    if (isTerminal(m.status) || m.home_team_id == null || m.away_team_id == null) continue;
    teamsStillPlaying.add(m.home_team_id);
    teamsStillPlaying.add(m.away_team_id);
    remainingGroupMatches.push({ homeTeamId: m.home_team_id, awayTeamId: m.away_team_id, kickoff: m.kickoff });
  }
  if (remainingGroupMatches.length === 0) return null; // group stage done — retire the card

  const outlookMap = new Map(
    (outlook ?? []).map((o) => [
      o.entry_id,
      { bucket: o.bucket as string, winShare: o.win_share == null ? null : Number(o.win_share) },
    ]),
  );
  const teamSimple = new Map(
    [...teamMap].map(([id, t]) => [id, { name: t.name, flag: t.flag, tier: t.tier }]),
  );

  return buildRace({
    ranked,
    outlook: outlookMap,
    picksByEntry,
    teamsStillPlaying,
    teamMap: teamSimple,
    remainingGroupMatches,
  });
}
