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
  payout_split: { champion: number; runner_up: number; group_leader: number };
  entry_fee_cents: number;
}

export interface Profile {
  user_id: string;
  email: string | null;
  display_name: string | null;
  is_admin: boolean;
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

/** Terminal match statuses that are eligible for scoring (Scoring Spec §5.5). */
export const TERMINAL_STATUSES = ["FT", "AET", "PEN", "AWD", "WO"] as const;
