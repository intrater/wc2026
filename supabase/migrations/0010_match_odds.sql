-- Cached de-vigged Match Winner probabilities per fixture (2026-06-17), refreshed by the
-- /api/outlook cron for imminent games and used to sharpen the chance-to-win simulation.
-- Display/model-only; never feeds scoring. Lock-safe (nullable, no default), public-read with
-- the rest of `matches`.
alter table public.matches
  add column if not exists odds_home numeric,
  add column if not exists odds_draw numeric,
  add column if not exists odds_away numeric,
  add column if not exists odds_updated_at timestamptz;
