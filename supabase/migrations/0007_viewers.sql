-- Viewer role (2026-06-12): read-only pool access for people sharing an entry
-- with an entrant (e.g. a friend co-owning a team). Viewers see everything an
-- entrant sees post-lock — leaderboard, rosters, matches, digest — but have no
-- entry of their own, so they never appear on the leaderboard. Set the flag via
-- service role only (no self-serve path on purpose; the pool is invite-only).

alter table public.profiles
  add column if not exists is_viewer boolean not null default false;

create or replace function public.is_viewer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where user_id = auth.uid() and is_viewer
  );
$$;

create or replace function public.can_view_pool()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not public.is_locked() or public.is_entrant() or public.is_admin() or public.is_viewer();
$$;

-- picks checks its buckets explicitly (not via can_view_pool) — add viewers.
drop policy "picks owner or entrant post-lock read" on picks;
create policy "picks owner entrant or viewer post-lock read" on picks
  for select using (
    exists (select 1 from entries e where e.id = picks.entry_id and e.user_id = auth.uid())
    or (public.is_locked() and (public.is_entrant() or public.is_admin() or public.is_viewer()))
  );
