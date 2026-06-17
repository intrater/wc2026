-- Per-entry "chance to win it all" outlook (2026-06-17). Derived/cached data, recomputed by
-- the /api/outlook cron and read by the leaderboard. Public-read like recaps/daily_standings;
-- service-role writes only (no write policy). Phase 1 fills `bucket` exactly
-- (no_shot/clinched/in_contention); `win_share` + `rationale` + `sims` populate in the
-- Monte Carlo phase. Never feeds scoring.
create table entry_outlook (
  entry_id    uuid primary key references entries(id) on delete cascade,
  win_share   numeric,                 -- P(finish 1st); null until modeled. 0 = no_shot, 1 = clinched
  bucket      text not null,           -- exact: no_shot|clinched|in_contention · modeled: long_shot|live|in_hunt|front_runner
  clinched    boolean not null default false,
  rationale   text,                    -- plain-English (Monte Carlo phase)
  sims        integer not null default 0,
  computed_at timestamptz not null default now()
);
alter table entry_outlook enable row level security;
create policy "entry_outlook public read" on entry_outlook for select using (true);
