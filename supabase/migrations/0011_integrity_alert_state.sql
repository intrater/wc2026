-- Throttle state for the standings-integrity alert (2026-06-20). The poll runs the
-- integrity audit every 3 minutes; this single row remembers the last alerted
-- fingerprint so the admin gets ONE email per new issue (and one when it clears),
-- not one every poll. Service-role only — no read/write policies (RLS on, deny all
-- to anon/authenticated; the service key bypasses RLS).
create table integrity_alert_state (
  id          boolean primary key default true check (id),  -- enforces a single row
  fingerprint text,                                          -- distinct sorted violation codes; null = healthy
  alerted_at  timestamptz                                    -- when the current fingerprint was last emailed
);
alter table integrity_alert_state enable row level security;

-- Seed the singleton row in the healthy state.
insert into integrity_alert_state (id, fingerprint, alerted_at) values (true, null, null);
