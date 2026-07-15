// Loads everything both outlook layers need: each entry's banked total + picks, per-team
// remaining-opportunity context (for the exact 💀/🔒 layer), the championship odds and team
// metadata (for the simulation + rationale), and the list of remaining group fixtures.
// Reuses loadScoringInput for tiers/entries/picks/terminal-matches.
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadScoringInput } from "@/lib/scoring/persist";
import { orderedGroupStandings, type ScoringInput } from "@/lib/scoring/engine";
import { isTerminal, isNotOccurring } from "@/lib/matches/day";
import type { EntryState, TeamFuture } from "./bounds";
import type { RemainingGroupFixture } from "./sim/worlds";
import { assignR32ToSlots, pairKey, type AssignedTie, type Group, type KnockoutOdds, type Placement } from "./sim/bracket2026";

const GROUP_COMPLETE_MATCHES = 6;
const KO_STAGES = new Set(["r32", "r16", "qf", "sf", "final", "third_place"]);

export interface OutlookData {
  scoring: ScoringInput; // tierByTeam, entries (submitted), picksByEntry, terminal matches
  entries: EntryState[]; // exact-layer view (with banked totals)
  futureByTeam: Map<number, TeamFuture>;
  oddsByTeam: Map<number, string | null>;
  teamMeta: Map<number, { name: string; flag: string; tier: number }>;
  remainingGroupFixtures: RemainingGroupFixture[];
  leaderTotal: number;
  // Real knockout bracket (set only once groups are complete AND all 16 R32 fixtures match
  // the encoded structure). When present, the sim plays the true bracket; else it falls back
  // to strength-reseeding. terminalWinnerByPair holds already-played knockout results.
  realR32?: AssignedTie[];
  terminalWinnerByPair: Map<string, number>;
  koOddsByPair: Map<string, KnockoutOdds>; // live 1X2 for unplayed knockout fixtures
}

export async function loadOutlookData(admin: SupabaseClient): Promise<OutlookData> {
  const scoring = await loadScoringInput(admin);

  const [scoresRes, teamsRes, tiersRes, matchesRes] = await Promise.all([
    admin.from("scores").select("entry_id, total"),
    admin.from("teams").select("id, name, flag, group_label"),
    admin.from("tiers").select("team_id, odds"),
    admin
      .from("matches")
      .select("fixture_id, stage, status, group_label, home_team_id, away_team_id, winner_team_id, odds_home, odds_draw, odds_away"),
  ]);
  for (const res of [scoresRes, teamsRes, tiersRes, matchesRes]) {
    if (res.error) throw new Error(`loadOutlookData: ${res.error.message}`);
  }

  const totalByEntry = new Map<string, number>();
  for (const s of scoresRes.data ?? []) totalByEntry.set(s.entry_id, Number(s.total));

  const groupByTeam = new Map<number, string | null>();
  const teamMeta = new Map<number, { name: string; flag: string; tier: number }>();
  for (const t of teamsRes.data ?? []) {
    groupByTeam.set(t.id, t.group_label);
    teamMeta.set(t.id, { name: t.name, flag: t.flag, tier: scoring.tierByTeam.get(t.id) ?? 12 });
  }

  const oddsByTeam = new Map<number, string | null>();
  for (const t of tiersRes.data ?? []) oddsByTeam.set(t.team_id, t.odds);

  // One pass over fixtures: group completion, remaining group games, KO losers, remaining group list.
  const terminalGroupByGroup = new Map<string, number>();
  const remainingGroupByTeam = new Map<number, number>();
  const knockoutLosers = new Set<number>();
  const advancedTeams = new Set<number>(); // the real 32 drawn into the R32 (source of truth for "alive")
  const remainingGroupFixtures: RemainingGroupFixture[] = [];
  const koOddsByPair = new Map<string, KnockoutOdds>();
  for (const m of matchesRes.data ?? []) {
    if (m.stage === "r32") {
      if (m.home_team_id != null) advancedTeams.add(m.home_team_id);
      if (m.away_team_id != null) advancedTeams.add(m.away_team_id);
    }
    if (m.stage === "group") {
      if (isTerminal(m.status)) {
        if (m.group_label) terminalGroupByGroup.set(m.group_label, (terminalGroupByGroup.get(m.group_label) ?? 0) + 1);
      } else if (!isNotOccurring(m.status)) {
        for (const id of [m.home_team_id, m.away_team_id]) {
          if (id != null) remainingGroupByTeam.set(id, (remainingGroupByTeam.get(id) ?? 0) + 1);
        }
        if (m.home_team_id != null && m.away_team_id != null) {
          const hasOdds = m.odds_home != null && m.odds_draw != null && m.odds_away != null;
          remainingGroupFixtures.push({
            fixtureId: m.fixture_id,
            groupLabel: m.group_label,
            homeTeamId: m.home_team_id,
            awayTeamId: m.away_team_id,
            odds: hasOdds ? { pHome: m.odds_home, pDraw: m.odds_draw, pAway: m.odds_away } : undefined,
          });
        }
      }
    } else if (m.stage && KO_STAGES.has(m.stage) && isTerminal(m.status)) {
      for (const id of [m.home_team_id, m.away_team_id]) {
        if (id != null && id !== m.winner_team_id) knockoutLosers.add(id);
      }
    } else if (
      m.stage && KO_STAGES.has(m.stage) && !isNotOccurring(m.status) &&
      m.home_team_id != null && m.away_team_id != null &&
      m.odds_home != null && m.odds_draw != null && m.odds_away != null
    ) {
      // Unplayed knockout fixture with cached live odds → market override for the sim.
      koOddsByPair.set(pairKey(m.home_team_id, m.away_team_id), {
        homeTeamId: m.home_team_id,
        pHome: m.odds_home,
        pDraw: m.odds_draw,
        pAway: m.odds_away,
      });
    }
  }

  const lastInGroup = new Set<number>();
  for (const ids of orderedGroupStandings(scoring.matches).values()) {
    const last = ids.at(-1);
    if (last != null) lastInGroup.add(last);
  }

  // Once the R32 is drawn, advancement is a fact: a team is alive only if it's in the real
  // bracket and hasn't lost a knockout game. Before that (group stage), fall back to the
  // last-in-group heuristic. (The old code used lastInGroup alone, which wrongly kept
  // non-advancing 3rd-place teams "alive" — they're neither KO losers nor last in group.)
  const r32Published = advancedTeams.size > 0;
  const futureByTeam = new Map<number, TeamFuture>();
  for (const [teamId, tier] of scoring.tierByTeam) {
    const group = groupByTeam.get(teamId) ?? null;
    const groupComplete = group != null && (terminalGroupByGroup.get(group) ?? 0) >= GROUP_COMPLETE_MATCHES;
    const eliminated =
      knockoutLosers.has(teamId) || (r32Published ? !advancedTeams.has(teamId) : lastInGroup.has(teamId));
    futureByTeam.set(teamId, {
      tier,
      remainingGroupGames: remainingGroupByTeam.get(teamId) ?? 0,
      groupPlacementPending: !groupComplete,
      knockoutAlive: !eliminated,
    });
  }

  const entries: EntryState[] = scoring.entries.map((e) => ({
    entryId: e.id,
    currentTotal: totalByEntry.get(e.id) ?? 0,
    teamIds: scoring.picksByEntry.get(e.id) ?? [],
  }));
  const leaderTotal = entries.reduce((max, e) => Math.max(max, e.currentTotal), 0);

  // Real knockout bracket: map the published R32 fixtures onto the encoded slot tree using
  // final group placements. Only adopt it if all 16 fixtures match cleanly (else fall back).
  const standings = orderedGroupStandings(scoring.matches);
  const posOf = new Map<number, { group: Group; pos: Placement }>();
  for (const [g, ids] of standings) {
    if (ids[0] != null) posOf.set(ids[0], { group: g as Group, pos: "W" });
    if (ids[1] != null) posOf.set(ids[1], { group: g as Group, pos: "RU" });
    if (ids[2] != null) posOf.set(ids[2], { group: g as Group, pos: "3rd" });
  }
  const r32Fixtures = (matchesRes.data ?? [])
    .filter((m) => m.stage === "r32" && m.home_team_id != null && m.away_team_id != null)
    .map((m) => ({ home: m.home_team_id as number, away: m.away_team_id as number }));
  let realR32: AssignedTie[] | undefined;
  if (r32Fixtures.length === 16) {
    const { ties, unmatched } = assignR32ToSlots(r32Fixtures, posOf);
    if (unmatched.length === 0 && ties.length === 16) realR32 = ties;
  }

  // Already-played knockout results, so the sim fixes them instead of re-simulating.
  const terminalWinnerByPair = new Map<string, number>();
  for (const m of matchesRes.data ?? []) {
    if (m.stage && KO_STAGES.has(m.stage) && isTerminal(m.status) && m.winner_team_id != null && m.home_team_id != null && m.away_team_id != null) {
      terminalWinnerByPair.set(pairKey(m.home_team_id, m.away_team_id), m.winner_team_id);
    }
  }

  return { scoring, entries, futureByTeam, oddsByTeam, teamMeta, remainingGroupFixtures, leaderTotal, realR32, terminalWinnerByPair, koOddsByPair };
}
