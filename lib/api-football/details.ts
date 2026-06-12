// On-demand fixture detail (events timeline + team statistics) for the match
// page. Unlike the ingest client (cache: no-store, cron-driven), these calls
// ride Next's data cache with a 60s revalidate: a busy match-day crowd costs a
// handful of API calls per minute, and a dead fixture costs ~1 per minute tops.
// Failures degrade to [] — the match page renders fine without detail data.
const BASE = process.env.API_FOOTBALL_BASE_URL ?? "https://v3.football.api-sports.io";

export interface ApiEvent {
  time: { elapsed: number; extra: number | null };
  team: { id: number; name: string };
  player: { id: number | null; name: string | null };
  assist: { id: number | null; name: string | null };
  type: string; // "Goal" | "Card" | "subst" | "Var"
  detail: string; // "Normal Goal" | "Own Goal" | "Penalty" | "Yellow Card" | ...
  comments: string | null;
}

export interface ApiTeamStats {
  team: { id: number; name: string };
  statistics: { type: string; value: number | string | null }[];
}

async function cachedGet<T>(path: string): Promise<T[]> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) return [];
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { "x-apisports-key": key },
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { response?: T[] };
    return json.response ?? [];
  } catch {
    return [];
  }
}

export function getFixtureEvents(fixtureId: number): Promise<ApiEvent[]> {
  return cachedGet<ApiEvent>(`/fixtures/events?fixture=${fixtureId}`);
}

export function getFixtureStats(fixtureId: number): Promise<ApiTeamStats[]> {
  return cachedGet<ApiTeamStats>(`/fixtures/statistics?fixture=${fixtureId}`);
}
