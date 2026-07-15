// Loads the "Race to the Finish" knockout-money race from the DB and runs the pure builder.
// Shared by the home card and /race. Returns null when it shouldn't show yet: no scores, no
// stored money_share (outlook hasn't run), or the knockouts haven't started (no bracket teams
// eliminated/alive) — the group-stage "The Race" (load.ts) covers that phase instead.
import { createClient } from "@/lib/supabase/server";
import { loadTeamMap } from "@/lib/views/data";
import { isTerminal, isNotOccurring } from "@/lib/matches/day";
import { computeGroupPrizes } from "@/lib/leaderboard/groupPrize";
import { computePayouts, formatUsd, type PayoutSplit } from "@/lib/payouts/calc";
import { loadScoringInput } from "@/lib/scoring/persist";
import type { MatchStage } from "@/lib/db/types";
import { buildFinishRace, type FinishRaceData } from "./finish";
import { buildFinalScenarios } from "./finalScenarios";

const DEFAULT_SPLIT: PayoutSplit = { champion: 0.5, runner_up: 0.25, group_leader: 0.15, group_runner_up: 0.1 };

export async function loadFinishRace(): Promise<FinishRaceData | null> {
  const supabase = await createClient();
  const [{ data: scores }, { data: outlook }, { data: picks }, { data: ko }, { data: settings }, teamMap] =
    await Promise.all([
      supabase.from("scores").select("entry_id, total, group_stage_total, underdog_total, upset_total, entries(display_name)"),
      supabase.from("entry_outlook").select("entry_id, money_share, win_share"),
      supabase.from("picks").select("entry_id, team_id"),
      supabase
        .from("matches")
        .select("stage, status, home_team_id, away_team_id, winner_team_id")
        .not("stage", "is", null)
        .neq("stage", "group"),
      supabase.from("settings").select("payout_split").single(),
      loadTeamMap(),
    ]);

  if (!scores || scores.length === 0) return null;
  if (!outlook || outlook.every((o) => o.money_share == null)) return null; // outlook not computed yet

  // Which teams reached the knockouts and are still alive (advanced, not yet knocked out).
  const inKo = new Set<number>();
  const losers = new Set<number>();
  for (const m of ko ?? []) {
    for (const t of [m.home_team_id, m.away_team_id]) if (t != null) inKo.add(t);
    if (isTerminal(m.status) && m.winner_team_id != null) {
      for (const t of [m.home_team_id, m.away_team_id]) if (t != null && t !== m.winner_team_id) losers.add(t);
    }
  }
  if (inKo.size === 0) return null; // knockouts not published yet
  const aliveTeams = new Set([...inKo].filter((t) => !losers.has(t)));

  const nameOf = (s: (typeof scores)[number]) =>
    (s.entries as unknown as { display_name: string } | null)?.display_name ?? "—";
  const moneyByEntry = new Map(outlook.map((o) => [o.entry_id, o]));

  const entries = scores.map((s) => {
    const o = moneyByEntry.get(s.entry_id);
    return {
      entryId: s.entry_id,
      name: nameOf(s),
      total: Number(s.total),
      moneyShare: o?.money_share == null ? 0 : Number(o.money_share),
      winShare: o?.win_share == null ? 0 : Number(o.win_share),
    };
  });

  const picksByEntry = new Map<string, number[]>();
  for (const p of picks ?? []) {
    const list = picksByEntry.get(p.entry_id) ?? [];
    list.push(p.team_id);
    picksByEntry.set(p.entry_id, list);
  }

  // Already-banked group-stage prizes (frozen on group_stage_total) — a footnote on the card.
  const split = (settings?.payout_split as PayoutSplit | undefined) ?? DEFAULT_SPLIT;
  const payouts = computePayouts(scores.length, 10000, split);
  const nameById = new Map(scores.map((s) => [s.entry_id, nameOf(s)]));
  const groupPrizes = computeGroupPrizes(
    scores.map((s) => ({
      entryId: s.entry_id,
      groupStageTotal: Number(s.group_stage_total),
      underdogTotal: Number(s.underdog_total),
      upsetTotal: Number(s.upset_total),
    })),
    (ko?.length ?? 0) > 0, // group stage is complete once knockout fixtures exist
    formatUsd(payouts.groupLeaderCents),
    formatUsd(payouts.groupRunnerUpCents),
  );
  let groupWinner: string | null = null;
  let groupRunnerUp: string | null = null;
  for (const [entryId, prize] of groupPrizes) {
    if (prize.place === 1) groupWinner = nameById.get(entryId) ?? null;
    if (prize.place === 2) groupRunnerUp = nameById.get(entryId) ?? null;
  }

  const teamSimple = new Map([...teamMap].map(([id, t]) => [id, { name: t.name, flag: t.flag, tier: t.tier }]));

  const race = buildFinishRace({
    entries,
    picksByEntry,
    aliveTeams,
    teamMap: teamSimple,
    groupWinner,
    groupRunnerUp,
  });

  // End-game: when only the final (± third place) is left, replace guesswork with the exact
  // "if X wins" outcomes. buildFinalScenarios returns null until that's provably the case.
  const remaining = (ko ?? [])
    .filter(
      (m) =>
        m.stage != null && !isTerminal(m.status) && !isNotOccurring(m.status) &&
        m.home_team_id != null && m.away_team_id != null,
    )
    .map((m) => ({
      stage: m.stage as MatchStage,
      homeTeamId: m.home_team_id as number,
      awayTeamId: m.away_team_id as number,
    }));
  if (remaining.length > 0 && remaining.every((m) => m.stage === "final" || m.stage === "third_place")) {
    race.finalScenarios = buildFinalScenarios({
      scoring: await loadScoringInput(supabase),
      remaining,
      nameByEntry: nameById,
      teamMeta: teamSimple,
      championPrize: formatUsd(payouts.championCents),
      runnerUpPrize: formatUsd(payouts.runnerUpCents),
    });
  }

  return race;
}
