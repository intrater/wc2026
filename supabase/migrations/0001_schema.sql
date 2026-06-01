-- World Cup 2026 Pool — schema
-- All scoring is derived (recompute_scores in a later migration); these tables hold
-- source-of-truth data: teams, frozen tiers, entries, picks, ingested match results.

-- ---------- enums ----------
create type match_stage as enum ('group', 'r32', 'r16', 'qf', 'sf', 'final', 'third_place');
create type match_decided_by as enum ('regulation', 'extra_time', 'penalties');

-- ---------- teams ----------
create table teams (
  id            serial primary key,
  api_id        integer unique,          -- API-Football team id (for ingest matching)
  name          text not null,
  flag          text not null default '',-- emoji flag (UX2)
  group_label   text                      -- 'A'..'L', set from the draw
);

-- ---------- tiers (one row per team; 12 tiers x 4 teams) ----------
create table tiers (
  team_id   integer primary key references teams(id) on delete cascade,
  tier_no   smallint not null check (tier_no between 1 and 12),
  odds      text                          -- display string e.g. '+475', '2500-1'
);
create index tiers_tier_no_idx on tiers(tier_no);

-- ---------- settings (single row) ----------
create table settings (
  id                  boolean primary key default true check (id),
  lock_at             timestamptz,        -- picks lock at this time (tournament opener)
  tiers_frozen_at     timestamptz,        -- when the 12x4 board was frozen (irreversible)
  tournament_complete boolean not null default false,
  payout_split        jsonb not null default '{"champion":0.6,"runner_up":0.25,"group_leader":0.15}'::jsonb,
  entry_fee_cents     integer not null default 10000
);
insert into settings (id) values (true);

-- ---------- profiles (1:1 with auth.users; holds PII + admin flag) ----------
create table profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  email        text,                       -- private (RLS): never exposed publicly
  display_name text,
  is_admin     boolean not null default false,
  created_at   timestamptz not null default now()
);

-- ---------- entries (an entry into the pool; public fields only) ----------
create table entries (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  display_name  text not null,             -- public (UX1: real names on leaderboard)
  paid          boolean not null default false,
  submitted_at  timestamptz,               -- null = draft; set when all 12 picks submitted
  created_at    timestamptz not null default now()
);
create index entries_user_id_idx on entries(user_id);

-- ---------- picks (one team per tier per entry) ----------
create table picks (
  id        uuid primary key default gen_random_uuid(),
  entry_id  uuid not null references entries(id) on delete cascade,
  tier_no   smallint not null check (tier_no between 1 and 12),
  team_id   integer not null references teams(id),
  unique (entry_id, tier_no)               -- one pick per tier
);
create index picks_entry_id_idx on picks(entry_id);

-- ---------- matches (ingested results; keyed on API-Football fixture id) ----------
create table matches (
  fixture_id      bigint primary key,      -- API-Football fixture id
  stage           match_stage,             -- null until round string is mapped
  round_raw       text,                    -- original API 'round' string (audit)
  group_label     text,                    -- 'A'..'L' for group matches
  kickoff         timestamptz,
  home_team_id    integer references teams(id),
  away_team_id    integer references teams(id),
  status          text not null default 'NS', -- API short status (NS, 1H, FT, AET, PEN, PST, ...)
  home_goals      smallint,                -- counts toward goal bonus (reg + ET; excludes shootout)
  away_goals      smallint,
  winner_team_id  integer references teams(id), -- advancing/winning team; null for a group draw
  decided_by      match_decided_by,
  manual_override boolean not null default false, -- sticky: ingest skips overridden matches
  needs_attention boolean not null default false, -- unknown round / unparseable; do not score
  updated_at      timestamptz not null default now()
);
create index matches_stage_idx on matches(stage);
create index matches_group_idx on matches(group_label);

-- ---------- scores (derived; rewritten every recompute) ----------
create table scores (
  entry_id          uuid primary key references entries(id) on delete cascade,
  total             numeric not null default 0,
  group_stage_total numeric not null default 0,  -- frozen-at-end-of-group prize basis
  underdog_total    numeric not null default 0,  -- tiers 7-12 points (tiebreaker)
  upset_total       numeric not null default 0,  -- upset points (secondary tiebreaker)
  updated_at        timestamptz not null default now()
);

-- ---------- score_lines (derived; per-team/per-match breakdown for plain-English display) ----------
create table score_lines (
  id         uuid primary key default gen_random_uuid(),
  entry_id   uuid not null references entries(id) on delete cascade,
  team_id    integer not null references teams(id),
  match_id   bigint references matches(fixture_id), -- null for group-placement bonuses
  points     numeric not null,
  label      text not null,               -- e.g. 'Win', '2 goals', 'Upset (+7)'
  category   text not null                -- 'result' | 'group' | 'goal' | 'upset'
);
create index score_lines_entry_idx on score_lines(entry_id);
