// Thin API-Football (api-sports.io) client. GET-only, single header auth.
const BASE = process.env.API_FOOTBALL_BASE_URL ?? "https://v3.football.api-sports.io";
export const WORLD_CUP_LEAGUE_ID = 1;
export const WORLD_CUP_SEASON = 2026;

export interface ApiFixture {
  fixture: { id: number; date: string; status: { short: string; elapsed: number | null } };
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

const TERMINAL = new Set(["FT", "AET", "PEN", "AWD", "WO"]);
const LIVE = new Set(["1H", "HT", "2H", "ET", "BT", "P"]);
const NOT_OCCURRING = new Set(["PST", "CANC", "ABD"]);
const PAUSED = new Set(["SUSP", "INT"]);
const UPCOMING = new Set(["TBD", "NS"]);

/**
 * Display-only live state for a fixture (U2). Never feeds scoring.
 *  - set:   match is live → current score from goals.* (already includes ET goals;
 *           never score.fulltime, which is the 90' score only) + HT score once present
 *  - clear: terminal, not-occurring (PST/CANC/ABD), or back-to-scheduled → null the columns
 *  - keep:  paused (SUSP/INT, expected to resume — last live score stays displayable)
 *           or an unknown status string (don't touch data we don't understand)
 */
export type LiveState =
  | { action: "set"; liveHome: number; liveAway: number; htHome: number | null; htAway: number | null }
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
