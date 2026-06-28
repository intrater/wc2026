// Loads "The Math" board — every manager, every team they took, and the exact point
// breakdown per team. Reads the SAME stored data the leaderboard uses (scores + score_lines),
// so the grid reconciles with the live standings by construction. A team's points are
// identical for everyone who owns it, so each team's breakdown is computed once (canonical).
import { createClient } from "@/lib/supabase/server";
import { loadTeamMap } from "@/lib/views/data";
import { compareForLeaderboard } from "@/lib/scoring/engine";

export type MathLine = { label: string; points: number; matchId: number | null; category: string };

export type MathTeam = {
  teamId: number;
  name: string;
  flag: string;
  tier: number | null;
  advanced: boolean; // straight from the real Round of 32 draw
  total: number;
  lines: MathLine[];
};

export type MathManager = {
  entryId: string;
  name: string;
  total: number; // stored leaderboard total
  teamSum: number; // sum of their 12 teams' points — must equal `total`
  picks: { tier: number; teamId: number }[]; // sorted by tier 1..12
};

export type MathData = {
  managers: MathManager[];
  teams: Record<number, MathTeam>;
  knockoutStarted: boolean;
  reconciles: boolean; // every manager's teamSum equals their stored total
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function loadMathData(): Promise<MathData | null> {
  const supabase = await createClient();
  const [{ data: scores }, { data: picks }, { data: tiers }, { data: r32 }, teamMap] = await Promise.all([
    supabase.from("scores").select("entry_id, total, underdog_total, upset_total, entries(display_name)"),
    supabase.from("picks").select("entry_id, team_id"),
    supabase.from("tiers").select("team_id, tier_no"),
    supabase.from("matches").select("home_team_id, away_team_id").eq("stage", "r32"),
    loadTeamMap(),
  ]);

  if (!scores || scores.length === 0) return null;

  // score_lines exceeds PostgREST's 1000-row cap once knockouts add lines — paginate.
  const rawLines: { entry_id: string; team_id: number; match_id: number | null; points: number; label: string; category: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase
      .from("score_lines")
      .select("entry_id, team_id, match_id, points, label, category")
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    rawLines.push(...data);
    if (data.length < 1000) break;
  }

  const tierByTeam = new Map((tiers ?? []).map((t) => [t.team_id, t.tier_no]));
  const advanced = new Set<number>();
  for (const m of r32 ?? []) {
    if (m.home_team_id != null) advanced.add(m.home_team_id);
    if (m.away_team_id != null) advanced.add(m.away_team_id);
  }

  // picks per manager (tier-sorted) + a representative owner per team for the canonical breakdown
  const picksByEntry = new Map<string, { tier: number; teamId: number }[]>();
  const ownerOfTeam = new Map<number, string>();
  for (const p of picks ?? []) {
    if (!ownerOfTeam.has(p.team_id)) ownerOfTeam.set(p.team_id, p.entry_id);
    const arr = picksByEntry.get(p.entry_id) ?? [];
    arr.push({ tier: tierByTeam.get(p.team_id) ?? 99, teamId: p.team_id });
    picksByEntry.set(p.entry_id, arr);
  }
  for (const arr of picksByEntry.values()) arr.sort((a, b) => a.tier - b.tier);

  // group lines by entry|team
  const linesByEntryTeam = new Map<string, MathLine[]>();
  for (const l of rawLines) {
    const k = `${l.entry_id}|${l.team_id}`;
    const arr = linesByEntryTeam.get(k) ?? [];
    arr.push({ label: l.label, points: Number(l.points), matchId: l.match_id, category: l.category });
    linesByEntryTeam.set(k, arr);
  }

  // canonical per-team breakdown (from its representative owner)
  const teams: Record<number, MathTeam> = {};
  for (const [teamId, owner] of ownerOfTeam) {
    const info = teamMap.get(teamId);
    const lines = linesByEntryTeam.get(`${owner}|${teamId}`) ?? [];
    teams[teamId] = {
      teamId,
      name: info?.name ?? String(teamId),
      flag: info?.flag ?? "",
      tier: tierByTeam.get(teamId) ?? null,
      advanced: advanced.has(teamId),
      total: r2(lines.reduce((a, l) => a + l.points, 0)),
      lines,
    };
  }

  let reconciles = true;
  const managers: MathManager[] = (scores as unknown as {
    entry_id: string;
    total: number;
    underdog_total: number;
    upset_total: number;
    entries: { display_name: string } | null;
  }[])
    .map((s) => {
      const myPicks = picksByEntry.get(s.entry_id) ?? [];
      const teamSum = r2(myPicks.reduce((a, p) => a + (teams[p.teamId]?.total ?? 0), 0));
      const total = Number(s.total);
      if (teamSum !== r2(total)) reconciles = false;
      return {
        entryId: s.entry_id,
        name: s.entries?.display_name ?? "—",
        total,
        teamSum,
        picks: myPicks,
        underdogTotal: Number(s.underdog_total ?? 0),
        upsetTotal: Number(s.upset_total ?? 0),
      };
    })
    .sort(compareForLeaderboard)
    .map(({ underdogTotal: _u, upsetTotal: _up, ...m }) => m);

  return { managers, teams, knockoutStarted: advanced.size > 0, reconciles };
}
