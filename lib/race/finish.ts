// "Race to the Finish" — the KNOCKOUT-stage money race for the two overall prizes still in
// play (champion + runner-up). The group-stage prizes are already banked, so this card is
// only about the top of the final table. Numbers come from the same Monte Carlo the outlook
// badges use: money_share = P(finish top 2), win_share = P(finish 1st). Pure + unit-tested;
// loader in loadFinish.ts, card in components/RaceToFinishCard.tsx.

import type { FinalScenarios } from "./finalScenarios";

export interface FinishTeam {
  flag: string;
  name: string;
  tier: number;
}

export interface FinishContender {
  rank: number; // current board rank by total points (1 = most)
  entryId: string;
  name: string;
  total: number;
  moneyPct: number; // P(top 2), 0–100
  winPct: number; // P(1st), 0–100
  aliveTeams: FinishTeam[]; // this entry's still-alive teams, strongest tier first
  bankedGroupPrize: boolean; // already holds a group-stage prize (money locked regardless)
}

export interface FinishRaceData {
  contenders: FinishContender[]; // realistic field, by money odds
  whoToWatch: string; // one deterministic sentence on the key dynamic
  aliveCount: number; // teams still in the tournament
  inContention: number; // entries with a non-trivial shot at the money
  groupWinner: string | null; // already banked the group-stage top prize
  groupRunnerUp: string | null;
  // Exact end-game: set once only the final (± third place) remains AND the money is fully
  // determined by who wins it (finalScenarios.ts). Null/absent → show the model view only.
  finalScenarios?: FinalScenarios | null;
}

export interface FinishRaceInput {
  entries: {
    entryId: string;
    name: string;
    total: number;
    moneyShare: number; // 0–1
    winShare: number; // 0–1
  }[];
  picksByEntry: Map<string, number[]>;
  aliveTeams: Set<number>;
  teamMap: Map<number, { name: string; flag: string; tier: number | null }>;
  groupWinner: string | null;
  groupRunnerUp: string | null;
  /** How many contenders to surface on the card (rest are effectively out of the money). */
  maxContenders?: number;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
const pct = (share: number) => Math.round(share * 100);

/** A contender is "in contention" for the money once the model gives them ≥ ~1-in-50. */
const CONTENTION_THRESHOLD = 0.02;

export function buildFinishRace(input: FinishRaceInput): FinishRaceData {
  const max = input.maxContenders ?? 5;

  // Rank the whole field by current points (for the rank badge), and separately by money odds.
  const byPoints = [...input.entries].sort((a, b) => b.total - a.total);
  const rankByEntry = new Map(byPoints.map((e, i) => [e.entryId, i + 1]));

  const aliveFor = (entryId: string): FinishTeam[] =>
    (input.picksByEntry.get(entryId) ?? [])
      .filter((id) => input.aliveTeams.has(id))
      .map((id) => input.teamMap.get(id))
      .filter((t): t is { name: string; flag: string; tier: number } => t != null && t.tier != null)
      .sort((a, b) => a.tier - b.tier)
      .map((t) => ({ flag: t.flag, name: t.name, tier: t.tier }));

  // Only entries with a real, displayable shot at the money (rounds to ≥1%), best odds first.
  const ranked = [...input.entries]
    .filter((e) => e.moneyShare >= 0.005)
    .sort((a, b) => b.moneyShare - a.moneyShare || b.total - a.total);

  const contenders: FinishContender[] = ranked.slice(0, max).map((e) => ({
    rank: rankByEntry.get(e.entryId) ?? 0,
    entryId: e.entryId,
    name: e.name,
    total: e.total,
    moneyPct: pct(e.moneyShare),
    winPct: pct(e.winShare),
    aliveTeams: aliveFor(e.entryId),
    bankedGroupPrize: e.name === input.groupWinner || e.name === input.groupRunnerUp,
  }));

  const inContention = input.entries.filter((e) => e.moneyShare >= CONTENTION_THRESHOLD).length;

  return {
    contenders,
    whoToWatch: buildWhoToWatch(input, byPoints, ranked),
    aliveCount: input.aliveTeams.size,
    inContention,
    groupWinner: input.groupWinner,
    groupRunnerUp: input.groupRunnerUp,
  };
}

/**
 * One honest sentence on the key dynamic, deterministic from the numbers so it refreshes
 * every recompute. Priority: (1) a clinch, (2) the points-leader-isn't-the-favorite gap,
 * (3) a lurker climbing on volume, (4) a plain front-runner note.
 */
function buildWhoToWatch(
  input: FinishRaceInput,
  byPoints: FinishRaceInput["entries"],
  byMoney: FinishRaceInput["entries"],
): string {
  const leader = byPoints[0];
  const favorite = byMoney[0];
  if (!leader || !favorite) return "";

  // (1) Someone has all but locked the top prize.
  if (favorite.winShare >= 0.85) {
    return `${firstName(favorite.name)} has all but locked a payout — only a collapse opens the door.`;
  }

  const favAlive = (input.picksByEntry.get(favorite.entryId) ?? []).filter((id) => input.aliveTeams.has(id)).length;

  // (2) The board leader is not the model's favorite for the money.
  if (favorite.entryId !== leader.entryId && favorite.moneyShare - leaderMoney(byMoney, leader.entryId) > 0.05) {
    const leadAlive = (input.picksByEntry.get(leader.entryId) ?? []).filter((id) => input.aliveTeams.has(id)).length;
    return (
      `${firstName(leader.name)} leads on points, but ${firstName(favorite.name)} is the model's favorite for the money ` +
      `with ${favAlive} team${favAlive === 1 ? "" : "s"} still alive to ${firstName(leader.name)}'s ${leadAlive}.`
    );
  }

  // (3) A lurker: a top-money contender sitting well down the points board.
  const lurker = byMoney.find((e) => {
    const rank = byPoints.findIndex((p) => p.entryId === e.entryId) + 1;
    return rank >= 5 && e.moneyShare >= 0.15;
  });
  if (lurker) {
    const lurkAlive = (input.picksByEntry.get(lurker.entryId) ?? []).filter((id) => input.aliveTeams.has(id)).length;
    return (
      `${firstName(favorite.name)} is the favorite for the money, but watch ${firstName(lurker.name)} — ` +
      `back on points yet carrying ${lurkAlive} live teams, the most ways to climb.`
    );
  }

  // (4) Clear front-runner, no twist.
  return `${firstName(favorite.name)} is the model's favorite for the money, but nothing's settled with the bracket this tight.`;
}

const leaderMoney = (entries: FinishRaceInput["entries"], entryId: string) =>
  entries.find((e) => e.entryId === entryId)?.moneyShare ?? 0;
