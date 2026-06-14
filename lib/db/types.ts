// Hand-authored domain types mirroring supabase/migrations/0001_schema.sql.
// (When the Supabase project exists, these can be regenerated via `supabase gen types`.)

export type MatchStage = "group" | "r32" | "r16" | "qf" | "sf" | "final" | "third_place";
export type MatchDecidedBy = "regulation" | "extra_time" | "penalties";
export type ScoreCategory = "result" | "group" | "goal" | "upset";

export interface Team {
  id: number;
  api_id: number | null;
  name: string;
  flag: string;
  group_label: string | null;
}

export interface Tier {
  team_id: number;
  tier_no: number; // 1..12
  odds: string | null;
}

export interface Settings {
  id: true;
  lock_at: string | null;
  tiers_frozen_at: string | null;
  tournament_complete: boolean;
  payout_split: { champion: number; runner_up: number; group_leader: number; group_runner_up: number };
  entry_fee_cents: number;
}

export interface Profile {
  user_id: string;
  email: string | null;
  display_name: string | null;
  is_admin: boolean;
  digest_opt_in: boolean; // morning digest email subscription (0005); opt-in only
  created_at: string;
}

export interface Entry {
  id: string;
  user_id: string;
  display_name: string;
  paid: boolean;
  submitted_at: string | null;
  created_at: string;
}

export interface Pick {
  id: string;
  entry_id: string;
  tier_no: number;
  team_id: number;
}

export interface Match {
  fixture_id: number;
  stage: MatchStage | null;
  round_raw: string | null;
  group_label: string | null;
  kickoff: string | null;
  home_team_id: number | null;
  away_team_id: number | null;
  status: string;
  home_goals: number | null;
  away_goals: number | null;
  winner_team_id: number | null;
  decided_by: MatchDecidedBy | null;
  manual_override: boolean;
  needs_attention: boolean;
  updated_at: string;
  // Live display state (0003): never read by the scoring engine.
  live_home_goals: number | null;
  live_away_goals: number | null;
  ht_home_goals: number | null;
  ht_away_goals: number | null;
  /** API-Football status.elapsed minute while live (0006); display-only. */
  live_elapsed: number | null;
  /** Venue (0008): stadium name + host city from the fixture; display-only. */
  venue_name: string | null;
  venue_city: string | null;
}

export interface Score {
  entry_id: string;
  total: number;
  group_stage_total: number;
  underdog_total: number;
  upset_total: number;
  updated_at: string;
}

export interface ScoreLine {
  id: string;
  entry_id: string;
  team_id: number;
  match_id: number | null;
  points: number;
  label: string;
  category: ScoreCategory;
}

/** Start-of-ET-day standings baseline (0003); basis for leaderboard movement. */
export interface DailyStanding {
  entry_id: string;
  business_day: string; // YYYY-MM-DD (America/New_York)
  total: number;
  rank: number;
  created_at: string;
}

/** End-of-day recap (0003). stats holds allowlisted fields only — it is public. */
export interface Recap {
  business_day: string; // YYYY-MM-DD (America/New_York)
  stats: RecapStats;
  narrative: string | null;
  narrative_model: string | null;
  email_log: { sent: string[]; failed: string[] } | null; // entry_ids, never emails
  created_at: string;
  emailed_at: string | null;
}

/** Deterministic day stats — the only data the recap narrative may reference. */
export interface RecapStats {
  dayNumber: number; // Nth match day since the opener (rest days don't advance it)
  results: Array<{
    fixtureId: number;
    stage: MatchStage | null;
    groupLabel: string | null;
    home: { name: string; flag: string; goals: number } | null;
    away: { name: string; flag: string; goals: number } | null;
    decidedBy: MatchDecidedBy | null;
    postponed?: boolean;
  }>;
  entries: Array<{
    entryId: string;
    displayName: string; // truncated to 40 chars; allowlist: never paid/user_id/email
    total: number;
    pointsToday: number | null;
    rank: number;
    rankDelta: number | null; // positive = climbed
  }>;
  topGainer: string | null; // display names
  biggestFaller: string | null;
  upsets: Array<{ teamName: string; label: string; points: number }>;
  goalBonusStandouts: Array<{ teamName: string; goals: number }>;
  topThree: string[];
  /**
   * Next fixture-bearing ET day after the recapped day (not literal tomorrow —
   * rest days are skipped), so the narrative's look-ahead line can name a real
   * matchup. Public schedule data only. Absent on rows created before 0005.
   */
  lookAhead?: {
    day: string; // YYYY-MM-DD (America/New_York)
    fixtures: Array<{
      home: { name: string; flag: string } | null; // null = TBD knockout slot
      away: { name: string; flag: string } | null;
      stage: MatchStage | null;
      groupLabel: string | null;
      kickoffET: string; // e.g. "3:00 PM"
    }>;
  };
}

/** Terminal match statuses that are eligible for scoring (Scoring Spec §5.5). */
export const TERMINAL_STATUSES = ["FT", "AET", "PEN", "AWD", "WO"] as const;
