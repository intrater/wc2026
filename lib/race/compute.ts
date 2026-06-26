// "The Race" — the GROUP-STAGE money race. Two prizes lock in on total points the
// moment the last group game ends: most points (group_leader) and runner-up
// (group_runner_up). We DON'T claim who's mathematically eliminated — with goal and
// upset bonuses live, the conservative ceiling can't rule anyone out, so that label is
// meaningless mid-group. Instead we show the concrete stuff: the standings, the "money
// line" (points to be in the top 2), each chaser's gap to it, and who to root for
// (own teams still playing) / hope slips (a leader's team they don't share).
// Pure + unit-tested; loader in load.ts, card in components/RaceCard.tsx.

export interface RaceTeam {
  id: number;
  name: string;
  flag: string;
  tier: number | null;
}

export interface RaceContender {
  rank: number;
  entryId: string;
  name: string;
  points: number; // current group-stage points
  gapToMoney: number; // points behind the money line (0 if currently in the top 2)
  inMoneyNow: boolean; // currently top 2
  rootFor: RaceTeam[]; // own teams with games left
  rootAgainst: (RaceTeam & { owner: string })[]; // a leader's team they don't share, still playing
}

export interface RaceData {
  leaderPrize: string; // e.g. "$405"
  runnerUpPrize: string; // e.g. "$270"
  moneyLine: number; // points of the entry currently 2nd — the cutoff to be in the money
  contenders: RaceContender[]; // all entries, by rank
  groupsEndISO: string | null;
  remainingGames: number;
}

export interface RaceInput {
  entries: { entryId: string; name: string; points: number }[];
  picksByEntry: Map<string, number[]>;
  teamsStillPlaying: Set<number>;
  teamMap: Map<number, { name: string; flag: string; tier: number | null }>;
  remainingGroupMatches: { homeTeamId: number; awayTeamId: number; kickoff: string | null }[];
  leaderPrize: string;
  runnerUpPrize: string;
}

const MAX_FOR = 5;
const MAX_AGAINST = 4;

export function buildRace(input: RaceInput): RaceData {
  const { entries, picksByEntry, teamsStillPlaying, teamMap, remainingGroupMatches } = input;

  const team = (id: number): RaceTeam => {
    const t = teamMap.get(id);
    return { id, name: t?.name ?? String(id), flag: t?.flag ?? "", tier: t?.tier ?? null };
  };
  const byTierThenName = (a: RaceTeam, b: RaceTeam) =>
    (a.tier ?? 99) - (b.tier ?? 99) || a.name.localeCompare(b.name);

  const sorted = [...entries].sort((a, b) => b.points - a.points);
  const rankByEntry = new Map<string, number>();
  sorted.forEach((e, i) => {
    const prev = sorted[i - 1];
    rankByEntry.set(e.entryId, prev && prev.points === e.points ? rankByEntry.get(prev.entryId)! : i + 1);
  });
  // Money line = the 2nd-place points total (the cutoff to be in the top-2 prizes).
  const moneyLine = sorted[1]?.points ?? sorted[0]?.points ?? 0;

  // Highest-ranked owner of each team (for the "(Mike's)" attribution in the data).
  const ownerByTeam = new Map<number, { name: string; rank: number }>();
  for (const e of sorted) {
    const rank = rankByEntry.get(e.entryId)!;
    for (const t of picksByEntry.get(e.entryId) ?? []) {
      const cur = ownerByTeam.get(t);
      if (!cur || rank < cur.rank) ownerByTeam.set(t, { name: e.name, rank });
    }
  }

  const contenders: RaceContender[] = sorted.map((e) => {
    const rank = rankByEntry.get(e.entryId)!;
    const mine = new Set(picksByEntry.get(e.entryId) ?? []);

    const rootFor = [...mine]
      .filter((t) => teamsStillPlaying.has(t))
      .map(team)
      .sort(byTierThenName)
      .slice(0, MAX_FOR);

    const againstIds = new Set<number>();
    for (const other of sorted) {
      if (rankByEntry.get(other.entryId)! >= rank) continue; // only those ahead
      for (const t of picksByEntry.get(other.entryId) ?? []) {
        if (!mine.has(t) && teamsStillPlaying.has(t)) againstIds.add(t);
      }
    }
    const rootAgainst = [...againstIds]
      .map((t) => ({ ...team(t), owner: ownerByTeam.get(t)?.name ?? "" }))
      .slice(0, MAX_AGAINST);

    return {
      rank,
      entryId: e.entryId,
      name: e.name,
      points: e.points,
      gapToMoney: rank <= 2 ? 0 : Math.max(0, moneyLine - e.points),
      inMoneyNow: rank <= 2,
      rootFor,
      rootAgainst,
    };
  });

  return {
    leaderPrize: input.leaderPrize,
    runnerUpPrize: input.runnerUpPrize,
    moneyLine,
    contenders,
    groupsEndISO:
      remainingGroupMatches.map((m) => m.kickoff).filter((k): k is string => !!k).sort().at(-1) ?? null,
    remainingGames: remainingGroupMatches.length,
  };
}
