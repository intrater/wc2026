-- World Cup 2026 Pool — tournament mode
-- Live match state (display-only; scoring stays terminal-only), daily standings
-- snapshots (leaderboard movement baseline), and end-of-day recaps.
-- All column adds are nullable-no-default: metadata-only, lock-safe against the
-- live 3-minute poll. Plan: docs/plans/2026-06-07-001-feat-tournament-mode-plan.md

-- ---------- matches: in-progress state, separate from the scoring columns ----------
-- live_*: current score while a match is live (1H/HT/2H/ET/BT/P), from goals.* which
-- already includes extra-time goals. ht_*: halftime score. Cleared when the match goes
-- terminal (FT/AET/PEN/AWD/WO) or not-occurring (PST/CANC/ABD); kept while paused
-- (SUSP/INT). These columns are NEVER read by the scoring engine (R9).
alter table matches add column live_home_goals smallint;
alter table matches add column live_away_goals smallint;
alter table matches add column ht_home_goals   smallint;
alter table matches add column ht_away_goals   smallint;

-- ---------- daily_standings (start-of-ET-day baseline for movement) ----------
-- Written once per entry per business day by the first poll of the day, BEFORE ingest
-- (the baseline must predate any result processed that day). ignoreDuplicates upsert =
-- both the once-only guard and the overlapping-cron guard.
create table daily_standings (
  entry_id     uuid not null references entries(id) on delete cascade,
  business_day date not null,            -- America/New_York calendar date
  total        numeric not null,
  rank         integer not null,         -- canonical comparator; ties share a rank
  created_at   timestamptz not null default now(),
  primary key (entry_id, business_day)
);
create index daily_standings_day_idx on daily_standings(business_day);

-- ---------- recaps (one per completed match day) ----------
-- The business_day PK is the creation idempotency guard; narrative/emailed_at are
-- per-stage completion guards. email_log is written once by the blast winner (U9,
-- deferred) and is keyed by entry_id — never raw email addresses (this table is
-- publicly readable).
create table recaps (
  business_day    date primary key,
  stats           jsonb not null,         -- deterministic day stats (allowlisted fields only)
  narrative       text,                   -- Claude write-up; null = stats-digest fallback
  narrative_model text,
  email_log       jsonb,                  -- {sent: [entry_id], failed: [entry_id]} — U9
  created_at      timestamptz not null default now(),
  emailed_at      timestamptz             -- blast claim + completion marker (U9)
);

-- ---------- RLS ----------
alter table daily_standings enable row level security;
alter table recaps          enable row level security;

-- Public read like scores: pre-lock daily_standings rows are all-zero ties with no
-- information content, and gating on is_locked() would race the lock-flip moment on
-- opener day. Writes happen only via the service-role poll (no client policies).
create policy "daily_standings public read" on daily_standings for select using (true);
create policy "recaps public read"          on recaps          for select using (true);
