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

/** An odds-driven "if this likely result happens, these contenders gain" scenario. */
export interface RaceScenario {
  favorite: RaceTeam;
  underdog: RaceTeam;
  winPct: number; // favorite's de-vigged win probability, 0–100
  kickoffISO: string | null;
  lifts: string[]; // first names of contenders who own the favorite, by rank
}

export interface RaceData {
  leaderPrize: string; // e.g. "$405"
  runnerUpPrize: string; // e.g. "$270"
  moneyLine: number; // points of the entry currently 2nd — the cutoff to be in the money
  contenders: RaceContender[]; // all entries, by rank
  scenarios: RaceScenario[]; // most consequential likely results, by odds
  groupsEndISO: string | null;
  remainingGames: number;
}

export interface RaceInput {
  entries: { entryId: string; name: string; points: number }[];
  picksByEntry: Map<string, number[]>;
  teamsStillPlaying: Set<number>;
  teamMap: Map<number, { name: string; flag: string; tier: number | null }>;
  /** pHome/pAway are de-vigged win probabilities (0–1) when the market has them. */
  remainingGroupMatches: {
    homeTeamId: number;
    awayTeamId: number;
    kickoff: string | null;
    pHome?: number;
    pAway?: number;
  }[];
  leaderPrize: string;
  runnerUpPrize: string;
}

const firstName = (full: string) => full.split(" ")[0];
const MAX_LIFTS = 3;

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

  // All owners of each team, in rank order (sorted is points-desc = rank-asc).
  const ownersByTeam = new Map<number, { name: string; rank: number }[]>();
  for (const e of sorted) {
    const rank = rankByEntry.get(e.entryId)!;
    for (const t of picksByEntry.get(e.entryId) ?? []) {
      (ownersByTeam.get(t) ?? ownersByTeam.set(t, []).get(t)!).push({ name: e.name, rank });
    }
  }
  const ownerByTeam = (id: number) => ownersByTeam.get(id)?.[0]; // highest-ranked owner

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
      .map((t) => ({ ...team(t), owner: ownerByTeam(t)?.name ?? "" }))
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

  // Likely scenarios: for each remaining game with odds, the favored team and the
  // contenders who gain if it wins. Rank by how high up the table the top beneficiary
  // sits (most consequential to the money first), then by likelihood.
  const scenarios: RaceScenario[] = remainingGroupMatches
    .filter((m) => m.pHome != null && m.pAway != null)
    .map((m) => {
      const homeFav = (m.pHome ?? 0) >= (m.pAway ?? 0);
      const favId = homeFav ? m.homeTeamId : m.awayTeamId;
      const dogId = homeFav ? m.awayTeamId : m.homeTeamId;
      const owners = ownersByTeam.get(favId) ?? [];
      return {
        favorite: team(favId),
        underdog: team(dogId),
        winPct: Math.round((homeFav ? m.pHome! : m.pAway!) * 100),
        kickoffISO: m.kickoff,
        lifts: owners.slice(0, MAX_LIFTS).map((o) => firstName(o.name)),
        bestRank: owners[0]?.rank ?? Infinity,
      };
    })
    .filter((s) => s.lifts.length > 0 && s.winPct >= 45) // genuine favorites only — keep it "likely"
    .sort((a, b) => a.bestRank - b.bestRank || b.winPct - a.winPct)
    .slice(0, 4)
    .map(({ bestRank: _drop, ...s }) => s);

  return {
    leaderPrize: input.leaderPrize,
    runnerUpPrize: input.runnerUpPrize,
    moneyLine,
    contenders,
    scenarios,
    groupsEndISO:
      remainingGroupMatches.map((m) => m.kickoff).filter((k): k is string => !!k).sort().at(-1) ?? null,
    remainingGames: remainingGroupMatches.length,
  };
}
