-- Match venue (0008): stadium name + host city from API-Football fixtures, shown on
-- the calendar. Stable per-fixture metadata — set on every ingest, never feeds scoring.
-- matches is publicly readable (0004), so these columns inherit that; no RLS change.
alter table public.matches
  add column if not exists venue_name text,
  add column if not exists venue_city text;
