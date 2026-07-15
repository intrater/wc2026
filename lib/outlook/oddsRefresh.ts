// Refreshes cached Match Winner odds for imminent fixtures, so the simulation uses the
// freshest market read for games about to be played (where a favorite that lost is already
// repriced). Bounded: only fixtures kicking off soon whose odds are missing or stale, capped
// per run — so after the first fill it's a handful of API calls at most. Covers group AND
// knockout fixtures — a knockout game qualifies once both teams are known (before that the
// market doesn't exist anyway).
import type { SupabaseClient } from "@supabase/supabase-js";
import { getMatchOdds } from "@/lib/api-football/client";

const WINDOW_MS = 4 * 24 * 60 * 60 * 1000; // only fixtures within the next ~4 days
const STALE_MS = 3 * 60 * 60 * 1000; // re-pull if older than 3h
const MAX_PER_RUN = 20; // safety cap on API calls per refresh

export async function refreshUpcomingOdds(
  admin: SupabaseClient,
  now: number = Date.now(),
): Promise<{ fetched: number; skipped: number }> {
  const { data, error } = await admin
    .from("matches")
    .select("fixture_id, kickoff, status, odds_updated_at, home_team_id, away_team_id");
  if (error) throw new Error(`refreshUpcomingOdds: ${error.message}`);

  const candidates = (data ?? [])
    .filter((m) => {
      if (m.home_team_id == null || m.away_team_id == null) return false; // teams not drawn yet
      if (!m.kickoff || (m.status !== "NS" && m.status !== "TBD")) return false;
      const kickoff = new Date(m.kickoff).getTime();
      if (kickoff <= now || kickoff - now > WINDOW_MS) return false; // upcoming, within window
      const age = m.odds_updated_at ? now - new Date(m.odds_updated_at).getTime() : Infinity;
      return age > STALE_MS; // missing or stale
    })
    .sort((a, b) => new Date(a.kickoff!).getTime() - new Date(b.kickoff!).getTime()); // soonest first

  let fetched = 0;
  for (const m of candidates.slice(0, MAX_PER_RUN)) {
    const odds = await getMatchOdds(m.fixture_id);
    if (!odds) continue;
    await admin
      .from("matches")
      .update({
        odds_home: odds.home,
        odds_draw: odds.draw,
        odds_away: odds.away,
        odds_updated_at: new Date(now).toISOString(),
      })
      .eq("fixture_id", m.fixture_id);
    fetched++;
  }
  return { fetched, skipped: Math.max(0, candidates.length - fetched) };
}
