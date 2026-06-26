// "The Race" — a global, deterministic rooting guide for the run-in. For each
// contender still alive for 1st, it lists the teams whose results help them (their
// own picks still playing) and hurt them (picks owned by entries AHEAD of them that
// they don't share), plus the field's title odds. Pure + unit-tested; the loader
// (lib/race/load.ts) feeds it DB data, the card (components/RaceCard.tsx) renders it.

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
  total: number;
  winPct: number | null; // P(finish 1st) × 100, rounded; null when unknown
  rootFor: RaceTeam[]; // this entry's own teams with games left
  rootAgainst: (RaceTeam & { owner: string })[]; // a leader's team they don't share, still playing
}

export interface RacePivotal {
  home: RaceTeam;
  away: RaceTeam;
  kickoffISO: string | null;
  owners: number; // how many entries own one of the two teams
}

export interface RaceData {
  contenders: RaceContender[]; // alive only, in rank order
  aliveCount: number;
  eliminatedCount: number;
  groupsEndISO: string | null; // latest remaining group kickoff
  pivotal: RacePivotal | null;
  remainingGames: number;
}

export interface RaceInput {
  /** Submitted entries, already sorted with ranks assigned (ties share a rank). */
  ranked: { entryId: string; name: string; total: number; rank: number }[];
  /** entry_id → its outlook (bucket gates "alive"; winShare drives the %). */
  outlook: Map<string, { bucket: string; winShare: number | null }>;
  picksByEntry: Map<string, number[]>;
  /** Team ids with at least one game still to play. */
  teamsStillPlaying: Set<number>;
  teamMap: Map<number, { name: string; flag: string; tier: number | null }>;
  remainingGroupMatches: { homeTeamId: number; awayTeamId: number; kickoff: string | null }[];
}

const MAX_FOR = 5;
const MAX_AGAINST = 4;

export function buildRace(input: RaceInput): RaceData {
  const { ranked, outlook, picksByEntry, teamsStillPlaying, teamMap, remainingGroupMatches } = input;

  const team = (id: number): RaceTeam => {
    const t = teamMap.get(id);
    return { id, name: t?.name ?? String(id), flag: t?.flag ?? "", tier: t?.tier ?? null };
  };
  const byTierThenName = (a: RaceTeam, b: RaceTeam) =>
    (a.tier ?? 99) - (b.tier ?? 99) || a.name.localeCompare(b.name);

  // Highest-ranked owner of each team (for the "(Mike's)" attribution).
  const ownerByTeam = new Map<number, { name: string; rank: number }>();
  for (const r of ranked) {
    for (const t of picksByEntry.get(r.entryId) ?? []) {
      const cur = ownerByTeam.get(t);
      if (!cur || r.rank < cur.rank) ownerByTeam.set(t, { name: r.name, rank: r.rank });
    }
  }

  const alive = ranked.filter((r) => (outlook.get(r.entryId)?.bucket ?? "") !== "no_shot");

  const contenders: RaceContender[] = alive.map((r) => {
    const mine = new Set(picksByEntry.get(r.entryId) ?? []);
    const rootFor = [...mine]
      .filter((t) => teamsStillPlaying.has(t))
      .map(team)
      .sort(byTierThenName)
      .slice(0, MAX_FOR);

    // Teams owned by someone AHEAD of this entry, not shared, still playing — rank order
    // means the closest threats come first.
    const againstIds = new Set<number>();
    for (const other of ranked) {
      if (other.rank >= r.rank) continue;
      for (const t of picksByEntry.get(other.entryId) ?? []) {
        if (!mine.has(t) && teamsStillPlaying.has(t)) againstIds.add(t);
      }
    }
    const rootAgainst = [...againstIds]
      .map((t) => ({ ...team(t), owner: ownerByTeam.get(t)?.name ?? "" }))
      .slice(0, MAX_AGAINST);

    const ws = outlook.get(r.entryId)?.winShare;
    return {
      rank: r.rank,
      entryId: r.entryId,
      name: r.name,
      total: r.total,
      winPct: ws != null ? Math.round(ws * 100) : null,
      rootFor,
      rootAgainst,
    };
  });

  // Pivotal game: the remaining match touching the most entries' rosters.
  let pivotal: RacePivotal | null = null;
  let best = -1;
  for (const m of remainingGroupMatches) {
    let owners = 0;
    for (const r of ranked) {
      const p = picksByEntry.get(r.entryId) ?? [];
      if (p.includes(m.homeTeamId) || p.includes(m.awayTeamId)) owners++;
    }
    if (owners > best) {
      best = owners;
      pivotal = { home: team(m.homeTeamId), away: team(m.awayTeamId), kickoffISO: m.kickoff, owners };
    }
  }

  const kickoffs = remainingGroupMatches.map((m) => m.kickoff).filter((k): k is string => !!k).sort();

  return {
    contenders,
    aliveCount: alive.length,
    eliminatedCount: ranked.length - alive.length,
    groupsEndISO: kickoffs.at(-1) ?? null,
    pivotal,
    remainingGames: remainingGroupMatches.length,
  };
}
