-- Live match clock (display-only, same contract as the other live_* columns):
-- API-Football's fixture.status.elapsed minute, set while a match is live,
-- kept while paused, cleared on terminal/not-occurring. Never feeds scoring.
alter table public.matches
  add column if not exists live_elapsed integer;
