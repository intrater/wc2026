-- World Cup 2026 Pool — post-lock privacy
--
-- The original model made the whole app public after lock. Reversed by user
-- decision (2026-06-07): once the tournament is live, pool data is visible ONLY
-- to entrants (submitted entry) and the admin. Pre-lock behavior is unchanged —
-- the public homepage/rosters remain the signup funnel.
--
-- Left public on purpose: settings (phase detection on the login page),
-- teams/tiers (generic World Cup data + tier board, no people), matches
-- (public sports schedule — the PAGE is gated, the data isn't sensitive).
-- profiles were never public.

-- ---------- helper: does the caller hold a submitted entry? ----------
create or replace function public.is_entrant()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from entries
    where user_id = auth.uid() and submitted_at is not null
  );
$$;

-- Pool visibility: open pre-lock, entrants/admin-only once live.
create or replace function public.can_view_pool()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not public.is_locked() or public.is_entrant() or public.is_admin();
$$;

-- ---------- entries ----------
drop policy "entries public read" on entries;
create policy "entries pool read" on entries
  for select using (public.can_view_pool());

-- ---------- scores / score_lines / daily_standings / recaps ----------
drop policy "scores public read" on scores;
create policy "scores pool read" on scores
  for select using (public.can_view_pool());

drop policy "score_lines public read" on score_lines;
create policy "score_lines pool read" on score_lines
  for select using (public.can_view_pool());

drop policy "daily_standings public read" on daily_standings;
create policy "daily_standings pool read" on daily_standings
  for select using (public.can_view_pool());

drop policy "recaps public read" on recaps;
create policy "recaps pool read" on recaps
  for select using (public.can_view_pool());

-- ---------- picks: owner always; post-lock only fellow entrants/admin ----------
drop policy "picks owner or post-lock read" on picks;
create policy "picks owner or entrant post-lock read" on picks
  for select using (
    exists (select 1 from entries e where e.id = picks.entry_id and e.user_id = auth.uid())
    or (public.is_locked() and (public.is_entrant() or public.is_admin()))
  );
