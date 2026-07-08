-- "Race to the Finish" home card. The chance-to-win sim already ranks every entry in all
-- 10,000 simulated tournaments; we now also record P(finish top 2) — champion or runner-up,
-- i.e. "in the money" for the two overall prizes still in play. Nullable; the next /api/outlook
-- run backfills all rows. Read is already gated by the entry_outlook policy from 0015.
alter table entry_outlook add column if not exists money_share double precision;
