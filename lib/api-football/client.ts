// Thin API-Football (api-sports.io) client. GET-only, single header auth.
const BASE = process.env.API_FOOTBALL_BASE_URL ?? "https://v3.football.api-sports.io";
export const WORLD_CUP_LEAGUE_ID = 1;
export const WORLD_CUP_SEASON = 2026;

export interface ApiFixture {
  fixture: {
    id: number;
    date: string;
    status: { short: string; elapsed: number | null };
    venue: { id: number | null; name: string | null; city: string | null };
  };
  league: { round: string };
  teams: { home: { id: number; name: string }; away: { id: number; name: string } };
  // Current in-progress score during live play; includes ET goals, excludes shootout.
  goals: { home: number | null; away: number | null };
  score: {
    halftime: { home: number | null; away: number | null };
    fulltime: { home: number | null; away: number | null }; // 90' score only — not used for display
    extratime: { home: number | null; away: number | null };
    penalty: { home: number | null; away: number | null };
  };
}

interface ApiResponse<T> {
  errors: unknown;
  response: T[];
}

async function apiGet<T>(path: string): Promise<T[]> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error("API_FOOTBALL_KEY not set");
  const res = await fetch(`${BASE}${path}`, {
    headers: { "x-apisports-key": key },
    // results are not cached; cron polls fresh
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`API-Football ${path} -> ${res.status}`);
  const json = (await res.json()) as ApiResponse<T>;
  return json.response ?? [];
}

export function getFixtures(): Promise<ApiFixture[]> {
  return apiGet<ApiFixture>(`/fixtures?league=${WORLD_CUP_LEAGUE_ID}&season=${WORLD_CUP_SEASON}`);
}

// ---------- match-winner odds (for the chance-to-win sim) ----------
export interface MatchWinnerProbs {
  home: number;
  draw: number;
  away: number;
} // de-vigged, sum to 1

interface ApiOddsBlock {
  bookmakers?: { bets?: { name?: string; values?: { value?: string; odd?: string }[] }[] }[];
}

/**
 * Average the 1X2 implied probabilities across bookmakers, then de-vig to sum 1. Pure so the
 * aggregation is unit-testable without a live API. Returns null if no usable Match Winner market.
 */
export function aggregateMatchWinner(blocks: ApiOddsBlock[]): MatchWinnerProbs | null {
  let home = 0;
  let draw = 0;
  let away = 0;
  let n = 0;
  for (const blk of blocks) {
    for (const bk of blk.bookmakers ?? []) {
      for (const bet of bk.bets ?? []) {
        if (bet.name !== "Match Winner") continue;
        const m: Record<string, number> = {};
        for (const v of bet.values ?? []) {
          const o = Number(v.odd);
          if (v.value && o > 0) m[v.value] = 1 / o; // decimal odds → implied prob
        }
        if (m.Home && m.Draw && m.Away) {
          home += m.Home;
          draw += m.Draw;
          away += m.Away;
          n++;
        }
      }
    }
  }
  if (n === 0) return null;
  const sum = home + draw + away;
  return sum > 0 ? { home: home / sum, draw: draw / sum, away: away / sum } : null;
}

/** Fetch + aggregate the de-vigged Match Winner probabilities for one fixture (null if none). */
export async function getMatchOdds(fixtureId: number): Promise<MatchWinnerProbs | null> {
  const blocks = await apiGet<ApiOddsBlock>(`/odds?fixture=${fixtureId}&bet=1`); // bet=1 = Match Winner
  return aggregateMatchWinner(blocks);
}

export interface ApiStandingRow {
  group: string;
  team: { id: number; name: string };
}
interface ApiStandingsBlock {
  league: { standings: ApiStandingRow[][] };
}

/** Returns a flat list of { group, team } across all 12 groups. */
export async function getStandings(): Promise<ApiStandingRow[]> {
  const blocks = await apiGet<ApiStandingsBlock>(
    `/standings?league=${WORLD_CUP_LEAGUE_ID}&season=${WORLD_CUP_SEASON}`,
  );
  const rows: ApiStandingRow[] = [];
  for (const b of blocks) {
    for (const group of b.league?.standings ?? []) {
      for (const row of group) rows.push(row);
    }
  }
  return rows;
}

// Single source of truth for status buckets lives in lib/matches/day.ts —
// duplicating it here is how live scores get mis-bucketed when the API adds a code.
import {
  LIVE_STATUSES,
  TERMINAL_STATUSES,
  NOT_OCCURRING_STATUSES,
  PAUSED_STATUSES,
  UPCOMING_STATUSES,
} from "@/lib/matches/day";

const TERMINAL = new Set<string>(TERMINAL_STATUSES);
const LIVE = new Set<string>(LIVE_STATUSES);
const NOT_OCCURRING = new Set<string>(NOT_OCCURRING_STATUSES);
const PAUSED = new Set<string>(PAUSED_STATUSES);
const UPCOMING = new Set<string>(UPCOMING_STATUSES);

/**
 * Display-only live state for a fixture (U2). Never feeds scoring.
 *  - set:   match is live → current score from goals.* (already includes ET goals;
 *           never score.fulltime, which is the 90' score only) + HT score once present
 *  - clear: terminal, not-occurring (PST/CANC/ABD), or back-to-scheduled → null the columns
 *  - keep:  paused (SUSP/INT, expected to resume — last live score stays displayable)
 *           or an unknown status string (don't touch data we don't understand)
 */
export type LiveState =
  | {
      action: "set";
      liveHome: number;
      liveAway: number;
      htHome: number | null;
      htAway: number | null;
      elapsed: number | null;
    }
  | { action: "clear" }
  | { action: "keep" };

export function deriveLiveState(f: ApiFixture): LiveState {
  const status = f.fixture.status.short;
  if (LIVE.has(status)) {
    return {
      action: "set",
      liveHome: f.goals.home ?? 0,
      liveAway: f.goals.away ?? 0,
      htHome: f.score.halftime?.home ?? null,
      htAway: f.score.halftime?.away ?? null,
      elapsed: f.fixture.status.elapsed ?? null,
    };
  }
  if (TERMINAL.has(status) || NOT_OCCURRING.has(status) || UPCOMING.has(status)) {
    return { action: "clear" };
  }
  if (PAUSED.has(status)) return { action: "keep" };
  // Unknown/new status string: leave stored state alone and let ingest log it.
  return { action: "keep" };
}

export interface DerivedResult {
  homeGoals: number;
  awayGoals: number;
  winnerApiId: number | null; // advancing team; null for a group draw
  decidedBy: "regulation" | "extra_time" | "penalties";
  terminal: boolean;
}

/** Derive goals (reg+ET, excl. shootout), the advancing team, and how it was decided. */
export function deriveResult(f: ApiFixture): DerivedResult | null {
  const status = f.fixture.status.short;
  if (!TERMINAL.has(status)) return null;
  const homeGoals = f.goals.home ?? 0;
  const awayGoals = f.goals.away ?? 0;
  const pen = f.score.penalty;
  const hasShootout = pen?.home != null && pen?.away != null;
  const hasET = f.score.extratime?.home != null;

  let winnerApiId: number | null;
  let decidedBy: DerivedResult["decidedBy"] = "regulation";

  if (hasShootout) {
    decidedBy = "penalties";
    winnerApiId = (pen!.home ?? 0) > (pen!.away ?? 0) ? f.teams.home.id : f.teams.away.id;
  } else {
    if (hasET) decidedBy = "extra_time";
    if (homeGoals > awayGoals) winnerApiId = f.teams.home.id;
    else if (homeGoals < awayGoals) winnerApiId = f.teams.away.id;
    else winnerApiId = null; // group draw
  }

  return { homeGoals, awayGoals, winnerApiId, decidedBy, terminal: true };
}
