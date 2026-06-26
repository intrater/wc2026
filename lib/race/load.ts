// Loads the group-stage money race from the DB and runs the pure builder. Shared by
// the home card and /race. Returns null when there's nothing to show (no scores, or no
// group games left — the card retires when the group stage ends and the prizes are set).
import { createClient } from "@/lib/supabase/server";
import { loadTeamMap } from "@/lib/views/data";
import { isTerminal } from "@/lib/matches/day";
import { computePayouts, formatUsd, type PayoutSplit } from "@/lib/payouts/calc";
import { buildRace, type RaceData } from "./compute";

const DEFAULT_SPLIT: PayoutSplit = { champion: 0.5, runner_up: 0.25, group_leader: 0.15, group_runner_up: 0.1 };

export async function loadRaceData(): Promise<RaceData | null> {
  const supabase = await createClient();
  const [{ data: scores }, { data: picks }, { data: matches }, { data: settings }, { count: paidCount }, teamMap] =
    await Promise.all([
      supabase.from("scores").select("entry_id, group_stage_total, entries(display_name)"),
      supabase.from("picks").select("entry_id, team_id"),
      supabase.from("matches").select("status, home_team_id, away_team_id, kickoff").eq("stage", "group"),
      supabase.from("settings").select("entry_fee_cents, payout_split").single(),
      supabase.from("entries").select("id", { count: "exact", head: true }).eq("paid", true).not("submitted_at", "is", null),
      loadTeamMap(),
    ]);

  if (!scores || scores.length === 0) return null;

  const teamsStillPlaying = new Set<number>();
  const remainingGroupMatches: { homeTeamId: number; awayTeamId: number; kickoff: string | null }[] = [];
  for (const m of matches ?? []) {
    if (isTerminal(m.status) || m.home_team_id == null || m.away_team_id == null) continue;
    teamsStillPlaying.add(m.home_team_id);
    teamsStillPlaying.add(m.away_team_id);
    remainingGroupMatches.push({ homeTeamId: m.home_team_id, awayTeamId: m.away_team_id, kickoff: m.kickoff });
  }
  if (remainingGroupMatches.length === 0) return null; // group stage done

  const picksByEntry = new Map<string, number[]>();
  for (const p of picks ?? []) {
    const list = picksByEntry.get(p.entry_id) ?? [];
    list.push(p.team_id);
    picksByEntry.set(p.entry_id, list);
  }

  const entries = scores.map((s) => ({
    entryId: s.entry_id,
    name: (s.entries as unknown as { display_name: string } | null)?.display_name ?? "—",
    points: Number(s.group_stage_total),
  }));

  const split = (settings?.payout_split as PayoutSplit | undefined) ?? DEFAULT_SPLIT;
  const payouts = computePayouts(paidCount ?? scores.length, settings?.entry_fee_cents ?? 10000, split);

  const teamSimple = new Map([...teamMap].map(([id, t]) => [id, { name: t.name, flag: t.flag, tier: t.tier }]));

  return buildRace({
    entries,
    picksByEntry,
    teamsStillPlaying,
    teamMap: teamSimple,
    remainingGroupMatches,
    leaderPrize: formatUsd(payouts.groupLeaderCents),
    runnerUpPrize: formatUsd(payouts.groupRunnerUpCents),
  });
}
